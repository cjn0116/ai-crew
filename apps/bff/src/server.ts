import Fastify, {type FastifyReply, type FastifyRequest} from 'fastify';
import fastifyStatic from '@fastify/static';
import {dirname, resolve} from 'node:path';
import {Readable} from 'node:stream';
import type {ReadableStream as NodeReadableStream} from 'node:stream/web';
import {fileURLToPath} from 'node:url';

import {runAiCrew as defaultRunAiCrew, type RunAiCrew} from './ai-crew-client.ts';
import {CommandValidationError, encodeCrewCommand} from './crew-commands.ts';
import {loadMattermostCredentials, type MattermostCredentials} from './credentials.ts';
import {redactSecrets} from './redaction.ts';
import {attachMattermostWebSocketProxy} from './websocket-proxy.ts';

type ServerOptions = {
  runAiCrew?: RunAiCrew;
  credentials?: () => Promise<MattermostCredentials>;
  fetchImpl?: typeof fetch;
  staticRoot?: string | false;
};

type Credential = {
  uid?: string;
  mattermost?: {email?: string};
};

const workspacePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function rejectEncodedMmGetPath(rawUrl: string | undefined) {
  if (!rawUrl) {
    return;
  }
  const queryStart = rawUrl.indexOf('?');
  const rawQuery = queryStart === -1 ? '' : rawUrl.slice(queryStart + 1);
  const path = new URLSearchParams(rawQuery).get('path');
  const pathname = path?.split('?', 1)[0];
  if (pathname && /%(?:25|2e|2f|5c)/i.test(pathname)) {
    throw new CommandValidationError('path must not contain double-encoded characters or traversal');
  }
}

function listFromData(data: unknown, key: 'projects' | 'issues'): unknown[] | undefined {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    const value = (data as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : undefined;
  }
  return undefined;
}

export function buildServer(options: ServerOptions = {}) {
  const runAiCrew = options.runAiCrew ?? defaultRunAiCrew;
  const credentials = options.credentials ?? loadMattermostCredentials;
  const fetchImpl = options.fetchImpl ?? fetch;
  const app = Fastify({logger: false});
  attachMattermostWebSocketProxy(app.server, credentials);
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('set-cookie', 'MMUSERID=ai-crew; Path=/; SameSite=Lax');
    return payload;
  });
  const staticRoot = options.staticRoot === undefined ? resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../upstream/mattermost/webapp/channels/dist',
  ) : options.staticRoot;

  app.get('/api/ai-crew/health', async () => ({ok: true, service: 'ai-crew-bff'}));

  const runCommand = async (name: string, method: string, input: unknown, rawUrl: string | undefined, requestId: string, reply: FastifyReply) => {
    try {
      if (name === 'mm-get' && method === 'GET') {
        rejectEncodedMmGetPath(rawUrl);
      }
      const encoded = encodeCrewCommand(name, method, input ?? {});
      const result = await runAiCrew(encoded.command, encoded.args);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return reply.code(502).send({ok: false, error: 'ai-crew command failed', requestId});
      }
      if (result.ok !== true && !(name === 'verify' && result.ok === false)) {
        return reply.code(502).send({ok: false, error: 'ai-crew command failed', requestId});
      }
      return {ok: true, command: encoded.command, data: redactSecrets(result)};
    } catch (error) {
      if (error instanceof CommandValidationError) {
        return reply.code(400).send({ok: false, error: error.message});
      }
      return reply.code(502).send({ok: false, error: 'ai-crew command unavailable', requestId});
    }
  };

  app.get<{Params: {name: string}; Querystring: Record<string, unknown>}>('/api/ai-crew/commands/:name', (request, reply) =>
    runCommand(request.params.name, request.method, request.query, request.raw.url, request.id, reply),
  );
  app.post<{Params: {name: string}; Body: unknown}>('/api/ai-crew/commands/:name', (request, reply) =>
    runCommand(request.params.name, request.method, request.body, request.raw.url, request.id, reply),
  );

  app.get('/api/ai-crew/me', async (_request, reply) => {
    const result = await runAiCrew('whoami');
    const credential = result.credential as Credential | undefined;
    if (!credential?.uid) {
      return reply.code(502).send({ok: false, error: 'ai-crew identity is unavailable'});
    }
    return {ok: true, user: {username: credential.uid, email: credential.mattermost?.email ?? null}};
  });

  app.get('/api/ai-crew/workspaces', async (_request, reply) => {
    const result = await runAiCrew('overview');
    if (result.ok !== true || !Array.isArray(result.multica)) {
      return reply.code(502).send({ok: false, error: 'Multica overview is unavailable'});
    }
    return {ok: true, workspaces: result.multica};
  });

  for (const resource of ['projects', 'issues'] as const) {
    app.get<{Querystring: {workspace?: string}}>(`/api/ai-crew/${resource}`, async (request, reply) => {
      const workspace = request.query.workspace;
      if (!workspace || !workspacePattern.test(workspace)) {
        return reply.code(400).send({ok: false, error: 'workspace must be a valid slug'});
      }

      const result = await runAiCrew(resource, ['--workspace', workspace]);
      const items = listFromData(result.data, resource);
      if (result.ok !== true || !items) {
        return reply.code(502).send({ok: false, error: `Multica ${resource} are unavailable`});
      }
      return {ok: true, workspace, [resource]: items};
    });
  }

  const proxyMattermost = async (request: FastifyRequest, reply: FastifyReply) => {
      const credential = await credentials();
      const url = `${credential.base.replace(/\/$/, '')}/mattermost${request.raw.url ?? ''}`;
      const headers = new Headers();
      headers.set('authorization', `Bearer ${credential.mattermostToken}`);
      for (const name of ['accept', 'content-type', 'if-none-match']) {
        const value = request.headers[name];
        if (typeof value === 'string') {
          headers.set(name, value);
        }
      }

      const hasBody = !['GET', 'HEAD'].includes(request.method) && request.body !== undefined;
      const upstream = await fetchImpl(url, {
        method: request.method,
        headers,
        body: hasBody ? JSON.stringify(request.body) : undefined,
        redirect: 'manual',
      });
      for (const name of ['cache-control', 'content-disposition', 'content-type', 'etag', 'location']) {
        const value = upstream.headers.get(name);
        if (value) {
          reply.header(name, value);
        }
      }
      const body = upstream.body ? Readable.fromWeb(upstream.body as NodeReadableStream) : null;
      return reply.code(upstream.status).send(body);
  };

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/v4/*',
    handler: proxyMattermost,
  });

  for (const path of ['/config/*', '/license/*', '/static/plugins/*', '/plugins/*']) {
    app.route({method: ['GET'], url: path, handler: proxyMattermost});
  }

  if (staticRoot) {
    void app.register(fastifyStatic, {root: staticRoot, wildcard: false});
    app.get<{Params: {'*': string}}>('/static/*', (request, reply) => {
      return reply.sendFile(request.params['*']);
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('root.html');
      }
      return reply.code(404).send({ok: false, error: 'Not found'});
    });
  }

  return app;
}

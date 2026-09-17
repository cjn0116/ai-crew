import Fastify from 'fastify';

import {runAiCrew as defaultRunAiCrew, type RunAiCrew} from './ai-crew-client.ts';
import {loadMattermostCredentials, type MattermostCredentials} from './credentials.ts';
import {attachMattermostWebSocketProxy} from './websocket-proxy.ts';

type ServerOptions = {
  runAiCrew?: RunAiCrew;
  credentials?: () => Promise<MattermostCredentials>;
  fetchImpl?: typeof fetch;
};

type Credential = {
  uid?: string;
  mattermost?: {email?: string};
};

const workspacePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

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

  app.get('/api/ai-crew/health', async () => ({ok: true, service: 'ai-crew-bff'}));

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

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/v4/*',
    handler: async (request, reply) => {
      const credential = await credentials();
      const suffix = (request.raw.url ?? '').slice('/api/v4'.length);
      const url = `${credential.base.replace(/\/$/, '')}/mattermost/api/v4${suffix}`;
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
      return reply.code(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    },
  });

  return app;
}

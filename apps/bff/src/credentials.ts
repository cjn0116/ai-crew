import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';

const defaultCache = resolve(homedir(), '.codex/skills/ai-crew/.runtime/credentials_cache.json');

export type MattermostCredentials = {
  base: string;
  mattermostToken: string;
  multicaToken?: string;
};

export async function loadMattermostCredentials(): Promise<MattermostCredentials> {
  const raw = await readFile(process.env.AI_CREW_CREDENTIALS ?? defaultCache, 'utf8');
  const cache = JSON.parse(raw) as {
    base?: unknown;
    cred?: {mattermost?: {token?: unknown}; multica?: {token?: unknown}};
  };
  const token = cache.cred?.mattermost?.token;
  if (typeof cache.base !== 'string' || typeof token !== 'string' || !token) {
    throw new Error('ai-crew Mattermost credentials are unavailable');
  }
  const multicaToken = cache.cred?.multica?.token;
  return {base: cache.base, mattermostToken: token, multicaToken: typeof multicaToken === 'string' ? multicaToken : undefined};
}

import {readFile} from 'node:fs/promises';

const defaultCache = '/Users/jingnan/.codex/skills/ai-crew/.runtime/credentials_cache.json';

export type MattermostCredentials = {
  base: string;
  mattermostToken: string;
};

export async function loadMattermostCredentials(): Promise<MattermostCredentials> {
  const raw = await readFile(process.env.AI_CREW_CREDENTIALS ?? defaultCache, 'utf8');
  const cache = JSON.parse(raw) as {
    base?: unknown;
    cred?: {mattermost?: {token?: unknown}};
  };
  const token = cache.cred?.mattermost?.token;
  if (typeof cache.base !== 'string' || typeof token !== 'string' || !token) {
    throw new Error('ai-crew Mattermost credentials are unavailable');
  }
  return {base: cache.base, mattermostToken: token};
}

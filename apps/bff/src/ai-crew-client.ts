import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const defaultPython = resolve(repositoryRoot, '.venv/bin/python');
const defaultCli = resolve(homedir(), '.codex/skills/ai-crew/scripts/ai_crew.py');

export type AiCrewCommand =
  | 'login'
  | 'fetch'
  | 'rotate'
  | 'whoami'
  | 'verify'
  | 'teams'
  | 'channels'
  | 'posts'
  | 'digest'
  | 'find-user'
  | 'say'
  | 'join'
  | 'create-team'
  | 'create-channel'
  | 'team-add'
  | 'post-delete'
  | 'channel-delete'
  | 'overview'
  | 'workspaces'
  | 'agents'
  | 'projects'
  | 'issues'
  | 'issue-new'
  | 'mm-get';
export type RunAiCrew = (command: AiCrewCommand, args?: string[]) => Promise<Record<string, unknown>>;

export const runAiCrew: RunAiCrew = async (command, args = []) => {
  const {stdout} = await execFileAsync(
    process.env.AI_CREW_PYTHON ?? defaultPython,
    [process.env.AI_CREW_CLI ?? defaultCli, command, ...args],
    {encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024},
  );
  const parsed: unknown = JSON.parse(stdout);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`ai-crew ${command} returned an invalid JSON object`);
  }
  return parsed as Record<string, unknown>;
};

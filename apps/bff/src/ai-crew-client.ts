import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const defaultPython = '/Users/jingnan/ai-crew/.venv/bin/python';
const defaultCli = '/Users/jingnan/.codex/skills/ai-crew/scripts/ai_crew.py';

export type AiCrewCommand = 'whoami' | 'overview' | 'projects' | 'issues';
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

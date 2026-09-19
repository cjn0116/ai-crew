import type {AiCrewCommand} from './ai-crew-client.ts';

const workspacePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const slugPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const usernamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const postIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type Input = Record<string, unknown>;
type Method = 'GET' | 'POST';

export class CommandValidationError extends Error {}

export type EncodedCommand = {
  command: AiCrewCommand;
  args: string[];
};

type CommandDefinition = {
  methods: readonly Method[];
  encode: (input: Input) => string[];
};

function invalid(message: string): never {
  throw new CommandValidationError(message);
}

function assertKnownFields(input: Input, allowed: readonly string[]) {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      invalid('unknown field');
    }
  }
}

function optionalString(input: Input, key: string, maxLength = 512): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0')) {
    invalid(`${key} must be a valid string`);
  }
  return value;
}

function requiredText(input: Input, key: string, maxLength = 16_384): string {
  const value = optionalString(input, key, maxLength)?.trim();
  if (!value) {
    invalid(`${key} is required`);
  }
  return value;
}

function optionalIdentifier(input: Input, key: string): string | undefined {
  const value = optionalString(input, key);
  if (value !== undefined && !identifierPattern.test(value)) {
    invalid(`${key} must be a valid identifier`);
  }
  return value;
}

function requiredIdentifier(input: Input, key: string): string {
  return optionalIdentifier(input, key) ?? invalid(`${key} is required`);
}

function optionalTarget(input: Input, key: string): string | undefined {
  const value = optionalString(input, key, 256);
  if (value !== undefined && (!value.trim() || value.trimStart().startsWith('-') || value.includes('..') || /[\\/\r\n]/.test(value))) {
    invalid(`${key} must be a valid target`);
  }
  return value;
}

function optionalFlagValue(input: Input, key: string, maxLength = 512): string | undefined {
  const value = optionalString(input, key, maxLength);
  if (value !== undefined && value.trimStart().startsWith('-')) {
    invalid(`${key} must be a valid option value`);
  }
  return value;
}

function requiredTarget(input: Input, key: string): string {
  return optionalTarget(input, key) ?? invalid(`${key} is required`);
}

function optionalWorkspace(input: Input): string {
  const workspace = optionalString(input, 'workspace') ?? 'synapse-os';
  if (!workspacePattern.test(workspace)) {
    invalid('workspace must be a valid slug');
  }
  return workspace;
}

function optionalBoolean(input: Input, key: string): boolean {
  const value = input[key];
  if (value === undefined) {
    return false;
  }
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  invalid(`${key} must be a boolean`);
}

function requiredConfirmation(input: Input) {
  if (input.confirm !== true) {
    invalid('confirm must be true');
  }
}

function optionalPositiveInteger(input: Input, key: string, maximum: number): number | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1 || numberValue > maximum) {
    invalid(`${key} must be a positive integer no greater than ${maximum}`);
  }
  return numberValue;
}

function withOption(args: string[], flag: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') {
    const encodedValue = String(value);
    if (encodedValue.trimStart().startsWith('-')) {
      args.push(`${flag}=${encodedValue}`);
      return;
    }
    args.push(flag, encodedValue);
  }
}

function assertSlug(value: string, key: string) {
  if (!slugPattern.test(value)) {
    invalid(`${key} must be a valid slug`);
  }
}

function encodeReadOnly(input: Input) {
  assertKnownFields(input, []);
  return [];
}

const commands: Record<AiCrewCommand, CommandDefinition> = {
  login: {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['token']);
      const token = optionalString(input, 'token', 4096);
      if (token !== undefined && !token.startsWith('fh_u_')) {
        invalid('token must be an fh_u_ ticket');
      }
      return token ? ['--token', token] : [];
    },
  },
  fetch: {methods: ['GET'], encode: encodeReadOnly},
  rotate: {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['confirm']);
      requiredConfirmation(input);
      return [];
    },
  },
  whoami: {methods: ['GET'], encode: encodeReadOnly},
  verify: {methods: ['GET'], encode: encodeReadOnly},
  teams: {methods: ['GET'], encode: encodeReadOnly},
  channels: {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['team']);
      const team = optionalTarget(input, 'team');
      return team ? ['--team', team] : [];
    },
  },
  posts: {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['channel', 'team', 'limit', 'pages', 'perPage', 'all', 'system']);
      const args = [requiredTarget(input, 'channel')];
      withOption(args, '--team', optionalTarget(input, 'team'));
      withOption(args, '--limit', optionalPositiveInteger(input, 'limit', 200));
      withOption(args, '--pages', optionalPositiveInteger(input, 'pages', 20));
      withOption(args, '--per-page', optionalPositiveInteger(input, 'perPage', 200));
      if (optionalBoolean(input, 'all')) args.push('--all');
      if (optionalBoolean(input, 'system')) args.push('--system');
      return args;
    },
  },
  digest: {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['team', 'perChannel', 'includeDm']);
      const args: string[] = [];
      withOption(args, '--team', optionalTarget(input, 'team'));
      withOption(args, '--per-channel', optionalPositiveInteger(input, 'perChannel', 200));
      if (optionalBoolean(input, 'includeDm')) args.push('--include-dm');
      return args;
    },
  },
  'find-user': {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['term']);
      const term = optionalString(input, 'term', 128);
      return term ? [term] : [];
    },
  },
  say: {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['channel', 'text', 'team', 'dm', 'root']);
      const channel = optionalTarget(input, 'channel');
      const dm = optionalString(input, 'dm');
      if (dm !== undefined && !usernamePattern.test(dm)) invalid('dm must be a valid username');
      if ((channel === undefined) === (dm === undefined)) invalid('provide exactly one of channel or dm');
      const args: string[] = [];
      if (dm) args.push('--dm', dm);
      withOption(args, '--team', optionalTarget(input, 'team'));
      withOption(args, '--root', optionalIdentifier(input, 'root'));
      args.push('--');
      if (channel) args.push(channel);
      args.push(requiredText(input, 'text'));
      return args;
    },
  },
  join: {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['channel', 'team']);
      const args = [requiredTarget(input, 'channel')];
      withOption(args, '--team', optionalTarget(input, 'team'));
      return args;
    },
  },
  'create-team': {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['name', 'display']);
      const name = requiredText(input, 'name', 64);
      assertSlug(name, 'name');
      const args = ['--name', name];
      withOption(args, '--display', optionalFlagValue(input, 'display', 128));
      return args;
    },
  },
  'create-channel': {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['team', 'name', 'display', 'private']);
      const name = requiredText(input, 'name', 64);
      assertSlug(name, 'name');
      const args = ['--team', requiredTarget(input, 'team'), '--name', name];
      withOption(args, '--display', optionalFlagValue(input, 'display', 128));
      if (optionalBoolean(input, 'private')) args.push('--private');
      return args;
    },
  },
  'team-add': {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['team', 'users']);
      const users = input.users;
      if (!Array.isArray(users) || users.length === 0 || users.some((user) => typeof user !== 'string' || !usernamePattern.test(user))) {
        invalid('users must be a non-empty array of usernames');
      }
      return [requiredTarget(input, 'team'), '--users', users.join(',')];
    },
  },
  'post-delete': {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['postId', 'confirm']);
      requiredConfirmation(input);
      const postId = requiredText(input, 'postId', 128);
      if (!postIdPattern.test(postId)) invalid('postId must be a valid identifier');
      return [postId];
    },
  },
  'channel-delete': {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['channel', 'team', 'confirm']);
      requiredConfirmation(input);
      const args = [requiredTarget(input, 'channel')];
      withOption(args, '--team', optionalTarget(input, 'team'));
      return [...args, '--confirm'];
    },
  },
  overview: {methods: ['GET'], encode: encodeReadOnly},
  workspaces: {methods: ['GET'], encode: encodeReadOnly},
  agents: {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['workspace']);
      return ['--workspace', optionalWorkspace(input)];
    },
  },
  projects: {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['workspace']);
      return ['--workspace', optionalWorkspace(input)];
    },
  },
  issues: {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['workspace']);
      return ['--workspace', optionalWorkspace(input)];
    },
  },
  'issue-new': {
    methods: ['POST'],
    encode(input) {
      assertKnownFields(input, ['title', 'description', 'project', 'workspace']);
      const args: string[] = [];
      withOption(args, '--description', optionalString(input, 'description', 16_384));
      withOption(args, '--project', optionalIdentifier(input, 'project'));
      args.push('--workspace', optionalWorkspace(input));
      args.push('--', requiredText(input, 'title', 512));
      return args;
    },
  },
  'mm-get': {
    methods: ['GET'],
    encode(input) {
      assertKnownFields(input, ['path']);
      const path = requiredText(input, 'path', 1024);
      const pathname = path.split('?', 1)[0];
      if (!pathname.startsWith('/api/v4/') || pathname.includes('..') || /%(?:25|2e|2f|5c)/i.test(pathname) || /[\\\r\n]/.test(path)) {
        invalid('path must be a valid Mattermost API v4 path');
      }
      return [path.slice('/api/v4'.length), '--scrub'];
    },
  },
};

export function encodeCrewCommand(name: string, method: string, input: unknown): EncodedCommand {
  const definition = Object.hasOwn(commands, name) ? commands[name as AiCrewCommand] : undefined;
  if (!definition || !definition.methods.includes(method as Method)) {
    invalid('unknown command or method');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid('command input must be a JSON object');
  }
  return {command: name as AiCrewCommand, args: definition.encode(input as Input)};
}

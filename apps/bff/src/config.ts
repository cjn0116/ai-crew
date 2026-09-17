export type Config = {
  host: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const port = Number.parseInt(env.AI_CREW_BFF_PORT ?? '4174', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('AI_CREW_BFF_PORT must be an integer between 1 and 65535');
  }

  return {
    host: env.AI_CREW_BFF_HOST ?? '127.0.0.1',
    port,
  };
}

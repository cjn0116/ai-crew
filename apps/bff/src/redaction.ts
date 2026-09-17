const secretKeys = new Set(['authorization', 'password', 'token', 'access_token', 'refresh_token']);

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        secretKeys.has(key.toLowerCase()) ? '[REDACTED]' : redactSecrets(child),
      ]),
    );
  }
  return value;
}

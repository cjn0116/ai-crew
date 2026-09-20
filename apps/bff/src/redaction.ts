const secretKeyPart = /(authorization|password|secret|ticket|token)/i;
const credentialKey = /^credentials?$/i;
const ticketValue = /(?:fh_u_|Bearer\s+)[A-Za-z0-9._-]+/gi;

function isConnectionDiagnostic(key: string, value: unknown): boolean {
  return key === 'credential_status' || (
    typeof value === 'boolean' && /^(?:mm|multica)_token$/.test(key)
  );
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        secretKeyPart.test(key) || credentialKey.test(key)
          ? isConnectionDiagnostic(key, child) ? child : '[REDACTED]'
          : redactSecrets(child),
      ]),
    );
  }
  return typeof value === 'string' ? value.replace(ticketValue, '[REDACTED]') : value;
}

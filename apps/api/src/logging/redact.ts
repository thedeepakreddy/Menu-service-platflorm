/**
 * Log redaction (security baseline D-020, docs/security/logging-and-security-baseline.md).
 *
 * Applied to every value the API logger emits. It is defence in depth: the
 * primary rule is that request headers, bodies, query strings, cookies and
 * client IPs are never passed to the logger in the first place.
 */

export const REDACTED = '[REDACTED]';

/** Object keys whose values are always replaced, at any depth (case-insensitive). */
const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|apikey|password|passwd|pwd|passphrase|secret|client[-_]?secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|session|session[-_]?id|private[-_]?key|credentials?)$/i;

/** Patterns redacted inside any string. Order matters: specific before generic. */
const STRING_RULES: [RegExp, string][] = [
  // `Bearer <token>` / `Basic <credentials>` in messages or stack traces.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, `$1 ${REDACTED}`],
  // JSON Web Tokens.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED],
  // Credentials embedded in URLs: scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, `$1${REDACTED}@`],
  // key=value / key: value pairs for secret-looking keys.
  [
    /\b(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|api[_-]?key)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/gi,
    `$1$2${REDACTED}`,
  ],
];

/** Hard cap per string so a single log entry cannot flood the log pipeline. */
export const MAX_STRING_LENGTH = 4096;
const MAX_DEPTH = 6;

export function redactString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of STRING_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out.length > MAX_STRING_LENGTH ? `${out.slice(0, MAX_STRING_LENGTH)}…[truncated]` : out;
}

/** Deep-redacts a value for logging. Never mutates its input. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[depth limit]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack === undefined ? {} : { stack: redactString(value.stack) }),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1);
  }
  return out;
}

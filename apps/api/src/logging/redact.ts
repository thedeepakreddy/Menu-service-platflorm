/**
 * Log redaction (security baseline D-020, docs/security/logging-and-security-baseline.md).
 *
 * Applied to every value the API logger emits. It is defence in depth: the
 * primary rule is that request headers, bodies, query strings, cookies and
 * client IPs are never passed to the logger in the first place. Redaction is
 * pattern-based and cannot recognise every secret or personal datum.
 *
 * Bounded cost (audit F-01). Every string is cut to SCAN_LIMIT characters
 * BEFORE any pattern runs, and every pattern is written so that the regex
 * engine does linear work on its input: a match attempt may start only at the
 * beginning of a run of the characters it consumes (negative lookbehind), and
 * every repetition is bounded. Unanchored `\b<class>+` patterns are forbidden
 * here: a `\b` matches at every punctuation mark inside a run such as
 * `a.a.a.…`, and each attempt rescanning the run made redaction quadratic.
 */

export const REDACTED = '[REDACTED]';
export const REDACTED_EMAIL = '[REDACTED_EMAIL]';

/** Hard cap per emitted string, so a single log entry cannot flood the log pipeline. */
export const MAX_STRING_LENGTH = 4096;

/**
 * Characters examined by the patterns. Larger than MAX_STRING_LENGTH so that a
 * secret starting before the output cap is still seen whole (up to the margin)
 * and redacted, rather than cut in half and partially emitted. Anything beyond
 * the output cap is discarded anyway.
 */
export const SCAN_LIMIT = MAX_STRING_LENGTH + 1024;

/** Structural bounds for objects and arrays (work per log entry stays bounded). */
export const MAX_DEPTH = 6;
export const MAX_ENTRIES = 100;

export const TRUNCATED_MARKER = '…[truncated]';

/**
 * Object keys whose values are always replaced, at any depth (case-insensitive).
 * Matched as a substring so that variants such as `x-auth-token`, `bearerToken`,
 * `DB_PASSWORD` or `aws_access_key_id` are covered too. Over-redaction is
 * acceptable in logs. `code` is deliberately absent: the API logs error codes.
 */
const SENSITIVE_KEY =
  /authorization|cookie|passw|pwd|passphrase|secret|token|api[-_]?key|apikey|access[-_]?key|session|private[-_]?key|credential|signature|bearer|jwt|^auth$|^otp$/i;

/**
 * Keys that are only treated as sensitive inside a URL query (`?code=…`,
 * `&sig=…`), where they carry OAuth codes or URL signatures; elsewhere words
 * such as "code" are ordinary.
 */
const SENSITIVE_QUERY_KEY = /^(code|sig|state|key)$/i;

/** Every pattern below must keep linear matching cost; see the module comment. */
type Rule = [RegExp, string];

/**
 * Credentials embedded in URLs: scheme://user:password@host. The password may itself
 * contain '@'; everything up to the last '@' before the host is redacted.
 */
const URL_CREDENTIALS =
  /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/?#]{1,512}@(?=[^\s/?#@]{1,255}(?:[/?#\s]|$))/gi;

const STRING_RULES: Rule[] = [
  // PEM/PGP private keys, including a key truncated before its END line.
  [
    /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----|$)/g,
    REDACTED,
  ],
  // Authorization header lines in free text: everything after the name, any scheme
  // (Bearer, Basic, Token, Digest, …), up to the end of the line. Over-redaction of
  // whatever follows on the same line is accepted.
  [
    /(?<![A-Za-z0-9_-])((?:proxy-)?authorization\\?"?[ \t]{0,8}[=:][ \t]{0,8})[^\r\n]{1,4096}/gi,
    `$1${REDACTED}`,
  ],
  // `Bearer <token>` / `Basic <credentials>`, any letter case, also URL-encoded spaces.
  [
    /(?<![A-Za-z0-9_-])(Bearer|Basic)(\s{1,8}|%20|\+)[A-Za-z0-9._~+/=-]{1,4096}/gi,
    `$1$2${REDACTED}`,
  ],
  // JSON Web Tokens.
  [
    /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,4096}\.[A-Za-z0-9_-]{5,4096}\.[A-Za-z0-9_-]{0,4096}/g,
    REDACTED,
  ],
  // Well-known prefixed credential formats: AWS key ids, GitHub, Stripe, Slack, Google API keys.
  [
    /(?<![A-Za-z0-9_-])(?:(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|[sr]k_(?:live|test)_[A-Za-z0-9]{10,255}|xox[abprs]-[A-Za-z0-9-]{10,255}|AIza[0-9A-Za-z_-]{35})(?![A-Za-z0-9_])/g,
    REDACTED,
  ],
  [URL_CREDENTIALS, `$1${REDACTED}@`],
  // E-mail addresses (personal data; Doc 01 §11, Doc 03 §19), also with URL-encoded '@'.
  [
    /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g,
    REDACTED_EMAIL,
  ],
];

/**
 * key=value, key: value and JSON "key":"value" pairs (also escaped JSON), for any
 * identifier whose name looks sensitive: `DB_PASSWORD=…`, `GITHUB_TOKEN=…`,
 * `apiToken: …`, `?code=…`. The value is matched by lookahead and is NOT consumed
 * for non-sensitive keys, so `info: password=x` still reaches the `password` pair.
 * Unquoted values are bounded to 256 characters, quoted ones to 1024, which keeps
 * the total work linear in the (already bounded) input.
 */
const KEY_VALUE =
  /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]{1,64})(\\?"?[ \t]{0,8}[=:][ \t]{0,8})(?=(\\"(?:[^"\\]|\\[^"]){0,1024}\\"|"[^"]{0,1024}"|'[^']{0,1024}'|[^\s,;&"'}\\]{1,256}))/g;

function redactKeyValues(input: string): string {
  let out = '';
  let cursor = 0;
  KEY_VALUE.lastIndex = 0;
  for (let m = KEY_VALUE.exec(input); m !== null; m = KEY_VALUE.exec(input)) {
    if (m.index < cursor) continue; // inside a value that was already redacted
    const key = m[1] ?? '';
    const separator = m[2] ?? '';
    const value = m[3] ?? '';
    const before = input.charAt(m.index - 1);
    const sensitive =
      SENSITIVE_KEY.test(key) ||
      ((before === '?' || before === '&') && SENSITIVE_QUERY_KEY.test(key));
    if (!sensitive) continue;
    out += `${input.slice(cursor, m.index)}${key}${separator}${REDACTED}`;
    cursor = m.index + key.length + separator.length + value.length;
  }
  return cursor === 0 ? input : out + input.slice(cursor);
}

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED_MARKER}`
    : value;
}

/**
 * Applies every redaction pattern to `value` without any length bound. Exported
 * so that tests can prove the patterns are linear on large inputs; production
 * code must call `redactString`, which bounds the input first.
 */
export function applyRules(value: string): string {
  let out = value;
  for (const [pattern, replacement] of STRING_RULES) {
    out = out.replace(pattern, replacement);
    // Key/value pairs run after the credential-format rules and before e-mail.
    if (pattern === URL_CREDENTIALS) out = redactKeyValues(out);
  }
  return out;
}

export function redactString(value: string): string {
  const wasCut = value.length > SCAN_LIMIT;
  // Bound the input BEFORE any pattern runs (audit F-01).
  const out = applyRules(wasCut ? value.slice(0, SCAN_LIMIT) : value);
  if (wasCut && out.length <= MAX_STRING_LENGTH) return `${out}${TRUNCATED_MARKER}`;
  return truncate(out);
}

/** Deep-redacts a value for logging. Never mutates its input. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  // BigInt is not JSON-serializable; log it as a decimal string (audit F-07).
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[depth limit]';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack === undefined ? {} : { stack: redactString(value.stack) }),
    };
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ENTRIES).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ENTRIES)
      items.push(`[${String(value.length - MAX_ENTRIES)} more items]`);
    return items;
  }
  const out: Record<string, unknown> = {};
  const entries = Object.entries(value);
  for (const [key, entry] of entries.slice(0, MAX_ENTRIES)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1);
  }
  if (entries.length > MAX_ENTRIES) {
    out['[truncated]'] = `${String(entries.length - MAX_ENTRIES)} more keys`;
  }
  return out;
}

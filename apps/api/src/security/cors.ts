/**
 * The subset of Nest's CORS options this policy uses. Declared locally because
 * Nest's own exported union includes an `any`-typed delegate.
 */
export type CorsPolicy = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => void;
  credentials: false;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
};

/**
 * CORS policy (security baseline D-019).
 *
 * - Exact-origin allowlist only; no wildcard, no `null`, no reflection of
 *   arbitrary origins. Validation happens at startup (env.ts).
 * - An empty allowlist means CORS is not enabled at all: browsers get no
 *   Access-Control-* headers and cross-origin reads are blocked.
 * - No credentials in Phase 1: there is no authentication yet, and the
 *   cookie/credential model is a Phase 2 decision (G-36).
 * - Only the methods the API actually serves (GET, HEAD). Phase 2 extends
 *   this together with its endpoints.
 */
export function corsOptions(allowedOrigins: readonly string[]): CorsPolicy | undefined {
  if (allowedOrigins.length === 0) return undefined;
  const allowed = new Set(allowedOrigins);
  return {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, origin !== undefined && allowed.has(origin));
    },
    credentials: false,
    methods: ['GET', 'HEAD'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  };
}

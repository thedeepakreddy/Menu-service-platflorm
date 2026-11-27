import { createSessionResponseSchema, currentSessionResponseSchema } from '@platform/contracts';
import type { LoginKind } from '@platform/contracts';

/**
 * Server-to-server calls from the BFF to the API's session endpoints (D-034). Every call carries
 * the BFF credential; calls about an existing session also carry `Authorization: Session`. The
 * browser's address is forwarded for the API's per-client rate limits; the API honours it only
 * together with the credential (D-037). Responses are validated against the shared contracts.
 */
export type ApiClientConfig = {
  apiOrigin: string;
  bffCredential: string;
  /** Fetch (tests may substitute). */
  fetch?: typeof fetch;
};

export type ApiSession = { token: string; expiresAt: number };

export class ApiUnavailableError extends Error {
  override name = 'ApiUnavailableError';
}

export function createApiClient(config: ApiClientConfig) {
  const doFetch = config.fetch ?? fetch;

  async function call(
    method: string,
    path: string,
    clientAddress: string,
    session?: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'x-platform-bff-credential': config.bffCredential,
      'content-type': 'application/json',
    };
    if (clientAddress !== 'unknown') headers['x-platform-client-address'] = clientAddress;
    if (session !== undefined) headers.authorization = `Session ${session}`;
    try {
      return await doFetch(`${config.apiOrigin}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ApiUnavailableError('API unreachable');
    }
  }

  return {
    /** Exchanges a just-completed login for a server-side session; undefined if refused. */
    async createSession(
      kind: LoginKind,
      tokens: { idToken: string; accessToken: string },
      replaces: string | undefined,
      clientAddress: string,
    ): Promise<ApiSession | undefined> {
      const res = await call('POST', '/auth/sessions', clientAddress, undefined, {
        kind,
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
        ...(replaces === undefined ? {} : { replaces }),
      });
      if (res.status === 401 || res.status === 400) return undefined;
      if (res.status !== 201) throw new ApiUnavailableError(`API answered ${String(res.status)}`);
      const parsed = createSessionResponseSchema.safeParse(await res.json());
      if (!parsed.success || parsed.data.kind !== kind) throw new ApiUnavailableError('bad reply');
      return { token: parsed.data.sessionToken, expiresAt: parsed.data.expiresAt };
    },

    /** The live session's absolute expiry, or undefined if it is not (or no longer) valid. */
    async currentSession(
      kind: LoginKind,
      token: string,
      clientAddress: string,
    ): Promise<{ expiresAt: number } | undefined> {
      const res = await call('GET', `/auth/sessions/current/${kind}`, clientAddress, token);
      if (res.status === 401) return undefined;
      if (res.status !== 200) throw new ApiUnavailableError(`API answered ${String(res.status)}`);
      const parsed = currentSessionResponseSchema.safeParse(await res.json());
      if (!parsed.success || parsed.data.kind !== kind) throw new ApiUnavailableError('bad reply');
      return { expiresAt: parsed.data.expiresAt };
    },

    /** Revokes the session (logout). */
    async revokeSession(token: string, clientAddress: string): Promise<void> {
      const res = await call('DELETE', '/auth/sessions/current', clientAddress, token);
      if (res.status !== 204) throw new ApiUnavailableError(`API answered ${String(res.status)}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

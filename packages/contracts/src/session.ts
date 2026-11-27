import { z } from 'zod';

/**
 * Server-side sessions (decision D-034). These contracts are used only between the web BFF and
 * the API (server to server); browsers never see a token, only an opaque HttpOnly cookie.
 */

export const loginKindSchema = z.enum(['owner', 'operator']);
export type LoginKind = z.infer<typeof loginKindSchema>;

/** Opaque session token: 256 random bits, base64url without padding. */
export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** A compact JWS (three base64url parts), bounded in size. */
const compactJwtSchema = z
  .string()
  .max(8192)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

/** `POST /auth/sessions`: exchange a just-completed OIDC login for a server-side session. */
export const createSessionRequestSchema = z
  .object({
    kind: loginKindSchema,
    idToken: compactJwtSchema,
    accessToken: compactJwtSchema,
    /** The browser's previous session token, revoked in the same transaction (rotation). */
    replaces: sessionTokenSchema.optional(),
  })
  .strict();
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const createSessionResponseSchema = z
  .object({
    sessionToken: sessionTokenSchema,
    kind: loginKindSchema,
    /** Absolute expiry, seconds since epoch. */
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

/** `GET /auth/sessions/current/:kind`: the live session, if any. */
export const currentSessionResponseSchema = z
  .object({
    kind: loginKindSchema,
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type CurrentSessionResponse = z.infer<typeof currentSessionResponseSchema>;

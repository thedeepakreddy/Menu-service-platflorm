import { z } from 'zod';

/**
 * Initial API error convention (decision P-108, approved as an initial
 * convention, not an immutable contract). The endpoint inventory, versioning
 * and full error taxonomy remain open (docs/GAPS.md G-14).
 */
export const errorCodes = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNPROCESSABLE_ENTITY',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Header carrying the request correlation id, on requests and responses. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Accepted shape for a client-supplied request id. Anything else is replaced
 * by a server-generated id, so arbitrary client input never reaches logs.
 */
export const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string().min(1),
        requestId: requestIdSchema,
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

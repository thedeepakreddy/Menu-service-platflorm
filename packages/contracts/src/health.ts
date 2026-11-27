import { z } from 'zod';

/** Response body of the API liveness endpoint `GET /health`. */
export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('api'),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;

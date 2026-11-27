import { randomUUID } from 'node:crypto';

import { REQUEST_ID_HEADER, requestIdSchema } from '@platform/contracts';
import type { NextFunction, Request, Response } from 'express';

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/** Use the client's id only if it is well-formed; otherwise generate one. */
export function resolveRequestId(incoming: unknown): string {
  const parsed = requestIdSchema.safeParse(incoming);
  return parsed.success ? parsed.data : randomUUID();
}

/** Express middleware: attach a request id and echo it on the response. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = resolveRequestId(req.header(REQUEST_ID_HEADER));
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

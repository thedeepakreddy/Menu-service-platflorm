import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * One structured entry per completed request (security baseline D-020).
 *
 * Logged: method, path (query string removed), status, duration, request id.
 * Never logged: headers (including Authorization and Cookie), request or
 * response bodies, query strings, client IP addresses and user agents. Query
 * strings and IPs can carry personal or secret data and are not needed for
 * Phase 1 diagnostics (Doc 01 §11, Doc 03 §19).
 */
const logger = new Logger('HTTP');

/**
 * The path is client-controlled. It is capped at the source, before it reaches
 * the logger and its redaction patterns, so per-request logging work stays
 * small and bounded however long the request line is (audit F-01).
 */
export const MAX_LOGGED_PATH_LENGTH = 512;

export function loggablePath(path: string): string {
  return path.length > MAX_LOGGED_PATH_LENGTH
    ? `${path.slice(0, MAX_LOGGED_PATH_LENGTH)}…[truncated]`
    : path;
}

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    logger.log({
      event: 'request',
      method: req.method,
      path: loggablePath(req.path),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      requestId: req.requestId,
    });
  });
  next();
}

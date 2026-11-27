import type { ErrorCode, ErrorEnvelope } from '@platform/contracts';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { isDatabaseUnavailable } from './infrastructure/database/database.js';
import { resolveRequestId } from './request-id.js';

const codeByStatus: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Generic, owner/customer-safe messages. Internal detail is never returned. */
const messageByCode: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request is invalid.',
  UNAUTHORIZED: 'Authentication is required.',
  FORBIDDEN: 'You do not have access to this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  METHOD_NOT_ALLOWED: 'This method is not allowed for the resource.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  UNPROCESSABLE_ENTITY: 'The request could not be processed.',
  TOO_MANY_REQUESTS: 'Too many requests. Please retry later.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
};

/** Map an HTTP status to an error code; unmapped statuses are grouped safely. */
export function errorCodeForStatus(status: number): ErrorCode {
  return codeByStatus[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
}

/**
 * Converts every thrown value into the P-108 error envelope. Non-HTTP errors
 * become 500 INTERNAL_ERROR; their details are logged server-side with the
 * request id and never sent to the client.
 *
 * Logging (D-020): 5xx are logged at `error` with the (redacted) error and
 * stack; 4xx are logged at `info` with status and code only, so neither
 * client input nor exception messages reach the log. Guards (audit L-05):
 * non-HTTP contexts are logged and left to their transport, and a response
 * whose headers were already sent is never written to again.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error({ event: 'exception', transport: host.getType(), error: exception });
      return;
    }
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // A database that is momentarily unavailable is a 503, not a 500 (audit B-01): the client may
    // retry, and the log records only the database error code.
    const unavailable = !(exception instanceof HttpException) && isDatabaseUnavailable(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : unavailable
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = errorCodeForStatus(status);
    const requestId = req.requestId ?? resolveRequestId(undefined);

    if (unavailable) {
      const dbCode = (exception as { code?: unknown }).code;
      this.logger.warn({
        event: 'database_unavailable',
        requestId,
        status,
        code,
        dbCode: typeof dbCode === 'string' ? dbCode : 'unknown',
      });
    } else if (status >= 500) {
      this.logger.error({
        event: 'exception',
        requestId,
        status,
        code,
        error: exception instanceof Error ? exception : 'non-error thrown',
      });
    } else {
      this.logger.log({ event: 'http_error', requestId, status, code });
    }

    if (res.headersSent) {
      this.logger.warn({ event: 'response_already_sent', requestId, status });
      return;
    }
    const body: ErrorEnvelope = { error: { code, message: messageByCode[code], requestId } };
    res.status(status).json(body);
  }
}

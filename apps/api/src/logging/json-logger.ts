import type { LoggerService } from '@nestjs/common';

import type { LogLevelName } from '../env.js';
import { redact } from './redact.js';

/**
 * Structured JSON-lines logger (security baseline D-020). Every entry is one
 * JSON object on one line: `{ time, level, context?, msg?, ...fields }`.
 * All content passes through `redact()` before serialization.
 */

const SEVERITY: Record<LogLevelName, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export type LogSink = (line: string) => void;

export type JsonLoggerOptions = {
  level: LogLevelName;
  /** Where serialized lines go; defaults to stdout. Tests inject a capture sink. */
  sink?: LogSink;
};

const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  );
}

export class JsonLogger implements LoggerService {
  private readonly threshold: number;
  private readonly sink: LogSink;

  constructor(options: JsonLoggerOptions) {
    this.threshold = SEVERITY[options.level];
    this.sink = options.sink ?? stdoutSink;
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params, true);
  }

  /**
   * NestJS passes the context name as the last string parameter, and for
   * `error()` may pass a stack string before it.
   */
  private write(level: LogLevelName, message: unknown, params: unknown[], fatal = false): void {
    if (SEVERITY[level] > this.threshold) return;
    const rest = [...params];
    const context = typeof rest.at(-1) === 'string' ? (rest.pop() as string) : undefined;
    const entry: Record<string, unknown> = { time: new Date().toISOString(), level };
    if (fatal) entry.fatal = true;
    if (context !== undefined) entry.context = context;
    if (isPlainObject(message)) Object.assign(entry, message);
    else if (message instanceof Error) entry.error = message;
    else entry.msg = message;
    const stack = rest.find((p): p is string => typeof p === 'string');
    if (stack !== undefined) entry.stack = stack;
    this.sink(JSON.stringify(redact(entry)));
  }
}

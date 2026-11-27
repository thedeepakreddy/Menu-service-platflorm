import { describe, expect, it } from 'vitest';

import { REDACTED } from './redact.js';
import { JsonLogger } from './json-logger.js';

function capture(level: 'error' | 'warn' | 'info' | 'debug') {
  const lines: string[] = [];
  const logger = new JsonLogger({ level, sink: (line) => lines.push(line) });
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, entries };
}

describe('JsonLogger', () => {
  it('writes one JSON object per line with time, level and context', () => {
    const { logger, lines, entries } = capture('info');
    logger.log('started', 'Bootstrap');
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
    expect(entries()[0]).toMatchObject({ level: 'info', context: 'Bootstrap', msg: 'started' });
    expect(typeof entries()[0]?.time).toBe('string');
  });

  it('merges structured messages into the entry', () => {
    const { logger, entries } = capture('info');
    logger.log({ event: 'request', status: 200 }, 'HTTP');
    expect(entries()[0]).toMatchObject({ event: 'request', status: 200, context: 'HTTP' });
  });

  it('honours the configured level threshold', () => {
    const { logger, entries } = capture('warn');
    logger.debug('d');
    logger.log('i');
    logger.warn('w');
    logger.error('e');
    expect(entries().map((e) => e.level)).toEqual(['warn', 'error']);
  });

  it('maps verbose to debug and fatal to error', () => {
    const { logger, entries } = capture('debug');
    logger.verbose('v');
    logger.fatal('f');
    expect(entries().map((e) => [e.level, e.fatal])).toEqual([
      ['debug', undefined],
      ['error', true],
    ]);
  });

  it('redacts secrets in messages, fields, stacks and errors before serialization', () => {
    const { logger, lines } = capture('debug');
    logger.error('failed with Bearer tok-abc', 'at x (postgres://u:pw@h/db)', 'Ctx');
    logger.log({ headers: { authorization: 'Bearer zzz' }, password: 'hunter2' });
    logger.error({ error: new Error('token=secret-value') });
    const all = lines.join('\n');
    for (const secret of ['tok-abc', ':pw@', 'zzz', 'hunter2', 'secret-value']) {
      expect(all).not.toContain(secret);
    }
    expect(all).toContain(REDACTED);
  });
});

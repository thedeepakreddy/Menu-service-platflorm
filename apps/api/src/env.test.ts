import { describe, expect, it } from 'vitest';

import { parseApiEnv } from './env.js';

const valid = { APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: '4000' };

describe('parseApiEnv', () => {
  it('accepts a complete, valid configuration and coerces the port', () => {
    expect(parseApiEnv(valid)).toEqual({
      ok: true,
      env: { APP_ENV: 'test', API_HOST: '127.0.0.1', API_PORT: 4000 },
    });
  });

  it('reports every missing variable as required', () => {
    const result = parseApiEnv({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { variable: 'APP_ENV', problem: 'is required' },
        { variable: 'API_HOST', problem: 'is required' },
        { variable: 'API_PORT', problem: 'is required' },
      ]),
    );
  });

  it.each([
    ['APP_ENV', 'prod'],
    ['API_HOST', '   '],
    ['API_PORT', '0'],
    ['API_PORT', '65536'],
    ['API_PORT', '40.5'],
    ['API_PORT', 'not-a-port'],
  ])('rejects %s=%j', (variable, value) => {
    const result = parseApiEnv({ ...valid, [variable]: value });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.variable)).toEqual([variable]);
  });

  it('never echoes the supplied value in issues', () => {
    const secretLooking = 'sk-live-THIS-MUST-NOT-LEAK';
    const result = parseApiEnv({ ...valid, APP_ENV: secretLooking, API_PORT: secretLooking });
    expect(JSON.stringify(result)).not.toContain(secretLooking);
  });
});

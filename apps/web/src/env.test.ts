import { describe, expect, it } from 'vitest';

import { parseWebEnv } from './env';

describe('parseWebEnv', () => {
  it('accepts a valid configuration', () => {
    expect(parseWebEnv({ APP_ENV: 'production' })).toEqual({ APP_ENV: 'production' });
  });

  it('rejects a missing APP_ENV', () => {
    expect(() => parseWebEnv({})).toThrow(/APP_ENV is required/);
  });

  it('rejects an unknown APP_ENV without echoing the value', () => {
    let message = '';
    try {
      parseWebEnv({ APP_ENV: 'sk-live-THIS-MUST-NOT-LEAK' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/APP_ENV is invalid/);
    expect(message).not.toContain('sk-live-THIS-MUST-NOT-LEAK');
  });
});

import { describe, expect, it } from 'vitest';
import { getVersion, VERSION } from './index.js';

describe('cli package', () => {
  it('reports the package.json version', () => {
    expect(getVersion()).toBe(VERSION);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

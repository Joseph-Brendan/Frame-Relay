import { describe, expect, it } from 'vitest';
import { getVersion, VERSION } from './index.js';

describe('cli package', () => {
  it('runs the version function and checks the output', () => {
    expect(getVersion()).toBe(VERSION);
    expect(getVersion()).toBe('0.0.0');
  });
});

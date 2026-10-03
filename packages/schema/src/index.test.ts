import { describe, expect, it } from 'vitest';
import { KIT_VERSION } from './index.js';

describe('schema package', () => {
  it('should export the expected KIT_VERSION', () => {
    expect(KIT_VERSION).toBe('1.0');
  });
});

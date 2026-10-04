import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runDoctor } from '../src/commands/doctor.js';

describe('frame-relay doctor', () => {
  const demoRoot = path.resolve(__dirname, '../../../examples/demo-app');

  it('doctor passes on the demo app', async () => {
    const passed = await runDoctor({ cwd: demoRoot });
    expect(passed).toBe(true);
  });

  it('doctor fails with helpful messages in an empty folder', async () => {
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-doctor-empty-'));
    try {
      const passed = await runDoctor({ cwd: emptyTmp });
      expect(passed).toBe(false);
    } finally {
      fs.rmSync(emptyTmp, { recursive: true, force: true });
    }
  });
});

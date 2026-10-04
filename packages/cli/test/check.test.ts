import { describe, it, expect } from 'vitest';
import { checkFile } from '../src/check/index.js';

describe('Check Rules Engine', () => {
  it('rule 1: detects raw form elements with exact line and column', () => {
    const code = `
import React from 'react';

export function MyPage() {
  return (
    <div>
      <button onClick={() => {}}>Click me</button>
      <input type="text" />
      <select><option>1</option></select>
      <textarea />
    </div>
  );
}
`;
    const res = checkFile({
      filePath: 'src/pages/MyPage.tsx',
      code,
      componentsDir: 'src/components/ui',
    });
    expect(res.violations.length).toBe(4);

    const buttonViolation = res.violations.find((v) => v.message.includes('<button>'));
    expect(buttonViolation).toBeDefined();
    expect(buttonViolation?.line).toBe(7);
    expect(buttonViolation?.col).toBe(7);
    expect(buttonViolation?.fix).toContain("Import { Button } from '@/components/ui'");

    const inputViolation = res.violations.find((v) => v.message.includes('<input>'));
    expect(inputViolation?.line).toBe(8);

    const selectViolation = res.violations.find((v) => v.message.includes('<select>'));
    expect(selectViolation?.line).toBe(9);

    const textareaViolation = res.violations.find((v) => v.message.includes('<textarea>'));
    expect(textareaViolation?.line).toBe(10);
  });

  it('rule 1: allows raw form elements inside componentsDir', () => {
    const code = `
import React from 'react';
export function Button(props) {
  return <button {...props} />;
}
`;
    const res = checkFile({
      filePath: 'src/components/ui/Button.tsx',
      code,
      componentsDir: 'src/components/ui',
    });
    expect(res.violations.length).toBe(0);
  });

  it('rule 2: detects hex, rgb, and hsl color literals', () => {
    const code = `
import React from 'react';
export function BadColors() {
  return (
    <div className="text-[#ff0000]">
      <span className="bg-[rgb(255,0,0)]" />
      <p style={{ color: 'rgba(0, 0, 0, 0.5)' }}>Text</p>
    </div>
  );
}
`;
    const res = checkFile({ filePath: 'src/BadColors.tsx', code });
    const colorViolations = res.violations.filter((v) => v.rule === 'literal-color');
    expect(colorViolations.length).toBeGreaterThanOrEqual(2);
  });

  it('rule 3: detects Tailwind arbitrary values for color, radius, spacing, shadow', () => {
    const code = `
export function Arbitrary() {
  return <div className="rounded-[13px] p-[7px] shadow-[0_4px_10px_black]" />;
}
`;
    const res = checkFile({ filePath: 'src/Arbitrary.tsx', code });
    const arbViolations = res.violations.filter((v) => v.rule === 'tailwind-arbitrary-value');
    expect(arbViolations.length).toBe(3);
    expect(arbViolations[0].message).toContain('rounded-[13px]');
    expect(arbViolations[1].message).toContain('p-[7px]');
    expect(arbViolations[2].message).toContain('shadow-[0_4px_10px_black]');
  });

  it('rule 3: exempts files containing the raw value comment', () => {
    const code = `
// frame-relay: raw value from Figma. Bind it to a variable in Figma to use a token.
export function GeneratedCard() {
  return <div className="rounded-[13px]" />;
}
`;
    const res = checkFile({ filePath: 'src/components/ui/Card.tsx', code });
    const arbViolations = res.violations.filter((v) => v.rule === 'tailwind-arbitrary-value');
    expect(arbViolations.length).toBe(0);
  });

  it('rule 4: detects inline style objects setting color, background, borderRadius, boxShadow', () => {
    const code = `
export function InlineStyles() {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: 8,
        boxShadow: 'none',
      }}
    />
  );
}
`;
    const res = checkFile({ filePath: 'src/InlineStyles.tsx', code });
    const styleViolations = res.violations.filter((v) => v.rule === 'inline-style-token');
    expect(styleViolations.length).toBe(3);
  });

  it('clean file returns zero violations', () => {
    const code = `
import React from 'react';
import { Button } from '@/components/ui';

export function CleanPage() {
  return (
    <div className="flex gap-4 p-4 rounded-md bg-primary-500 text-neutral-0">
      <Button variant="Primary">Submit</Button>
    </div>
  );
}
`;
    const res = checkFile({
      filePath: 'src/CleanPage.tsx',
      code,
      componentsDir: 'src/components/ui',
    });
    expect(res.violations.length).toBe(0);
  });
});

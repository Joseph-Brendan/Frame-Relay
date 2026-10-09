import { describe, it, expect } from 'vitest';
import { ComponentSpec } from '@frame-relay/schema';
import {
  renderButtonTemplate,
  renderInputTemplate,
  renderTextareaTemplate,
  renderSelectTemplate,
  renderCheckboxTemplate,
  renderRadioTemplate,
  renderSwitchTemplate,
  renderCardTemplate,
  renderBadgeTemplate,
  renderModalTemplate,
  renderTabsTemplate,
  renderGenericTemplate,
  selectTemplate,
} from '../src/codegen/templates.js';
import { generateCnHelper, generateBarrelExport } from '../src/codegen/index.js';

function makeMockSpec(name: string, category?: string): ComponentSpec {
  return {
    id: `comp-${name.toLowerCase()}`,
    name,
    category,
    props: [
      { name: 'variant', type: 'variant', options: ['Primary', 'Secondary'], default: 'Primary' },
      { name: 'size', type: 'variant', options: ['Small', 'Medium', 'Large'], default: 'Medium' },
    ],
    base: {
      root: {
        background: '{color.primary.500}',
        radius: '{radius.md}',
        padding: '{spacing.4}',
      },
    },
    variants: [
      {
        props: { variant: 'Secondary' },
        styles: {
          root: {
            background: '{color.neutral.200}',
          },
        },
      },
    ],
    states: [
      {
        name: 'Hover',
        styles: {
          root: {
            background: '{color.primary.600}',
          },
        },
      },
    ],
  };
}

describe('Component Codegen Templates', () => {
  const baseCtx = {
    kitName: 'TestKit',
    exportedAt: '2026-10-04T00:00:00Z',
    reactVersion: 19,
    cnImportPath: '@/lib/cn',
  };

  it('renders Button template (React 19)', () => {
    const code = renderButtonTemplate({ ...baseCtx, spec: makeMockSpec('Button', 'Button') });
    expect(code).toContain('export function Button(');
    expect(code).toContain('buttonVariants(');
    expect(code).toContain('ref,');
    expect(code).toMatchSnapshot();
  });

  it('renders Button template (React 18)', () => {
    const code = renderButtonTemplate({
      ...baseCtx,
      reactVersion: 18,
      spec: makeMockSpec('Button', 'Button'),
    });
    expect(code).toContain('React.forwardRef<HTMLButtonElement, ButtonProps>');
    expect(code).toContain('buttonVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Input template', () => {
    const code = renderInputTemplate({ ...baseCtx, spec: makeMockSpec('Input', 'Input') });
    expect(code).toContain('export function Input(');
    expect(code).toContain('inputVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Textarea template', () => {
    const code = renderTextareaTemplate({ ...baseCtx, spec: makeMockSpec('Textarea', 'Textarea') });
    expect(code).toContain('export function Textarea(');
    expect(code).toContain('textareaVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Select template', () => {
    const code = renderSelectTemplate({ ...baseCtx, spec: makeMockSpec('Select', 'Select') });
    expect(code).toContain('export function Select(');
    expect(code).toContain('selectVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Checkbox template', () => {
    const code = renderCheckboxTemplate({ ...baseCtx, spec: makeMockSpec('Checkbox', 'Checkbox') });
    expect(code).toContain('export function Checkbox(');
    expect(code).toContain('checkboxVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Radio template', () => {
    const code = renderRadioTemplate({ ...baseCtx, spec: makeMockSpec('Radio', 'Radio') });
    expect(code).toContain('export function Radio(');
    expect(code).toContain('radioVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Switch template', () => {
    const code = renderSwitchTemplate({ ...baseCtx, spec: makeMockSpec('Switch', 'Switch') });
    expect(code).toContain('export function Switch(');
    expect(code).toContain('switchVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Card template', () => {
    const code = renderCardTemplate({ ...baseCtx, spec: makeMockSpec('Card', 'Card') });
    expect(code).toContain('export function Card(');
    expect(code).toContain('cardVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Badge template', () => {
    const code = renderBadgeTemplate({ ...baseCtx, spec: makeMockSpec('Badge', 'Badge') });
    expect(code).toContain('export function Badge(');
    expect(code).toContain('badgeVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Modal template', () => {
    const code = renderModalTemplate({ ...baseCtx, spec: makeMockSpec('Modal', 'Modal') });
    expect(code).toContain('export function Modal(');
    expect(code).toContain('modalVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Tabs template', () => {
    const code = renderTabsTemplate({ ...baseCtx, spec: makeMockSpec('Tabs', 'Tabs') });
    expect(code).toContain('export function Tabs(');
    expect(code).toContain('tabsVariants(');
    expect(code).toMatchSnapshot();
  });

  it('renders Generic Shell template for unknown component with agent comment', () => {
    const code = renderGenericTemplate({ ...baseCtx, spec: makeMockSpec('HeroBanner') });
    expect(code).toContain(
      '// frame-relay: generated shell. Agent: refine using .frame-relay/components.md',
    );
    expect(code).toContain('export function HeroBanner(');
    expect(code).toMatchSnapshot();
  });

  it('selects dedicated templates by name or category', () => {
    expect(selectTemplate({ ...baseCtx, spec: makeMockSpec('Button') })).toContain(
      'buttonVariants',
    );
    expect(selectTemplate({ ...baseCtx, spec: makeMockSpec('CustomBtn', 'button') })).toContain(
      'buttonVariants',
    );
    expect(selectTemplate({ ...baseCtx, spec: makeMockSpec('Dialog', 'modal') })).toContain(
      'modalVariants',
    );
    expect(selectTemplate({ ...baseCtx, spec: makeMockSpec('Unknown') })).toContain(
      '// frame-relay: generated shell',
    );
  });

  it('generates cn helper file', () => {
    const cnCode = generateCnHelper();
    expect(cnCode).toContain("import { clsx, type ClassValue } from 'clsx';");
    expect(cnCode).toContain("import { twMerge } from 'tailwind-merge';");
    expect(cnCode).toContain('export function cn(');
  });

  it('generates barrel index export file', () => {
    const barrel = generateBarrelExport(['Button', 'Card', 'Input']);
    expect(barrel).toContain("export * from './Button';");
    expect(barrel).toContain("export * from './Card';");
    expect(barrel).toContain("export * from './Input';");
  });
});

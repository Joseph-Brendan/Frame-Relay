import { describe, expect, it } from 'vitest';
import type { ComponentSpec } from './component.js';
import {
  LIVE_ERROR_CODES,
  LIVE_PORTS,
  LiveMessageSchema,
  MAX_MESSAGE_BYTES,
  PluginToServerMessageSchema,
  ServerToPluginMessageSchema,
} from './index.js';
import type {
  FrameSummary,
  LiveSelectionMeta,
  LiveWarning,
  PluginToServerMessage,
  ServerToPluginMessage,
} from './index.js';

const meta: LiveSelectionMeta = {
  nodeId: '1:23',
  name: 'Button',
  nodeType: 'COMPONENT_SET',
  fileName: 'Relay Test',
  pageName: 'Components',
};

const componentSpec: ComponentSpec = {
  name: 'Button',
  description: 'Trigger an immediate action or submission.',
  anatomy: [{ name: 'root', description: 'The root layer', required: true }],
  props: [],
  base: { root: {} },
  variants: [],
  states: [{ name: 'Default', styles: {} }],
  usage: { do: [], dont: [] },
  screenshots: [],
};

const frameSummary: FrameSummary = {
  name: 'Hero Card',
  layout: { direction: 'column' },
  size: { width: 320, height: 480 },
  childCount: 2,
  componentInstances: ['Button'],
  tokenReferences: ['{space.2}'],
  rawValues: ['13px'],
};

const warning: LiveWarning = {
  code: 'RAW_VALUE',
  severity: 'warning',
  component: 'Button',
  layerPath: 'root',
  message: 'Button > root: fill uses raw hex color #ff0000.',
};

const pluginMessages: PluginToServerMessage[] = [
  { v: 1, type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' },
  { v: 1, type: 'pair', code: '123456' },
  { v: 1, type: 'resume', sessionToken: 'token-abc' },
  {
    v: 1,
    type: 'selection',
    meta,
    kind: 'component',
    spec: componentSpec,
    image: 'iVBORw0KGgo=',
    warnings: [warning],
  },
  {
    v: 1,
    type: 'selection',
    meta,
    kind: 'frame',
    spec: frameSummary,
    image: null,
    warnings: [],
  },
  { v: 1, type: 'pong' },
  { v: 1, type: 'bye' },
];

const serverMessages: ServerToPluginMessage[] = [
  { v: 1, type: 'welcome', serverVersion: '0.1.0', projectName: 'demo-app' },
  { v: 1, type: 'paired', sessionToken: 'token-abc' },
  { v: 1, type: 'resumed' },
  { v: 1, type: 'ping' },
  ...LIVE_ERROR_CODES.map((code): ServerToPluginMessage => ({
    v: 1,
    type: 'error',
    code,
    message: 'Something failed.',
  })),
];

describe('live protocol v1', () => {
  it('exports the live ports and message size limit', () => {
    expect(LIVE_PORTS).toEqual([47321, 47322, 47323]);
    expect(MAX_MESSAGE_BYTES).toBe(6 * 1024 * 1024);
  });

  it('exports the full error code list', () => {
    expect(LIVE_ERROR_CODES).toEqual([
      'BAD_CODE',
      'CODE_EXPIRED',
      'TOO_MANY_ATTEMPTS',
      'BAD_TOKEN',
      'VERSION_MISMATCH',
      'MESSAGE_TOO_LARGE',
      'BAD_MESSAGE',
    ]);
  });

  it.each(pluginMessages.map((message, index) => ({ index, message })))(
    'round-trips plugin to server message $index ($message.type)',
    ({ message }) => {
      const result = PluginToServerMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(message);
      }

      const combined = LiveMessageSchema.safeParse(message);
      expect(combined.success).toBe(true);
    },
  );

  it.each(serverMessages.map((message, index) => ({ index, message })))(
    'round-trips server to plugin message $index ($message.type)',
    ({ message }) => {
      const result = ServerToPluginMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(message);
      }

      const combined = LiveMessageSchema.safeParse(message);
      expect(combined.success).toBe(true);
    },
  );

  it('rejects server messages on the plugin channel and vice versa', () => {
    expect(PluginToServerMessageSchema.safeParse(serverMessages[0]).success).toBe(false);
    expect(ServerToPluginMessageSchema.safeParse(pluginMessages[0]).success).toBe(false);
  });

  const badMessages: Array<{ label: string; message: unknown }> = [
    { label: 'null', message: null },
    { label: 'undefined', message: undefined },
    { label: 'string', message: 'hello' },
    { label: 'number', message: 42 },
    { label: 'array', message: [] },
    { label: 'empty object', message: {} },
    {
      label: 'missing v',
      message: { type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' },
    },
    {
      label: 'string v',
      message: { v: '1', type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' },
    },
    {
      label: 'wrong v',
      message: { v: 2, type: 'hello', pluginVersion: '1.0.0', fileName: 'Relay Test' },
    },
    { label: 'unknown type', message: { v: 1, type: 'nope' } },
    { label: 'missing type', message: { v: 1 } },
    {
      label: 'hello missing fileName',
      message: { v: 1, type: 'hello', pluginVersion: '1.0.0' },
    },
    { label: 'pair missing code', message: { v: 1, type: 'pair' } },
    { label: 'resume missing token', message: { v: 1, type: 'resume' } },
    {
      label: 'error with unknown code',
      message: { v: 1, type: 'error', code: 'NOT_A_CODE', message: 'nope' },
    },
    { label: 'error missing code', message: { v: 1, type: 'error', message: 'nope' } },
    { label: 'error missing message', message: { v: 1, type: 'error', code: 'BAD_CODE' } },
    {
      label: 'welcome missing projectName',
      message: { v: 1, type: 'welcome', serverVersion: '1' },
    },
    { label: 'paired missing token', message: { v: 1, type: 'paired' } },
    {
      label: 'component kind with frame spec',
      message: {
        v: 1,
        type: 'selection',
        meta,
        kind: 'component',
        spec: frameSummary,
        image: null,
        warnings: [],
      },
    },
    {
      label: 'frame kind with component spec',
      message: {
        v: 1,
        type: 'selection',
        meta,
        kind: 'frame',
        spec: componentSpec,
        image: null,
        warnings: [],
      },
    },
    {
      label: 'selection with non-string image',
      message: {
        v: 1,
        type: 'selection',
        meta,
        kind: 'component',
        spec: componentSpec,
        image: 123,
        warnings: [],
      },
    },
    {
      label: 'selection with bad warning severity',
      message: {
        v: 1,
        type: 'selection',
        meta,
        kind: 'component',
        spec: componentSpec,
        image: null,
        warnings: [{ code: 'X', severity: 'fatal', component: 'c', layerPath: '', message: 'm' }],
      },
    },
    {
      label: 'selection missing meta',
      message: {
        v: 1,
        type: 'selection',
        kind: 'component',
        spec: componentSpec,
        image: null,
        warnings: [],
      },
    },
  ];

  it.each(badMessages)('rejects bad message: $label', ({ message }) => {
    expect(LiveMessageSchema.safeParse(message).success).toBe(false);
  });
});

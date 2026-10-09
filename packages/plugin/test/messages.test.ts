import { describe, expect, it } from 'vitest';
import {
  isMainToUIMessage,
  isPluginMessage,
  isUIToMainMessage,
  MainToUIMessage,
  PROTOCOL_VERSION,
  UIToMainMessage,
} from '../src/shared/messages.js';

describe('Message Protocol', () => {
  const uiMessages: UIToMainMessage[] = [
    {
      version: PROTOCOL_VERSION,
      type: 'INIT_REQUEST',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'SET_SETTINGS',
      scope: 'selection',
      devMode: true,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'RUN_LINT',
      scope: 'file',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'RUN_EXPORT',
      scope: 'selection',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'RUN_DUMP',
      scope: 'file',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'REQUEST_SCREENSHOTS',
      jobs: [{ nodeId: '1:2', path: 'screenshots/Button-default.png' }],
    },
    {
      version: PROTOCOL_VERSION,
      type: 'CANCEL_OPERATION',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'SELECT_NODE',
      nodeId: '1:45',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'NOTIFY',
      message: 'Export completed successfully',
      error: false,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'RESIZE_WINDOW',
      width: 480,
      height: 640,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_SET_ACTIVE',
      active: true,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_GET_TOKENS',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_SET_TOKEN',
      port: 47321,
      token: 'session-token',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_CLEAR_TOKEN',
      port: 47321,
    },
  ];

  const mainMessages: MainToUIMessage[] = [
    {
      version: PROTOCOL_VERSION,
      type: 'INIT_RESPONSE',
      fileName: 'Design System',
      fileKey: 'figma-file-key-123',
      scope: 'file',
      devMode: false,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'PROGRESS',
      stage: 'snapshots',
      current: 5,
      total: 10,
      message: 'Processing batch 1 of 2',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'SNAPSHOTS_BATCH',
      components: [{ id: '1:2', name: 'Button', type: 'COMPONENT_SET', visible: true }],
      isLastBatch: true,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'SNAPSHOTS_COMPLETE',
      mode: 'export',
      icons: [{ name: 'arrow-left', svg: '<svg></svg>' }],
      collections: [
        {
          id: 'col-1',
          name: 'Tokens',
          modes: [{ modeId: 'm1', name: 'Light' }],
          defaultModeId: 'm1',
        },
      ],
      variables: [
        {
          id: 'v1',
          name: 'color/primary',
          resolvedType: 'COLOR',
          valuesByMode: { m1: { r: 0.1, g: 0.2, b: 0.8 } },
        },
      ],
      styles: {
        s1: { name: 'Heading/H1', tokenPath: 'heading.h1' },
      },
      warnings: [],
    },
    {
      version: PROTOCOL_VERSION,
      type: 'SCREENSHOT_CHUNK',
      nodeId: '1:2',
      path: 'screenshots/Button-default.png',
      bytes: [137, 80, 78, 71],
      current: 1,
      total: 1,
    },
    {
      version: PROTOCOL_VERSION,
      type: 'SCREENSHOT_COMPLETE',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'OPERATION_CANCELLED',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'ERROR',
      message: 'Failed to access node',
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_TOKENS',
      tokens: { '47321': 'session-token' },
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_SELECTION',
      selection: {
        kind: 'component',
        snapshot: { id: '1:2', name: 'Button', type: 'COMPONENT_SET', visible: true },
        variantProperties: { Variant: 'Primary' },
        collections: [
          {
            id: 'col-1',
            name: 'Tokens',
            modes: [{ modeId: 'm1', name: 'Light' }],
            defaultModeId: 'm1',
          },
        ],
        variables: [
          {
            id: 'v1',
            name: 'color/primary',
            resolvedType: 'COLOR',
            valuesByMode: { m1: { r: 0.1, g: 0.2, b: 0.8 } },
          },
        ],
        styles: {
          s1: { name: 'Heading/H1', tokenPath: 'heading.h1' },
        },
        imageBytes: [137, 80, 78, 71],
        imageScale: 2,
        pageName: 'Components',
        fileName: 'Design System',
      },
    },
    {
      version: PROTOCOL_VERSION,
      type: 'LIVE_SELECTION',
      selection: null,
    },
  ];

  it('validates and round-trips all UIToMain messages through postMessage serialization', () => {
    for (const msg of uiMessages) {
      expect(isPluginMessage(msg)).toBe(true);
      expect(isUIToMainMessage(msg)).toBe(true);
      expect(isMainToUIMessage(msg)).toBe(false);

      // Round-trip through JSON (postMessage structured clone behavior)
      const serialized = JSON.parse(JSON.stringify(msg));
      expect(isPluginMessage(serialized)).toBe(true);
      expect(isUIToMainMessage(serialized)).toBe(true);
      expect(serialized).toEqual(msg);
    }
  });

  it('validates and round-trips all MainToUI messages through postMessage serialization', () => {
    for (const msg of mainMessages) {
      expect(isPluginMessage(msg)).toBe(true);
      expect(isMainToUIMessage(msg)).toBe(true);
      expect(isUIToMainMessage(msg)).toBe(false);

      // Round-trip through JSON
      const serialized = JSON.parse(JSON.stringify(msg));
      expect(isPluginMessage(serialized)).toBe(true);
      expect(isMainToUIMessage(serialized)).toBe(true);
      expect(serialized).toEqual(msg);
    }
  });

  it('rejects messages with wrong version, unknown types, or malformed data', () => {
    expect(isPluginMessage(null)).toBe(false);
    expect(isPluginMessage(undefined)).toBe(false);
    expect(isPluginMessage('string')).toBe(false);
    expect(isPluginMessage({ version: 999, type: 'INIT_REQUEST' })).toBe(false);
    expect(isPluginMessage({ type: 'INIT_REQUEST' })).toBe(false);

    expect(isUIToMainMessage({ version: PROTOCOL_VERSION, type: 'UNKNOWN_TYPE' })).toBe(false);
    expect(isMainToUIMessage({ version: PROTOCOL_VERSION, type: 'UNKNOWN_TYPE' })).toBe(false);
  });
});

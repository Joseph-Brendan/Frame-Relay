import {
  ConverterWarning,
  NodeSnapshot,
  StyleIndex,
  VariableCollectionSnapshot,
  VariableSnapshot,
} from '@josephbrendan/converter';

export const PROTOCOL_VERSION = 1 as const;

export type ScopeOption = 'file' | 'selection';

export interface IconExportItem {
  name: string;
  svg: string;
}

export interface ScreenshotJobItem {
  nodeId: string;
  path: string;
}

// -------------------------------------------------------------
// Messages from UI Thread -> Main Thread
// -------------------------------------------------------------

export interface InitRequestMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'INIT_REQUEST';
}

export interface SetSettingsMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'SET_SETTINGS';
  scope?: ScopeOption;
  devMode?: boolean;
}

export interface RunLintMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'RUN_LINT';
  scope: ScopeOption;
}

export interface RunExportMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'RUN_EXPORT';
  scope: ScopeOption;
}

export interface RunDumpMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'RUN_DUMP';
  scope: ScopeOption;
}

export interface RequestScreenshotsMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'REQUEST_SCREENSHOTS';
  jobs: ScreenshotJobItem[];
}

export interface CancelOperationMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'CANCEL_OPERATION';
}

export interface SelectNodeMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'SELECT_NODE';
  nodeId: string;
}

export interface NotifyMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'NOTIFY';
  message: string;
  error?: boolean;
}

export interface ResizeWindowMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'RESIZE_WINDOW';
  width: number;
  height: number;
}

// -------------------------------------------------------------
// Live mode: UI Thread -> Main Thread
// -------------------------------------------------------------

export interface LiveSetActiveMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'LIVE_SET_ACTIVE';
  active: boolean;
}

export interface LiveGetTokensMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'LIVE_GET_TOKENS';
}

export interface LiveSetTokenMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'LIVE_SET_TOKEN';
  port: number;
  token: string;
}

export interface LiveClearTokenMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'LIVE_CLEAR_TOKEN';
  port: number;
}

export type UIToMainMessage =
  | InitRequestMessage
  | SetSettingsMessage
  | RunLintMessage
  | RunExportMessage
  | RunDumpMessage
  | RequestScreenshotsMessage
  | CancelOperationMessage
  | SelectNodeMessage
  | NotifyMessage
  | ResizeWindowMessage
  | LiveSetActiveMessage
  | LiveGetTokensMessage
  | LiveSetTokenMessage
  | LiveClearTokenMessage;

// -------------------------------------------------------------
// Messages from Main Thread -> UI Thread
// -------------------------------------------------------------

export interface InitResponseMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'INIT_RESPONSE';
  fileName: string;
  fileKey?: string;
  scope: ScopeOption;
  devMode: boolean;
}

export interface ProgressMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'PROGRESS';
  stage: 'finding' | 'snapshots' | 'variables' | 'styles' | 'icons' | 'screenshots';
  current: number;
  total: number;
  message?: string;
}

export interface SnapshotsBatchMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'SNAPSHOTS_BATCH';
  components: NodeSnapshot[];
  isLastBatch: boolean;
}

export interface SnapshotsCompleteMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'SNAPSHOTS_COMPLETE';
  mode: 'lint' | 'export' | 'dump';
  icons: IconExportItem[];
  collections: VariableCollectionSnapshot[];
  variables: VariableSnapshot[];
  styles: StyleIndex;
  warnings: ConverterWarning[];
}

export interface ScreenshotChunkMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'SCREENSHOT_CHUNK';
  nodeId: string;
  path: string;
  bytes: number[];
  current: number;
  total: number;
}

export interface ScreenshotCompleteMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'SCREENSHOT_COMPLETE';
}

export interface OperationCancelledMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'OPERATION_CANCELLED';
}

export interface ErrorMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'ERROR';
  message: string;
}

// -------------------------------------------------------------
// Live mode: Main Thread -> UI Thread
// -------------------------------------------------------------

export interface LiveTokensMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'LIVE_TOKENS';
  /** Stored session tokens keyed by port number, e.g. { "47321": "abc123" } */
  tokens: Record<string, string>;
}

/**
 * Everything the UI needs to convert one live selection: the node snapshot plus the variables,
 * styles and PNG preview resolved by the main thread.
 */
export interface LiveSelectionPayload {
  kind: 'component' | 'frame';
  snapshot: NodeSnapshot;
  variantProperties?: Record<string, string>;
  collections: VariableCollectionSnapshot[];
  variables: VariableSnapshot[];
  styles: StyleIndex;
  imageBytes: number[] | null;
  imageScale: number | null;
  pageName: string;
  fileName: string;
}

export interface LiveSelectionEventMessage {
  version: typeof PROTOCOL_VERSION;
  type: 'LIVE_SELECTION';
  /** Null when nothing (or more than one layer) is selected. */
  selection: LiveSelectionPayload | null;
  error?: string;
}

export type MainToUIMessage =
  | InitResponseMessage
  | ProgressMessage
  | SnapshotsBatchMessage
  | SnapshotsCompleteMessage
  | ScreenshotChunkMessage
  | ScreenshotCompleteMessage
  | OperationCancelledMessage
  | ErrorMessage
  | LiveTokensMessage
  | LiveSelectionEventMessage;

export type PluginMessage = UIToMainMessage | MainToUIMessage;

// -------------------------------------------------------------
// Type Guards
// -------------------------------------------------------------

export function isPluginMessage(val: unknown): val is PluginMessage {
  if (typeof val !== 'object' || val === null) return false;
  const msg = val as { version?: unknown; type?: unknown };
  return msg.version === PROTOCOL_VERSION && typeof msg.type === 'string';
}

export function isUIToMainMessage(val: unknown): val is UIToMainMessage {
  if (!isPluginMessage(val)) return false;
  const uiTypes: readonly string[] = [
    'INIT_REQUEST',
    'SET_SETTINGS',
    'RUN_LINT',
    'RUN_EXPORT',
    'RUN_DUMP',
    'REQUEST_SCREENSHOTS',
    'CANCEL_OPERATION',
    'SELECT_NODE',
    'NOTIFY',
    'RESIZE_WINDOW',
    'LIVE_SET_ACTIVE',
    'LIVE_GET_TOKENS',
    'LIVE_SET_TOKEN',
    'LIVE_CLEAR_TOKEN',
  ];
  return uiTypes.includes(val.type);
}

export function isMainToUIMessage(val: unknown): val is MainToUIMessage {
  if (!isPluginMessage(val)) return false;
  const mainTypes: readonly string[] = [
    'INIT_RESPONSE',
    'PROGRESS',
    'SNAPSHOTS_BATCH',
    'SNAPSHOTS_COMPLETE',
    'SCREENSHOT_CHUNK',
    'SCREENSHOT_COMPLETE',
    'OPERATION_CANCELLED',
    'ERROR',
    'LIVE_TOKENS',
    'LIVE_SELECTION',
  ];
  return mainTypes.includes(val.type);
}

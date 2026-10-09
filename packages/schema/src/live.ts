import { z } from 'zod';
import { ComponentSpecSchema, LayoutSchema } from './component.js';

/**
 * Live mode protocol v1.
 *
 * The Figma plugin UI opens a WebSocket to the local Frame-Relay MCP server and both sides
 * exchange exactly these messages. Both the plugin and the server import this module so the
 * wire format has a single source of truth.
 */

export const LIVE_PROTOCOL_VERSION = 1 as const;

/** Localhost ports the bridge tries, in order, for the plugin WebSocket. */
export const LIVE_PORTS = [47321, 47322, 47323] as const;
export type LivePort = (typeof LIVE_PORTS)[number];

/** Messages larger than this are rejected with MESSAGE_TOO_LARGE. */
export const MAX_MESSAGE_BYTES = 6 * 1024 * 1024;

export const LIVE_ERROR_CODES = [
  'BAD_CODE',
  'CODE_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'BAD_TOKEN',
  'VERSION_MISMATCH',
  'MESSAGE_TOO_LARGE',
  'BAD_MESSAGE',
] as const;
export type LiveErrorCode = (typeof LIVE_ERROR_CODES)[number];

const v = z.literal(LIVE_PROTOCOL_VERSION);

// ---------------------------------------------------------------------------
// Shared payloads
// ---------------------------------------------------------------------------

export const LiveSelectionMetaSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  nodeType: z.string(),
  fileName: z.string(),
  pageName: z.string(),
});
export type LiveSelectionMeta = z.infer<typeof LiveSelectionMetaSchema>;

/**
 * Summary of a non-component selection, produced by the converter's summarizeFrame().
 * Layout reuses the kit layout mapping so the server can compare it with exported specs.
 */
export const FrameSummarySchema = z.object({
  name: z.string(),
  layout: LayoutSchema.optional(),
  size: z.object({
    width: z.number(),
    height: z.number(),
  }),
  childCount: z.number().int().min(0),
  componentInstances: z.array(z.string()),
  tokenReferences: z.array(z.string()),
  rawValues: z.array(z.string()),
});
export type FrameSummary = z.infer<typeof FrameSummarySchema>;

export const LiveWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  component: z.string(),
  layerPath: z.string(),
  nodeId: z.string().optional(),
  message: z.string(),
});
export type LiveWarning = z.infer<typeof LiveWarningSchema>;

// ---------------------------------------------------------------------------
// Plugin to server
// ---------------------------------------------------------------------------

export const HelloMessageSchema = z.object({
  v,
  type: z.literal('hello'),
  pluginVersion: z.string(),
  fileName: z.string(),
});
export type HelloMessage = z.infer<typeof HelloMessageSchema>;

export const PairMessageSchema = z.object({
  v,
  type: z.literal('pair'),
  code: z.string(),
});
export type PairMessage = z.infer<typeof PairMessageSchema>;

export const ResumeMessageSchema = z.object({
  v,
  type: z.literal('resume'),
  sessionToken: z.string(),
});
export type ResumeMessage = z.infer<typeof ResumeMessageSchema>;

export const SelectionMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    v,
    type: z.literal('selection'),
    meta: LiveSelectionMetaSchema,
    kind: z.literal('component'),
    spec: ComponentSpecSchema,
    image: z.string().nullable(),
    warnings: z.array(LiveWarningSchema),
  }),
  z.object({
    v,
    type: z.literal('selection'),
    meta: LiveSelectionMetaSchema,
    kind: z.literal('frame'),
    spec: FrameSummarySchema,
    image: z.string().nullable(),
    warnings: z.array(LiveWarningSchema),
  }),
]);
export type SelectionMessage = z.infer<typeof SelectionMessageSchema>;

export const PongMessageSchema = z.object({
  v,
  type: z.literal('pong'),
});
export type PongMessage = z.infer<typeof PongMessageSchema>;

export const ByeMessageSchema = z.object({
  v,
  type: z.literal('bye'),
});
export type ByeMessage = z.infer<typeof ByeMessageSchema>;

export const PluginToServerMessageSchema = z.union([
  HelloMessageSchema,
  PairMessageSchema,
  ResumeMessageSchema,
  SelectionMessageSchema,
  PongMessageSchema,
  ByeMessageSchema,
]);
export type PluginToServerMessage = z.infer<typeof PluginToServerMessageSchema>;

// ---------------------------------------------------------------------------
// Server to plugin
// ---------------------------------------------------------------------------

export const WelcomeMessageSchema = z.object({
  v,
  type: z.literal('welcome'),
  serverVersion: z.string(),
  projectName: z.string(),
});
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;

export const PairedMessageSchema = z.object({
  v,
  type: z.literal('paired'),
  sessionToken: z.string(),
});
export type PairedMessage = z.infer<typeof PairedMessageSchema>;

export const ResumedMessageSchema = z.object({
  v,
  type: z.literal('resumed'),
});
export type ResumedMessage = z.infer<typeof ResumedMessageSchema>;

export const PingMessageSchema = z.object({
  v,
  type: z.literal('ping'),
});
export type PingMessage = z.infer<typeof PingMessageSchema>;

export const ErrorMessageSchema = z.object({
  v,
  type: z.literal('error'),
  code: z.enum(LIVE_ERROR_CODES),
  message: z.string(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const ServerToPluginMessageSchema = z.union([
  WelcomeMessageSchema,
  PairedMessageSchema,
  ResumedMessageSchema,
  PingMessageSchema,
  ErrorMessageSchema,
]);
export type ServerToPluginMessage = z.infer<typeof ServerToPluginMessageSchema>;

export const LiveMessageSchema = z.union([
  PluginToServerMessageSchema,
  ServerToPluginMessageSchema,
]);
export type LiveMessage = z.infer<typeof LiveMessageSchema>;

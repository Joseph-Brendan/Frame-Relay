import type { LiveSelectionPayload, MainToUIMessage } from '../shared/messages.js';
import { getAncestorPage } from './find.js';
import { resolveLiveTarget } from './live-resolve.js';
import { snapshotNode } from './snapshot.js';
import { readVariablesAndStyles } from './variables.js';

export const LIVE_SELECTION_DEBOUNCE_MS = 300;
/** Main thread retries the PNG at a smaller scale when it exceeds this size. */
export const LIVE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const LIVE_TOKENS_STORAGE_KEY = 'frame-relay-live-tokens';

let active = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function postToUI(msg: MainToUIMessage): void {
  figma.ui.postMessage(msg);
}

function exportBytes(node: unknown, scale: number): Promise<Uint8Array | null> {
  const candidate = node as { exportAsync?: (settings: object) => Promise<Uint8Array> };
  if (typeof candidate.exportAsync !== 'function') return Promise.resolve(null);
  return candidate
    .exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } })
    .then((bytes) => bytes)
    .catch(() => null);
}

/**
 * Exports a PNG at scale 2; if it is over 4 MB retries at 1, then 0.5.
 */
export async function exportLiveImage(
  node: unknown,
): Promise<{ bytes: number[]; scale: number } | null> {
  for (const scale of [2, 1, 0.5]) {
    const bytes = await exportBytes(node, scale);
    if (!bytes) return null;
    if (bytes.length <= LIVE_IMAGE_MAX_BYTES || scale === 0.5) {
      return { bytes: Array.from(bytes), scale };
    }
  }
  return null;
}

async function pushLiveSelection(): Promise<void> {
  if (!active) return;

  try {
    const target = await resolveLiveTarget(figma.currentPage.selection);
    if (!target) {
      postToUI({ version: 1, type: 'LIVE_SELECTION', selection: null });
      return;
    }

    const snapshot = snapshotNode(target.node);
    const context = await readVariablesAndStyles([snapshot]);
    const image = await exportLiveImage(target.node);
    const page = getAncestorPage(target.node as BaseNode);

    const selection: LiveSelectionPayload = {
      kind: target.kind,
      snapshot,
      variantProperties: target.variantProperties,
      collections: context.collections,
      variables: context.variables,
      styles: context.styles,
      imageBytes: image?.bytes ?? null,
      imageScale: image?.scale ?? null,
      pageName: page?.name ?? figma.currentPage.name,
      fileName: figma.root.name || 'Untitled',
    };

    postToUI({ version: 1, type: 'LIVE_SELECTION', selection });
  } catch (err) {
    postToUI({
      version: 1,
      type: 'LIVE_SELECTION',
      selection: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleSelectionChange(): void {
  if (!active) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void pushLiveSelection();
  }, LIVE_SELECTION_DEBOUNCE_MS);
}

/** Starts the 300ms-debounced selectionchange listener and pushes the current selection. */
export function startLiveWatching(): void {
  if (active) return;
  active = true;
  figma.on('selectionchange', handleSelectionChange);
  void pushLiveSelection();
}

export function stopLiveWatching(): void {
  active = false;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  figma.off('selectionchange', handleSelectionChange);
}

export function isLiveWatching(): boolean {
  return active;
}

export async function getStoredLiveTokens(): Promise<Record<string, string>> {
  try {
    const raw = (await figma.clientStorage.getAsync(LIVE_TOKENS_STORAGE_KEY)) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const tokens: Record<string, string> = {};
    for (const [port, token] of Object.entries(raw)) {
      if (typeof token === 'string' && token.length > 0) tokens[port] = token;
    }
    return tokens;
  } catch {
    return {};
  }
}

export async function setStoredLiveToken(port: number, token: string): Promise<void> {
  try {
    const tokens = await getStoredLiveTokens();
    tokens[String(port)] = token;
    await figma.clientStorage.setAsync(LIVE_TOKENS_STORAGE_KEY, tokens);
  } catch {
    // clientStorage unavailable: live still works for this session
  }
}

export async function clearStoredLiveToken(port: number): Promise<void> {
  try {
    const tokens = await getStoredLiveTokens();
    if (tokens[String(port)] === undefined) return;
    delete tokens[String(port)];
    await figma.clientStorage.setAsync(LIVE_TOKENS_STORAGE_KEY, tokens);
  } catch {
    // ignore
  }
}

import {
  isUIToMainMessage,
  MainToUIMessage,
  ScopeOption,
  UIToMainMessage,
} from '../shared/messages.js';
import {
  exportIcons,
  findComponentsAndIcons,
  getAncestorPage,
  snapshotComponentsInBatches,
} from './find.js';
import { runScreenshotJobs } from './screenshots.js';
import { readVariablesAndStyles } from './variables.js';

let isCancelled = false;

function postToUI(msg: MainToUIMessage): void {
  figma.ui.postMessage(msg);
}

async function getStoredSettings(): Promise<{ scope: ScopeOption; devMode: boolean }> {
  try {
    const scope = (await figma.clientStorage.getAsync('frame-relay-scope')) as
      ScopeOption | undefined;
    const devMode = (await figma.clientStorage.getAsync('frame-relay-devMode')) as
      boolean | undefined;
    return {
      scope: scope === 'selection' ? 'selection' : 'file',
      devMode: typeof devMode === 'boolean' ? devMode : false,
    };
  } catch {
    return { scope: 'file', devMode: false };
  }
}

async function handleSelectNode(nodeId: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      figma.notify('Node not found in document', { error: true });
      return;
    }

    const page = getAncestorPage(node);
    if (page && page.id !== figma.currentPage.id) {
      await figma.setCurrentPageAsync(page);
    }

    if ('visible' in node) {
      figma.currentPage.selection = [node as SceneNode];
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    figma.notify(`Failed to select node: ${errorMsg}`, { error: true });
  }
}

async function handleRunScan(mode: 'lint' | 'export' | 'dump', scope: ScopeOption): Promise<void> {
  isCancelled = false;

  try {
    // 1. Finding components and icons
    postToUI({
      version: 1,
      type: 'PROGRESS',
      stage: 'finding',
      current: 0,
      total: 0,
      message: 'Discovering components and icons...',
    });

    const { components, icons } = await findComponentsAndIcons(scope);

    if (isCancelled) {
      postToUI({ version: 1, type: 'OPERATION_CANCELLED' });
      return;
    }

    // 2. Snapshotting components in batches of 20
    postToUI({
      version: 1,
      type: 'PROGRESS',
      stage: 'snapshots',
      current: 0,
      total: components.length,
      message: `Snapshotting ${components.length} components...`,
    });

    const allSnapshots = await snapshotComponentsInBatches(
      components,
      20,
      (batchSnapshots, isLastBatch, current, total) => {
        if (isCancelled) return;
        postToUI({
          version: 1,
          type: 'SNAPSHOTS_BATCH',
          components: batchSnapshots,
          isLastBatch,
        });
        postToUI({
          version: 1,
          type: 'PROGRESS',
          stage: 'snapshots',
          current,
          total,
          message: `Snapshotting components (${current}/${total})...`,
        });
      },
    );

    if (isCancelled) {
      postToUI({ version: 1, type: 'OPERATION_CANCELLED' });
      return;
    }

    // 3. Reading variables and styles
    postToUI({
      version: 1,
      type: 'PROGRESS',
      stage: 'variables',
      current: 0,
      total: 0,
      message: 'Reading variables and styles...',
    });

    const varStyleResult = await readVariablesAndStyles(allSnapshots);

    if (isCancelled) {
      postToUI({ version: 1, type: 'OPERATION_CANCELLED' });
      return;
    }

    // 4. Exporting icons if export or dump mode
    let exportedIcons: Array<{ name: string; svg: string }> = [];
    if (mode === 'export' || mode === 'dump') {
      postToUI({
        version: 1,
        type: 'PROGRESS',
        stage: 'icons',
        current: 0,
        total: icons.length,
        message: `Exporting ${icons.length} icons...`,
      });

      exportedIcons = await exportIcons(icons, (current, total) => {
        postToUI({
          version: 1,
          type: 'PROGRESS',
          stage: 'icons',
          current,
          total,
          message: `Exporting icons (${current}/${total})...`,
        });
      });
    }

    if (isCancelled) {
      postToUI({ version: 1, type: 'OPERATION_CANCELLED' });
      return;
    }

    // 5. Complete snapshots
    postToUI({
      version: 1,
      type: 'SNAPSHOTS_COMPLETE',
      mode,
      icons: exportedIcons,
      collections: varStyleResult.collections,
      variables: varStyleResult.variables,
      styles: varStyleResult.styles,
      warnings: varStyleResult.warnings,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postToUI({
      version: 1,
      type: 'ERROR',
      message: `Failed during scan: ${errorMsg}`,
    });
  }
}

async function handleRequestScreenshots(
  jobs: Array<{ nodeId: string; path: string }>,
): Promise<void> {
  isCancelled = false;

  try {
    postToUI({
      version: 1,
      type: 'PROGRESS',
      stage: 'screenshots',
      current: 0,
      total: jobs.length,
      message: `Exporting ${jobs.length} preview screenshots...`,
    });

    const result = await runScreenshotJobs({
      jobs,
      batchSize: 10,
      onChunk: (chunk) => postToUI(chunk),
      onProgress: (current, total) => {
        postToUI({
          version: 1,
          type: 'PROGRESS',
          stage: 'screenshots',
          current,
          total,
          message: `Exporting screenshots (${current}/${total})...`,
        });
      },
      isCancelled: () => isCancelled,
    });

    if (result.cancelled) {
      postToUI({ version: 1, type: 'OPERATION_CANCELLED' });
    } else {
      postToUI({ version: 1, type: 'SCREENSHOT_COMPLETE' });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    postToUI({
      version: 1,
      type: 'ERROR',
      message: `Screenshot export failed: ${errorMsg}`,
    });
  }
}

export async function main(): Promise<void> {
  figma.showUI(__html__, { width: 420, height: 600, themeColors: true });

  figma.ui.onmessage = async (rawMessage: unknown) => {
    if (!isUIToMainMessage(rawMessage)) return;

    const msg = rawMessage as UIToMainMessage;

    switch (msg.type) {
      case 'INIT_REQUEST': {
        const settings = await getStoredSettings();
        postToUI({
          version: 1,
          type: 'INIT_RESPONSE',
          fileName: figma.root.name || 'Untitled',
          fileKey: figma.fileKey || 'local',
          scope: settings.scope,
          devMode: settings.devMode,
        });
        break;
      }

      case 'SET_SETTINGS': {
        if (msg.scope) {
          await figma.clientStorage.setAsync('frame-relay-scope', msg.scope).catch(() => {});
        }
        if (typeof msg.devMode === 'boolean') {
          await figma.clientStorage.setAsync('frame-relay-devMode', msg.devMode).catch(() => {});
        }
        break;
      }

      case 'RUN_LINT': {
        await handleRunScan('lint', msg.scope);
        break;
      }

      case 'RUN_EXPORT': {
        await handleRunScan('export', msg.scope);
        break;
      }

      case 'RUN_DUMP': {
        await handleRunScan('dump', msg.scope);
        break;
      }

      case 'REQUEST_SCREENSHOTS': {
        await handleRequestScreenshots(msg.jobs);
        break;
      }

      case 'CANCEL_OPERATION': {
        isCancelled = true;
        postToUI({ version: 1, type: 'OPERATION_CANCELLED' });
        break;
      }

      case 'SELECT_NODE': {
        await handleSelectNode(msg.nodeId);
        break;
      }

      case 'NOTIFY': {
        figma.notify(msg.message, { error: !!msg.error });
        break;
      }

      case 'RESIZE_WINDOW': {
        figma.ui.resize(msg.width, msg.height);
        break;
      }
    }
  };
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  figma.notify(`Plugin initialization error: ${message}`, { error: true });
});

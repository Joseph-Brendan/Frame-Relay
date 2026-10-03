import { ScreenshotChunkMessage, ScreenshotJobItem } from '../shared/messages.js';

export interface ScreenshotRunnerOptions {
  jobs: ScreenshotJobItem[];
  batchSize?: number;
  onChunk: (chunk: ScreenshotChunkMessage) => void;
  onProgress?: (current: number, total: number) => void;
  isCancelled: () => boolean;
}

/**
 * Exports Figma nodes to PNG images in batches and streams chunks to UI thread.
 */
export async function runScreenshotJobs(
  options: ScreenshotRunnerOptions,
): Promise<{ completed: boolean; cancelled: boolean }> {
  const { jobs, batchSize = 10, onChunk, onProgress, isCancelled } = options;
  const total = jobs.length;

  for (let i = 0; i < total; i += batchSize) {
    if (isCancelled()) {
      return { completed: false, cancelled: true };
    }

    const batch = jobs.slice(i, i + batchSize);

    for (let j = 0; j < batch.length; j++) {
      if (isCancelled()) {
        return { completed: false, cancelled: true };
      }

      const job = batch[j];
      const currentIndex = i + j + 1;

      try {
        const node = await figma.getNodeByIdAsync(job.nodeId);
        if (node && 'exportAsync' in node) {
          const bytes = await (node as SceneNode).exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: 2 },
          });

          onChunk({
            version: 1,
            type: 'SCREENSHOT_CHUNK',
            nodeId: job.nodeId,
            path: job.path,
            bytes: Array.from(bytes),
            current: currentIndex,
            total,
          });
        }
      } catch {
        // Continue even if one screenshot export fails
      }

      if (onProgress) {
        onProgress(currentIndex, total);
      }
    }

    // Yield to the event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { completed: true, cancelled: false };
}

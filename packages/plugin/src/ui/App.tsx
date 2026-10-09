import { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import JSZip from 'jszip';
import {
  assembleKit,
  ConverterWarning,
  convertComponent,
  convertVariables,
  NodeSnapshot,
} from '@frame-relay/converter';
import { ComponentSpec, TokensFile, validateKit } from '@frame-relay/schema';
import {
  IconExportItem,
  isMainToUIMessage,
  ScopeOption,
  ScreenshotJobItem,
  UIToMainMessage,
} from '../shared/messages.js';
import { Header } from './components/Header.js';
import { ProgressBar } from './components/ProgressBar.js';
import { LintTab } from './components/LintTab.js';
import { ExportSummary, ExportTab, ValidationErrorItem } from './components/ExportTab.js';
import { LiveTab } from './components/LiveTab.js';
import { SettingsModal } from './components/SettingsModal.js';

function postToMain(msg: UIToMainMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function toSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

function countTokens(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  if ('$value' in obj) return 1;
  let count = 0;
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    count += countTokens(val);
  }
  return count;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'lint' | 'export' | 'live'>('lint');
  const [fileName, setFileName] = useState<string>('Untitled');
  const [fileKey, setFileKey] = useState<string>('local');
  const [scope, setScope] = useState<ScopeOption>('file');
  const [devMode, setDevMode] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<'idle' | 'lint' | 'export' | 'dump' | 'analyze'>(
    'idle',
  );
  const [progress, setProgress] = useState<{
    stage: string;
    current: number;
    total: number;
    message?: string;
  } | null>(null);

  // Results State
  const [lintWarnings, setLintWarnings] = useState<ConverterWarning[]>([]);
  const [hasLintRun, setHasLintRun] = useState<boolean>(false);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrorItem[]>([]);
  const [lastExportedName, setLastExportedName] = useState<string | null>(null);

  // Multi-step refs
  const accumulatedSnapshotsRef = useRef<NodeSnapshot[]>([]);
  const activeModeRef = useRef<'idle' | 'lint' | 'export' | 'dump' | 'analyze'>('idle');
  const pendingKitRef = useRef<{
    specs: ComponentSpec[];
    tokens: TokensFile;
    icons: IconExportItem[];
  } | null>(null);
  const screenshotFilesRef = useRef<Record<string, Uint8Array>>({});

  activeModeRef.current = activeMode;

  useEffect(() => {
    // Request initial settings & file metadata
    postToMain({ version: 1, type: 'INIT_REQUEST' });

    const messageHandler = async (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!isMainToUIMessage(msg)) return;

      switch (msg.type) {
        case 'INIT_RESPONSE': {
          setFileName(msg.fileName || 'Untitled');
          setFileKey(msg.fileKey || 'local');
          setScope(msg.scope || 'file');
          setDevMode(!!msg.devMode);
          break;
        }

        case 'PROGRESS': {
          setProgress({
            stage: msg.stage,
            current: msg.current,
            total: msg.total,
            message: msg.message,
          });
          break;
        }

        case 'SNAPSHOTS_BATCH': {
          accumulatedSnapshotsRef.current.push(...msg.components);
          break;
        }

        case 'SNAPSHOTS_COMPLETE': {
          const currentMode = activeModeRef.current;
          const snapshots = accumulatedSnapshotsRef.current;

          if (currentMode === 'dump') {
            const dumpData = {
              dumpedAt: new Date().toISOString(),
              fileName,
              scope,
              components: snapshots,
              collections: msg.collections,
              variables: msg.variables,
              styles: msg.styles,
              icons: msg.icons,
            };
            const blob = new Blob([JSON.stringify(dumpData, null, 2)], {
              type: 'application/json',
            });
            const dateStr = new Date().toISOString().slice(0, 10);
            const dumpName = `frame-relay-dump-${toSlug(fileName)}-${dateStr}.json`;
            triggerDownload(blob, dumpName);

            setIsBusy(false);
            setActiveMode('idle');
            setProgress(null);
            postToMain({
              version: 1,
              type: 'NOTIFY',
              message: `Dumped ${snapshots.length} component snapshots to JSON`,
            });
            return;
          }

          // Run token & component conversion in UI thread
          setProgress({
            stage: 'conversion',
            current: 0,
            total: snapshots.length,
            message: 'Converting design tokens and components...',
          });

          const varResult = convertVariables({
            collections: msg.collections,
            variables: msg.variables,
          });
          const specs: ComponentSpec[] = [];
          const compWarnings: ConverterWarning[] = [];
          const screenshotJobs: ScreenshotJobItem[] = [];

          for (let i = 0; i < snapshots.length; i++) {
            const snap = snapshots[i];
            const compResult = convertComponent({
              node: snap,
              variables: varResult.variableIndex,
              styles: msg.styles,
            });
            if (compResult.spec) {
              specs.push(compResult.spec);
            }
            compWarnings.push(...compResult.warnings);
            screenshotJobs.push(...compResult.screenshotJobs);
          }

          const allWarnings = [...msg.warnings, ...varResult.warnings, ...compWarnings];
          const tokenCount = countTokens(varResult.tokens);
          const modesCount = Object.keys(varResult.tokens?.$modes || {}).length || 1;
          const errorCount = allWarnings.filter((w) => w.severity === 'error').length;
          const warnCount = allWarnings.filter((w) => w.severity !== 'error').length;

          setLintWarnings(allWarnings);
          setHasLintRun(true);
          setExportSummary({
            componentsCount: specs.length,
            iconsCount: msg.icons.length,
            tokensCount: tokenCount,
            modesCount,
            warningsCount: warnCount,
            errorsCount: errorCount,
          });

          if (currentMode === 'lint' || currentMode === 'analyze') {
            setIsBusy(false);
            setActiveMode('idle');
            setProgress(null);
            return;
          }

          if (currentMode === 'export') {
            pendingKitRef.current = {
              specs,
              tokens: varResult.tokens,
              icons: msg.icons,
            };
            screenshotFilesRef.current = {};

            if (screenshotJobs.length > 0) {
              postToMain({
                version: 1,
                type: 'REQUEST_SCREENSHOTS',
                jobs: screenshotJobs,
              });
            } else {
              // No screenshots needed, finalize kit directly
              await finalizeExport();
            }
          }
          break;
        }

        case 'SCREENSHOT_CHUNK': {
          screenshotFilesRef.current[msg.path] = new Uint8Array(msg.bytes);
          break;
        }

        case 'SCREENSHOT_COMPLETE': {
          await finalizeExport();
          break;
        }

        case 'OPERATION_CANCELLED': {
          setIsBusy(false);
          setActiveMode('idle');
          setProgress(null);
          postToMain({
            version: 1,
            type: 'NOTIFY',
            message: 'Operation cancelled',
          });
          break;
        }

        case 'ERROR': {
          setIsBusy(false);
          setActiveMode('idle');
          setProgress(null);
          postToMain({
            version: 1,
            type: 'NOTIFY',
            message: msg.message,
            error: true,
          });
          break;
        }
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [fileName, scope]);

  const finalizeExport = async () => {
    const kitData = pendingKitRef.current;
    if (!kitData) {
      setIsBusy(false);
      setActiveMode('idle');
      setProgress(null);
      return;
    }

    setProgress({
      stage: 'zipping',
      current: 0,
      total: 0,
      message: 'Assembling files and creating zip package...',
    });

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const exportedAt = new Date().toISOString();

      const assembled = assembleKit({
        components: kitData.specs,
        tokens: kitData.tokens,
        source: {
          type: 'figma',
          fileKey: fileKey || 'local',
          fileName,
        },
        generator: {
          name: 'frame-relay-plugin',
          version: '0.0.0',
        },
        exportedAt,
        modes: Object.keys(kitData.tokens?.$modes || {}),
      });

      // Validate kit with validateKit
      const componentsRecord: Record<string, unknown> = {};
      for (const comp of kitData.specs) {
        componentsRecord[`components/${comp.name}.json`] = comp;
      }

      const kitValidation = validateKit({
        manifest: JSON.parse(assembled.files['frame-relay.json']),
        tokens: JSON.parse(assembled.files['tokens.json']),
        components: componentsRecord,
      });

      if (!kitValidation.ok) {
        setValidationErrors(
          kitValidation.errors.map((e) => ({
            file: e.file,
            path: e.path,
            message: e.message,
          })),
        );
      } else {
        setValidationErrors([]);
      }

      // Build zip archive
      const zip = new JSZip();
      const kitFolder = zip.folder('frame-relay-kit') || zip;

      // Add assembled json files
      for (const [filePath, content] of Object.entries(assembled.files)) {
        kitFolder.file(filePath, content);
      }

      // Add screenshot images
      for (const [imgPath, bytes] of Object.entries(screenshotFilesRef.current)) {
        kitFolder.file(imgPath, bytes);
      }

      // Add SVG icons
      for (const icon of kitData.icons) {
        kitFolder.file(`icons/${icon.name}.svg`, icon.svg);
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
      });

      const zipName = `frame-relay-kit-${toSlug(fileName)}-${dateStr}.zip`;
      triggerDownload(blob, zipName);
      setLastExportedName(zipName);

      postToMain({
        version: 1,
        type: 'NOTIFY',
        message: `Successfully exported ${zipName}`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      postToMain({
        version: 1,
        type: 'NOTIFY',
        message: `Export failed: ${errMsg}`,
        error: true,
      });
    } finally {
      setIsBusy(false);
      setActiveMode('idle');
      setProgress(null);
      pendingKitRef.current = null;
    }
  };

  const handleScopeChange = (newScope: ScopeOption) => {
    setScope(newScope);
    postToMain({ version: 1, type: 'SET_SETTINGS', scope: newScope });
  };

  const handleDevModeChange = (newDevMode: boolean) => {
    setDevMode(newDevMode);
    postToMain({ version: 1, type: 'SET_SETTINGS', devMode: newDevMode });
  };

  const startScan = (mode: 'lint' | 'export' | 'dump' | 'analyze') => {
    accumulatedSnapshotsRef.current = [];
    setIsBusy(true);
    setActiveMode(mode);

    if (mode === 'lint') {
      postToMain({ version: 1, type: 'RUN_LINT', scope });
    } else if (mode === 'export') {
      postToMain({ version: 1, type: 'RUN_EXPORT', scope });
    } else if (mode === 'dump') {
      postToMain({ version: 1, type: 'RUN_DUMP', scope });
    } else if (mode === 'analyze') {
      postToMain({ version: 1, type: 'RUN_LINT', scope });
    }
  };

  const handleCancel = () => {
    postToMain({ version: 1, type: 'CANCEL_OPERATION' });
  };

  const handleSelectNode = (nodeId: string) => {
    postToMain({ version: 1, type: 'SELECT_NODE', nodeId });
  };

  return (
    <div className="app-container">
      <Header
        fileName={fileName}
        scope={scope}
        onScopeChange={handleScopeChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'lint' ? 'active' : ''}`}
          onClick={() => setActiveTab('lint')}
        >
          Lint
          {lintWarnings.length > 0 && (
            <span
              className="badge-tag"
              style={{
                backgroundColor: lintWarnings.some((w) => w.severity === 'error')
                  ? 'var(--color-danger-bg)'
                  : 'var(--color-warning-bg)',
                color: lintWarnings.some((w) => w.severity === 'error')
                  ? 'var(--color-danger-text)'
                  : 'var(--color-warning-text)',
              }}
            >
              {lintWarnings.length}
            </span>
          )}
        </button>

        <button
          className={`tab-btn ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          Export
        </button>

        <button
          className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          Live
        </button>
      </nav>

      {progress && (
        <ProgressBar
          stage={progress.stage}
          current={progress.current}
          total={progress.total}
          message={progress.message}
          onCancel={handleCancel}
        />
      )}

      {activeTab === 'lint' && (
        <LintTab
          warnings={lintWarnings}
          isRunning={isBusy && activeMode === 'lint'}
          hasRun={hasLintRun}
          scope={scope}
          onRunLint={() => startScan('lint')}
          onSelectNode={handleSelectNode}
        />
      )}

      {activeTab === 'export' && (
        <ExportTab
          summary={exportSummary}
          validationErrors={validationErrors}
          isBusy={isBusy}
          scope={scope}
          lastExportedName={lastExportedName}
          onRunAnalyze={() => startScan('analyze')}
          onRunExport={() => startScan('export')}
        />
      )}

      {activeTab === 'live' && <LiveTab fileName={fileName} />}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        scope={scope}
        devMode={devMode}
        onScopeChange={handleScopeChange}
        onDevModeChange={handleDevModeChange}
        onDumpSnapshots={() => startScan('dump')}
        isDumping={isBusy && activeMode === 'dump'}
      />
    </div>
  );
}

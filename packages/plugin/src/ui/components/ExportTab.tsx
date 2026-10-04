import { JSX } from 'preact';
import { ScopeOption } from '../../shared/messages.js';

export interface ExportSummary {
  componentsCount: number;
  iconsCount: number;
  tokensCount: number;
  modesCount: number;
  warningsCount: number;
  errorsCount: number;
}

export interface ValidationErrorItem {
  file?: string;
  path?: string;
  message: string;
}

export interface ExportTabProps {
  summary: ExportSummary | null;
  validationErrors: ValidationErrorItem[];
  isBusy: boolean;
  scope: ScopeOption;
  lastExportedName: string | null;
  onRunAnalyze: () => void;
  onRunExport: () => void;
}

export function ExportTab({
  summary,
  validationErrors,
  isBusy,
  scope,
  lastExportedName,
  onRunAnalyze,
  onRunExport,
}: ExportTabProps): JSX.Element {
  const scopeLabel = scope === 'selection' ? 'Current Selection' : 'Whole File';

  return (
    <div className="tab-content">
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 600 }}>Export Design Kit</h2>
        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          Assemble component specifications, DTCG tokens, SVG icons, and 2x screenshots into an
          agent-ready kit.
        </p>
      </div>

      {validationErrors.length > 0 && (
        <div className="banner banner-danger">
          <strong>Schema Validation Issues Detected</strong>
          <span>The kit contains the following validation errors, but you can still export:</span>
          <div className="banner-list">
            {validationErrors.slice(0, 5).map((err, idx) => (
              <div key={idx}>
                • {err.file ? `[${err.file}] ` : ''}
                {err.path ? `${err.path}: ` : ''}
                {err.message}
              </div>
            ))}
            {validationErrors.length > 5 && (
              <div>• ...and {validationErrors.length - 5} more issues</div>
            )}
          </div>
        </div>
      )}

      {lastExportedName && (
        <div className="banner banner-success">
          <strong>Export Successful!</strong>
          <span>Downloaded: {lastExportedName}</span>
        </div>
      )}

      {summary ? (
        <div className="card">
          <div className="card-title">Kit Summary ({scopeLabel})</div>
          <div className="summary-grid">
            <div className="summary-stat">
              <span className="stat-label">Components</span>
              <span className="stat-value">{summary.componentsCount}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Icons</span>
              <span className="stat-value">{summary.iconsCount}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Tokens</span>
              <span className="stat-value">{summary.tokensCount}</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Modes</span>
              <span className="stat-value">{summary.modesCount}</span>
            </div>
          </div>

          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
            }}
          >
            <span>
              Warnings:{' '}
              <strong
                style={{
                  color: summary.warningsCount > 0 ? 'var(--color-warning-text)' : 'inherit',
                }}
              >
                {summary.warningsCount}
              </strong>
            </span>
            <span>
              Errors:{' '}
              <strong
                style={{ color: summary.errorsCount > 0 ? 'var(--color-danger-text)' : 'inherit' }}
              >
                {summary.errorsCount}
              </strong>
            </span>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">No Scan Summary Yet</div>
          <p>Analyze your file to preview components, icons, and tokens before export.</p>
          <button
            className="btn btn-secondary"
            onClick={onRunAnalyze}
            disabled={isBusy}
            style={{ marginTop: '8px' }}
          >
            {isBusy ? 'Analyzing...' : 'Analyze Scope'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        {summary && (
          <button
            className="btn btn-secondary"
            onClick={onRunAnalyze}
            disabled={isBusy}
            style={{ flex: 1 }}
          >
            Refresh Summary
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={onRunExport}
          disabled={isBusy}
          style={{ flex: 2 }}
        >
          {isBusy ? 'Exporting...' : 'Export Kit (.zip)'}
        </button>
      </div>
    </div>
  );
}

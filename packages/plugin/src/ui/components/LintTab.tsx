import { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { ConverterWarning, WarningSeverity } from '@frame-relay/converter';
import { ScopeOption } from '../../shared/messages.js';

export interface LintTabProps {
  warnings: ConverterWarning[];
  isRunning: boolean;
  hasRun: boolean;
  scope: ScopeOption;
  onRunLint: () => void;
  onSelectNode: (nodeId: string) => void;
}

export function LintTab({
  warnings,
  isRunning,
  hasRun,
  scope,
  onRunLint,
  onSelectNode,
}: LintTabProps): JSX.Element {
  const [filter, setFilter] = useState<'all' | WarningSeverity>('all');
  const [expandedComponents, setExpandedComponents] = useState<Record<string, boolean>>({});

  const errorsCount = warnings.filter((w) => w.severity === 'error').length;
  const warningsCount = warnings.filter((w) => w.severity === 'warning').length;
  const infoCount = warnings.filter((w) => w.severity === 'info').length;

  const filteredWarnings = warnings.filter((w) =>
    filter === 'all' ? true : w.severity === filter,
  );

  // Group by component
  const grouped = new Map<string, ConverterWarning[]>();
  for (const w of filteredWarnings) {
    const comp = w.component || 'General';
    if (!grouped.has(comp)) grouped.set(comp, []);
    grouped.get(comp)!.push(w);
  }

  const toggleComponent = (comp: string) => {
    setExpandedComponents((prev) => ({
      ...prev,
      [comp]: prev[comp] === undefined ? false : !prev[comp],
    }));
  };

  const isExpanded = (comp: string) => {
    return expandedComponents[comp] !== false; // expanded by default
  };

  const buttonLabel = scope === 'selection' ? 'Check Selection' : 'Check File';

  return (
    <div className="tab-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 600 }}>Design System Lint</h2>
          <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Check naming, layout, and token bindings without exporting.
          </p>
        </div>
        <button className="btn btn-primary" onClick={onRunLint} disabled={isRunning}>
          {isRunning ? 'Checking...' : buttonLabel}
        </button>
      </div>

      {hasRun && (
        <div className="severity-pills">
          <button
            className={`pill-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="pill-count">{warnings.length}</span>
          </button>
          <button
            className={`pill-btn ${filter === 'error' ? 'active' : ''}`}
            onClick={() => setFilter('error')}
          >
            Errors <span className="pill-count">{errorsCount}</span>
          </button>
          <button
            className={`pill-btn ${filter === 'warning' ? 'active' : ''}`}
            onClick={() => setFilter('warning')}
          >
            Warnings <span className="pill-count">{warningsCount}</span>
          </button>
          <button
            className={`pill-btn ${filter === 'info' ? 'active' : ''}`}
            onClick={() => setFilter('info')}
          >
            Info <span className="pill-count">{infoCount}</span>
          </button>
        </div>
      )}

      {!hasRun && !isRunning && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Ready to Lint</div>
          <p>
            Click <strong>{buttonLabel}</strong> to run a dry-run check against Frame-Relay rules.
          </p>
        </div>
      )}

      {hasRun && warnings.length === 0 && (
        <div className="banner banner-success">
          <strong>Everything looks great!</strong>
          <span>All components and tokens passed lint checks with zero issues.</span>
        </div>
      )}

      {hasRun && warnings.length > 0 && filteredWarnings.length === 0 && (
        <div className="empty-state">
          <p>No issues found matching severity filter &quot;{filter}&quot;.</p>
        </div>
      )}

      {hasRun && filteredWarnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from(grouped.entries()).map(([compName, compWarnings]) => {
            const open = isExpanded(compName);
            const hasError = compWarnings.some((w) => w.severity === 'error');
            const hasWarning = compWarnings.some((w) => w.severity === 'warning');

            const badgeClass = hasError
              ? 'badge-error'
              : hasWarning
                ? 'badge-warning'
                : 'badge-info';

            return (
              <div key={compName} className="component-warning-group">
                <div className="group-header" onClick={() => toggleComponent(compName)}>
                  <div className="group-title">
                    <span>{open ? '▼' : '►'}</span>
                    <span>{compName}</span>
                  </div>
                  <span className={`group-badge ${badgeClass}`}>
                    {compWarnings.length} {compWarnings.length === 1 ? 'issue' : 'issues'}
                  </span>
                </div>

                {open && (
                  <div>
                    {compWarnings.map((warning, idx) => {
                      const itemBadgeClass =
                        warning.severity === 'error'
                          ? 'badge-error'
                          : warning.severity === 'warning'
                            ? 'badge-warning'
                            : 'badge-info';

                      return (
                        <div key={`${warning.code}-${idx}`} className="warning-item">
                          <div className="warning-body">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                className={`group-badge ${itemBadgeClass}`}
                                style={{ fontSize: '9px' }}
                              >
                                {warning.severity.toUpperCase()}
                              </span>
                              <span className="warning-code">{warning.code}</span>
                            </div>
                            <div className="warning-message">{warning.message}</div>
                            {warning.layerPath && (
                              <div className="warning-path">Layer: {warning.layerPath}</div>
                            )}
                          </div>

                          {warning.nodeId && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => onSelectNode(warning.nodeId!)}
                              title="Select layer in Figma canvas"
                            >
                              Select
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

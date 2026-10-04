import { JSX } from 'preact';
import { ScopeOption } from '../../shared/messages.js';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  scope: ScopeOption;
  devMode: boolean;
  onScopeChange: (scope: ScopeOption) => void;
  onDevModeChange: (devMode: boolean) => void;
  onDumpSnapshots: () => void;
  isDumping: boolean;
}

export function SettingsModal({
  isOpen,
  onClose,
  scope,
  devMode,
  onScopeChange,
  onDevModeChange,
  onDumpSnapshots,
  isDumping,
}: SettingsModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Settings & Developer Tools</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Default Scope</span>
              <span className="setting-desc">Scope for linting and exporting</span>
            </div>
            <select
              className="scope-select"
              value={scope}
              onChange={(e) => onScopeChange((e.target as HTMLSelectElement).value as ScopeOption)}
            >
              <option value="file">Whole file</option>
              <option value="selection">Selection</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-label">
              <span className="setting-name">Developer Mode</span>
              <span className="setting-desc">Enable debugging and snapshot inspection tools</span>
            </div>
            <input
              type="checkbox"
              checked={devMode}
              onChange={(e) => onDevModeChange((e.target as HTMLInputElement).checked)}
              style={{ cursor: 'pointer' }}
            />
          </div>

          {devMode && (
            <div
              className="card"
              style={{
                marginTop: '4px',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px dashed var(--color-border)',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '11px', marginBottom: '4px' }}>
                Developer Inspection
              </div>
              <p
                style={{
                  fontSize: '10px',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '8px',
                }}
              >
                Dump raw component, variable, and style snapshots into a debug JSON file.
              </p>
              <button
                className="btn btn-secondary btn-sm"
                onClick={onDumpSnapshots}
                disabled={isDumping}
                style={{ width: '100%' }}
              >
                {isDumping ? 'Extracting Snapshots...' : 'Dump Snapshots (.json)'}
              </button>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={onClose}
            style={{ width: '100%', marginTop: '6px' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

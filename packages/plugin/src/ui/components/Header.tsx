import { JSX } from 'preact';
import { ScopeOption } from '../../shared/messages.js';

export interface HeaderProps {
  fileName: string;
  scope: ScopeOption;
  onScopeChange: (scope: ScopeOption) => void;
  onOpenSettings: () => void;
}

export function Header({
  fileName,
  scope,
  onScopeChange,
  onOpenSettings,
}: HeaderProps): JSX.Element {
  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-logo">FR</div>
        <div className="brand-title">Frame-Relay</div>
        <span className="file-name" title={fileName}>
          • {fileName}
        </span>
      </div>

      <div className="header-controls">
        <select
          className="scope-select"
          value={scope}
          onChange={(e) => onScopeChange((e.target as HTMLSelectElement).value as ScopeOption)}
          title="Export and Lint Scope"
        >
          <option value="file">Whole file</option>
          <option value="selection">Selection</option>
        </select>

        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title="Settings & Developer Tools"
          aria-label="Settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v2m0 10v2M1 8h2m10 0h2m-2.5-4.5l-1.4 1.4m-7.2 7.2l-1.4 1.4m0-10l1.4 1.4m7.2 7.2l1.4 1.4" />
          </svg>
        </button>
      </div>
    </header>
  );
}

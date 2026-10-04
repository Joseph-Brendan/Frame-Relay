import { JSX } from 'preact';

export interface ProgressBarProps {
  stage: string;
  current: number;
  total: number;
  message?: string;
  onCancel: () => void;
}

export function ProgressBar({
  stage,
  current,
  total,
  message,
  onCancel,
}: ProgressBarProps): JSX.Element {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="progress-card">
      <div className="progress-header">
        <span>
          <strong>{message || stage}</strong> {total > 0 ? `(${current}/${total})` : ''}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
          style={{ padding: '2px 6px' }}
        >
          Cancel
        </button>
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: total > 0 ? `${percent}%` : '100%',
            transition: total > 0 ? 'width 0.2s ease' : 'none',
          }}
        />
      </div>
    </div>
  );
}

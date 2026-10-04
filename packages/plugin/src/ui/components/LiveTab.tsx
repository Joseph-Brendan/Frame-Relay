import { JSX } from 'preact';

export function LiveTab(): JSX.Element {
  return (
    <div className="tab-content">
      <div className="empty-state" style={{ padding: '40px 16px' }}>
        <div className="empty-state-icon">⚡</div>
        <div className="empty-state-title">Live Mode</div>
        <div
          className="badge-tag"
          style={{ margin: '4px 0 12px 0', background: 'var(--color-bg-secondary)' }}
        >
          Coming in Phase 7
        </div>
        <p style={{ maxWidth: '280px', lineHeight: 1.5 }}>
          Live mode connects directly to a local development bridge over WebSocket (reserved ports
          47321–47323) to stream design token and component updates to AI agents in real time.
        </p>
        <div
          className="card"
          style={{
            marginTop: '20px',
            textAlign: 'left',
            width: '100%',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>
            Reserved Bridge Ports:
          </div>
          <code
            style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}
          >
            • ws://localhost:47321 (Primary)
            <br />
            • ws://localhost:47322 (Fallback 1)
            <br />• ws://localhost:47323 (Fallback 2)
          </code>
        </div>
      </div>
    </div>
  );
}

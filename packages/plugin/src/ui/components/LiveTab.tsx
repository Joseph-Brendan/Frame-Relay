import { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { convertComponent, convertVariables, summarizeFrame } from '@josephbrendan/converter';
import type { SelectionMessage } from '@josephbrendan/schema';
import {
  isMainToUIMessage,
  LiveSelectionEventMessage,
  UIToMainMessage,
} from '../../shared/messages.js';
import { bytesToBase64, LiveClient, LiveConnectionStatus } from '../live/client.js';

function postToMain(msg: UIToMainMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export interface LiveTabProps {
  fileName: string;
}

interface LastSelectionInfo {
  name: string;
  kind: 'component' | 'frame';
  variant: string | null;
  thumbnail: string | null;
}

function statusClass(status: LiveConnectionStatus): string {
  if (status.state === 'connected') return 'connected';
  if (status.state === 'connecting') return 'connecting';
  if (status.state === 'error') return 'error';
  return 'disconnected';
}

function statusLabel(status: LiveConnectionStatus): string {
  switch (status.state) {
    case 'disconnected':
      return 'Disconnected';
    case 'connecting':
      return status.port ? `Connecting on port ${status.port}...` : 'Connecting...';
    case 'connected':
      return `Connected to ${status.projectName || 'Frame-Relay'}`;
    case 'error':
      return status.message;
  }
}

export function LiveTab({ fileName }: LiveTabProps): JSX.Element {
  const [status, setStatus] = useState<LiveConnectionStatus>({ state: 'disconnected' });
  const [code, setCode] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [lastSelection, setLastSelection] = useState<LastSelectionInfo | null>(null);

  const clientRef = useRef<LiveClient | null>(null);
  const fileNameRef = useRef(fileName);
  fileNameRef.current = fileName;

  useEffect(() => {
    const client = new LiveClient({
      getFileName: () => fileNameRef.current || 'Figma',
      onStatus: (next) => setStatus(next),
      onToken: (port, token) => {
        if (token) postToMain({ version: 1, type: 'LIVE_SET_TOKEN', port, token });
        else postToMain({ version: 1, type: 'LIVE_CLEAR_TOKEN', port });
      },
      onServerError: (errorCode, message) => {
        setHint(`Frame-Relay error (${errorCode}): ${message}`);
      },
    });
    clientRef.current = client;

    const handleSelectionEvent = async (msg: LiveSelectionEventMessage): Promise<void> => {
      if (msg.error) {
        setHint(msg.error);
        return;
      }
      if (!msg.selection) {
        setHint('Select one layer to share it live');
        return;
      }
      if (client.getStatus().state !== 'connected') return;

      const payload = msg.selection;
      const varResult = convertVariables({
        collections: payload.collections,
        variables: payload.variables,
      });
      const meta = {
        nodeId: payload.snapshot.id,
        name: payload.snapshot.name,
        nodeType: payload.snapshot.type,
        fileName: payload.fileName,
        pageName: payload.pageName,
      };
      const image = payload.imageBytes ? bytesToBase64(payload.imageBytes) : null;

      let message: SelectionMessage;
      if (payload.kind === 'component') {
        const result = convertComponent({
          node: payload.snapshot,
          variables: varResult.variableIndex,
          styles: payload.styles,
        });
        if (!result.spec) {
          setHint('Could not convert that layer. Try selecting the component or component set.');
          return;
        }
        message = {
          v: 1,
          type: 'selection',
          meta,
          kind: 'component',
          spec: result.spec,
          image,
          warnings: result.warnings,
        };
      } else {
        const summary = summarizeFrame(payload.snapshot, varResult.variableIndex, payload.styles);
        message = {
          v: 1,
          type: 'selection',
          meta,
          kind: 'frame',
          spec: summary,
          image,
          warnings: [],
        };
      }

      const outcome = client.sendSelection(message);
      if (outcome === 'too_large') {
        setHint("That selection's preview is too large to send. Try selecting a smaller layer.");
        return;
      }
      if (outcome === 'sent') {
        setHint(null);
        setLastSelection({
          name: payload.snapshot.name,
          kind: payload.kind,
          variant: payload.variantProperties
            ? Object.entries(payload.variantProperties)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ')
            : null,
          thumbnail: image,
        });
      }
    };

    const messageHandler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!isMainToUIMessage(msg)) return;
      if (msg.type === 'LIVE_TOKENS') {
        client.setTokens(msg.tokens);
        void client.resumeSaved();
      } else if (msg.type === 'LIVE_SELECTION') {
        void handleSelectionEvent(msg);
      }
    };

    window.addEventListener('message', messageHandler);
    postToMain({ version: 1, type: 'LIVE_GET_TOKENS' });

    return () => {
      window.removeEventListener('message', messageHandler);
      client.destroy();
      postToMain({ version: 1, type: 'LIVE_SET_ACTIVE', active: false });
    };
  }, []);

  useEffect(() => {
    postToMain({ version: 1, type: 'LIVE_SET_ACTIVE', active: status.state === 'connected' });
  }, [status.state]);

  const isConnected = status.state === 'connected';
  const isConnecting = status.state === 'connecting';
  const canConnect = /^\d{6}$/.test(code) && !isConnected && !isConnecting;

  const handleConnect = () => {
    if (clientRef.current && canConnect) {
      setHint(null);
      void clientRef.current.connect(code);
    }
  };

  const handleDisconnect = () => {
    clientRef.current?.disconnect();
    setHint(null);
  };

  const handleCodeInput = (event: JSX.TargetedEvent<HTMLInputElement>) => {
    setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6));
  };

  return (
    <div className="tab-content">
      <div>
        <h2 style={{ fontSize: '14px', fontWeight: 600 }}>Live Mode</h2>
        <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          Share your current Figma selection with the agent so it can match designs exactly.
        </p>
      </div>

      <div className="card">
        <div className="live-status-row">
          <span className={`live-status-pill ${statusClass(status)}`}>{statusLabel(status)}</span>
        </div>

        {!isConnected && (
          <div className="live-connect-row">
            <input
              className="live-code-input"
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              maxLength={6}
              value={code}
              onInput={handleCodeInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleConnect();
              }}
            />
            <button className="btn btn-primary" disabled={!canConnect} onClick={handleConnect}>
              Connect
            </button>
          </div>
        )}

        {isConnected && (
          <div className="live-connect-row">
            <button className="btn btn-secondary" onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        )}

        {hint && (
          <div className={`live-hint ${status.state === 'error' ? 'live-hint-error' : ''}`}>
            {hint}
          </div>
        )}

        {lastSelection && (
          <div className="live-selection">
            {lastSelection.thumbnail && (
              <img
                className="live-thumbnail"
                src={`data:image/png;base64,${lastSelection.thumbnail}`}
                alt={lastSelection.name}
              />
            )}
            <div>
              <div className="live-selection-name">{lastSelection.name}</div>
              <div className="live-selection-meta">
                {lastSelection.kind}
                {lastSelection.variant ? ` · ${lastSelection.variant}` : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="live-privacy-note">
        Live mode only talks to Frame-Relay on this computer. Nothing leaves your machine.
      </div>
    </div>
  );
}

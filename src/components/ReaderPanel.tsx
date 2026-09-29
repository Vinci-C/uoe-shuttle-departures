import { useRef, useState } from "react";
import type { ReaderState } from "../hooks/useReader";
import type { BoothConfig } from "../hooks/useBoothConfig";
import type { BoardingsStatus } from "../hooks/useBoardings";
import { STOP_OPTIONS, type Connection } from "../config";
import { verifyIngestToken, type TokenCheck } from "../lib/boardings";
import "./ReaderPanel.css";

export interface WriteState {
  ok: boolean | null;
  message: string | null;
  /**
   * Set when the write failed for a reason the operator must fix, rather than a network
   * blip. Drives the styling so a rejected ingest token does not read like a wifi drop.
   */
  fatal?: boolean;
}

interface ReaderPanelProps {
  reader: ReaderState;
  config: BoothConfig;
  boardingsStatus: BoardingsStatus;
  outboxPending: number;
  writeState: WriteState;
  onSimulateTap: () => void;
  onFlushOutbox: () => void;
  onDiscardOutbox: () => void;
}

const READER_STATUS_TEXT: Record<ReaderState["status"], string> = {
  unsupported: "Not available in this browser",
  disconnected: "Reader not connected",
  connecting: "Opening serial port…",
  listening: "Listening for taps",
  error: "Reader error",
};

const LIVE_STATUS_TEXT: Record<BoardingsStatus, string> = {
  disabled: "No database configured",
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  error: "Connection problem",
};

const ReaderPanel: React.FC<ReaderPanelProps> = ({
  reader,
  config,
  boardingsStatus,
  outboxPending,
  writeState,
  onSimulateTap,
  onFlushOutbox,
  onDiscardOutbox,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", url: "", anonKey: "", ingestToken: "" });
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [tokenCheck, setTokenCheck] = useState<TokenCheck | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const readOnly = !config.activeConnection?.ingestToken;

  const openEditor = (id: string | null) => {
    const existing = config.connections.find((c) => c.id === id);
    setEditingId(id);
    setTokenCheck(null);
    setForm({
      label: existing?.label ?? "",
      url: existing?.url ?? "",
      anonKey: existing?.anonKey ?? "",
      ingestToken: existing?.ingestToken ?? "",
    });
  };

  const payload = (): Omit<Connection, "id"> & { id?: string } => ({
    id: editingId ?? undefined,
    label: form.label || form.url,
    url: form.url.trim(),
    anonKey: form.anonKey.trim(),
    ingestToken: form.ingestToken.trim() || undefined,
  });

  /** The same fields, with an id that satisfies the Connection shape the check expects. */
  const candidate = (): Connection => ({ ...payload(), id: editingId ?? "pending" });

  const commit = () => {
    config.upsertConnection(payload());
    setEditingId(null);
    setTokenCheck(null);
  };

  /**
   * A rejected token blocks the save, because a saved connection should always be a
   * working one and the alternative is rediscovering the typo on somebody's tap. Every
   * other outcome saves: an unreachable project says nothing about the token.
   */
  const saveForm = async (force = false) => {
    if (!form.url || !form.anonKey) return;

    setChecking(true);
    const result = await verifyIngestToken(candidate());
    setChecking(false);
    setTokenCheck(result);

    if (result.status === "rejected" && !force) {
      tokenInputRef.current?.focus();
      tokenInputRef.current?.select();
      return;
    }
    commit();
  };

  const doExport = () => {
    const json = config.exportJson();
    setImportText(json);
    setImportMessage(
      "Connections copied below. This includes write-capable ingest tokens — treat it as a secret and do not paste it into a chat or ticket.",
    );
    void navigator.clipboard?.writeText(json).catch(() => {});
  };

  const doImport = async () => {
    try {
      const imported = config.importJson(importText);
      const count = imported.length;
      setImportMessage(`Imported ${count} connection${count === 1 ? "" : "s"}.`);
      setTokenCheck(null);

      // An export can carry a token that has since been rotated, or one from a laptop
      // pointed at a different project, so check what actually landed.
      const withToken = imported.filter((c) => c.ingestToken);
      if (withToken.length === 0) return;

      const results = await Promise.all(withToken.map((c) => verifyIngestToken(c)));
      const accepted = results.filter((r) => r.status === "ok").length;
      if (accepted === withToken.length) {
        setImportMessage(
          `Imported ${count} connection${count === 1 ? "" : "s"}. Token accepted on ${accepted}.`,
        );
      } else {
        setImportMessage(
          `Imported ${count}, but the token was accepted on only ${accepted} of ${withToken.length}. ` +
            `Check the token before using ${accepted === 0 ? "them" : "the rest"} at a booth.`,
        );
      }
    } catch (err) {
      setImportMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <section className="reader-panel" aria-label="Card reader booth controls">
      <div className="reader-panel-row reader-status-row">
        <span className={`status-dot status-${reader.status}`} aria-hidden="true" />
        <div className="reader-status-text">
          <strong>{READER_STATUS_TEXT[reader.status]}</strong>
          <span>
            {reader.portLabel ? `${reader.portLabel} · ` : ""}
            {reader.scanCount} tap{reader.scanCount === 1 ? "" : "s"} this session
          </span>
        </div>
        <div className="reader-panel-actions">
          {reader.status === "listening" || reader.status === "connecting" ? (
            <button type="button" onClick={() => void reader.disconnect()}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void reader.connect()}
              disabled={!reader.supported}
            >
              {reader.hasGrantedPort ? "Reconnect reader" : "Connect reader"}
            </button>
          )}
          <button
            type="button"
            onClick={onSimulateTap}
            disabled={!config.activeConnection}
            title={
              readOnly
                ? "The selected connection has no ingest token, so taps will be rejected. Add one in Connection details."
                : "Records a tap without a card, through the same path as the reader."
            }
          >
            Simulate tap
          </button>
        </div>
      </div>

      {!reader.supported && (
        <p className="reader-note">
          This browser has no Web Serial API, so the reader panel is inactive. Use Chrome or
          Edge on a laptop to talk to the shield. Taps recorded elsewhere still appear on the
          board below.
        </p>
      )}

      {reader.error && (
        <p className="reader-error" role="alert">
          {reader.error}
        </p>
      )}

      <div className="reader-panel-grid">
        <div className="reader-field">
          <label htmlFor="reader-connection">Database</label>
          <select
            id="reader-connection"
            value={config.activeConnectionId ?? config.activeConnection?.id ?? ""}
            onChange={(e) => config.selectConnection(e.target.value)}
          >
            {config.connections.length === 0 && <option value="">None configured</option>}
            {config.connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.label}
                {connection.ingestToken ? "" : " (read only)"}
              </option>
            ))}
          </select>
          <span className="reader-field-note">
            Feed: {LIVE_STATUS_TEXT[boardingsStatus]}
            {readOnly && config.activeConnection ? " · reads only, no ingest token" : ""}
          </span>
        </div>

        <div className="reader-field">
          <label htmlFor="reader-dataset">Dataset</label>
          <div className="reader-inline">
            <input
              id="reader-dataset"
              type="text"
              value={config.dataset}
              onChange={(e) => config.changeDataset(e.target.value)}
            />
            <button type="button" onClick={() => config.newDataset()}>
              New
            </button>
          </div>
          <span className="reader-field-note">
            Visitors must open the board with <code>?dataset={config.dataset}</code>
          </span>
        </div>

        <div className="reader-field">
          <label htmlFor="reader-stop">Stop taps belong to</label>
          <select
            id="reader-stop"
            value={config.stop}
            onChange={(e) => config.changeStop(e.target.value as typeof config.stop)}
          >
            {STOP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="reader-panel-row reader-meta-row">
        <span>
          Outbox: {outboxPending} tap{outboxPending === 1 ? "" : "s"} waiting
          {outboxPending > 0 && (
            <>
              <button type="button" className="link" onClick={onFlushOutbox}>
                retry now
              </button>
              <button
                type="button"
                className="link"
                onClick={onDiscardOutbox}
                title="Throw these taps away. Only useful when they can never be written, e.g. the connection is pointing at the wrong project."
              >
                discard
              </button>
            </>
          )}
        </span>
        <span
          className={
            writeState.fatal
              ? "reader-error"
              : writeState.ok === false
                ? "reader-warn"
                : "reader-ok"
          }
          role={writeState.fatal ? "alert" : "status"}
        >
          {writeState.message ?? "No taps recorded yet this session"}
        </span>
      </div>

      <details className="reader-details" open={editingId !== null}>
        <summary>Connection details</summary>

        <div className="reader-form">
          <div className="reader-field">
            <label htmlFor="conn-label">Label</label>
            <input
              id="conn-label"
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Exhibition laptop"
            />
          </div>
          <div className="reader-field">
            <label htmlFor="conn-url">Project URL</label>
            <input
              id="conn-url"
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://xxxx.supabase.co"
            />
          </div>
          <div className="reader-field">
            <label htmlFor="conn-key">anon public key</label>
            <input
              id="conn-key"
              type="text"
              value={form.anonKey}
              onChange={(e) => setForm({ ...form, anonKey: e.target.value })}
            />
          </div>
          <div className="reader-field">
            <label htmlFor="conn-token">Ingest token (optional)</label>
            <input
              id="conn-token"
              ref={tokenInputRef}
              type="password"
              value={form.ingestToken}
              onChange={(e) => {
                setForm({ ...form, ingestToken: e.target.value });
                setTokenCheck(null);
              }}
              autoComplete="off"
            />
            <span className="reader-field-note">
              Must match the token in <code>supabase/schema.sql</code>. Checked when you save.
              Stored in this browser only.
            </span>
            {tokenCheck && (
              <span
                className={
                  tokenCheck.status === "ok"
                    ? "reader-ok"
                    : tokenCheck.status === "rejected"
                      ? "reader-error"
                      : "reader-warn"
                }
                role={tokenCheck.status === "rejected" ? "alert" : "status"}
              >
                {tokenCheck.status === "ok" ? "Token accepted" : tokenCheck.message}
                {tokenCheck.status === "rejected" && (
                  <>
                    {" — "}
                    <button type="button" className="link" onClick={() => void saveForm(true)}>
                      save anyway
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
          <div className="reader-form-actions">
            <button type="button" className="primary" onClick={() => void saveForm()} disabled={checking}>
              {checking
                ? "Checking…"
                : editingId
                  ? "Update connection"
                  : "Add connection"}
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setTokenCheck(null); }}>
                Cancel
              </button>
            )}
            <button type="button" onClick={() => openEditor(config.activeConnectionId)}>
              Edit selected
            </button>
            {editingId && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  config.removeConnection(editingId);
                  setEditingId(null);
                  setTokenCheck(null);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="reader-transfer">
          <button type="button" onClick={doExport}>
            Export connections
          </button>
          <button type="button" onClick={() => void doImport()} disabled={checking}>
            Import from JSON
          </button>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste exported connection JSON here"
            aria-label="Connection JSON"
            rows={3}
          />
          {importMessage && <p className="reader-field-note">{importMessage}</p>}
          <p className="reader-field-note">
            Exports contain ingest tokens in plain text. Anyone holding one can add taps, so
            only move them between booths you control.
          </p>
        </div>
      </details>
    </section>
  );
};

export default ReaderPanel;

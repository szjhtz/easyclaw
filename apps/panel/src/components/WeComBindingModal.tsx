import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal.js";
import { bindWeComAccount, type WeComBindingStatus } from "../api.js";

interface WeComBindingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: WeComBindingStatus | null;
  onBindingSuccess: () => void;
}

const DEFAULT_RELAY_URL = "wss://relay.easy-claw.com";

export function WeComBindingModal({
  isOpen,
  onClose,
  currentStatus,
  onBindingSuccess,
}: WeComBindingModalProps) {
  const { t } = useTranslation();
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingToken, setBindingToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  function handleClose() {
    setError(null);
    setBindingToken(null);
    setTokenCopied(false);
    onClose();
  }

  async function handleConnect() {
    if (!relayUrl.trim()) return;

    setConnecting(true);
    setError(null);
    setBindingToken(null);

    try {
      const result = await bindWeComAccount(relayUrl.trim());
      if (result.ok && result.bindingToken) {
        setBindingToken(result.bindingToken);
        onBindingSuccess();
      } else {
        setError(t("channels.wecomFailedToBind") + " Unknown error");
      }
    } catch (err) {
      setError(t("channels.wecomFailedToBind") + " " + String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleCopyToken() {
    if (!bindingToken) return;
    try {
      await navigator.clipboard.writeText(bindingToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // Fallback: select the token text for manual copy
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("channels.wecomBindingModalTitle")}
      maxWidth={520}
    >
      <div className="modal-form-col">
        {/* Relay URL input */}
        <div>
          <label className="form-label-block">
            {t("channels.wecomRelayUrl")}
          </label>
          <input
            type="text"
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            placeholder={t("channels.wecomRelayUrlPlaceholder")}
            disabled={connecting || !!bindingToken}
          />
          <div className="form-hint">
            {t("channels.wecomRelayUrlHint")}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="modal-error-box">
            {error}
          </div>
        )}

        {/* Binding token display (after successful connect) */}
        {bindingToken && (
          <div className="wecom-token-box">
            <div className="wecom-token-label">
              {t("channels.wecomBindingToken")}
            </div>
            <div className="wecom-token-value">
              <span className="wecom-token-code">{bindingToken}</span>
              <button
                className="btn btn-secondary"
                onClick={handleCopyToken}
              >
                {tokenCopied
                  ? t("channels.wecomTokenCopied")
                  : t("channels.wecomCopyToken")}
              </button>
            </div>
            <div className="wecom-token-instructions">
              {t("channels.wecomInstructions")}
            </div>
          </div>
        )}

        {/* Current status display */}
        {currentStatus && currentStatus !== "error" && (
          <div className="wecom-status-row">
            <span className="wecom-status-label">
              {t("channels.statusRunning")}:
            </span>
            <WeComStatusBadge status={currentStatus} t={t} />
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleClose}>
            {t("common.close")}
          </button>
          {!bindingToken && (
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={connecting || !relayUrl.trim()}
            >
              {connecting
                ? t("channels.wecomConnecting")
                : t("channels.wecomConnect")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function WeComStatusBadge({
  status,
  t,
}: {
  status: WeComBindingStatus;
  t: (key: string) => string;
}) {
  const map: Record<
    WeComBindingStatus,
    { className: string; labelKey: string }
  > = {
    pending: { className: "badge badge-warning", labelKey: "channels.wecomStatusPending" },
    bound: { className: "badge badge-info", labelKey: "channels.wecomStatusBound" },
    active: { className: "badge badge-success", labelKey: "channels.wecomStatusActive" },
    error: { className: "badge badge-danger", labelKey: "channels.wecomStatusError" },
  };

  const entry = map[status];
  return <span className={entry.className}>{t(entry.labelKey)}</span>;
}

export { WeComStatusBadge };

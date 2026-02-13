import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { Modal } from "./Modal.js";
import { bindWeComAccount, fetchWeComBindingStatus } from "../api.js";

interface WeComBindingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBindingSuccess: () => void;
}

// Hardcoded default relay (our own server)
const DEFAULT_RELAY_URL = "ws://49.235.178.19:3001";
const DEFAULT_AUTH_TOKEN = "easyclaw-relay-secret-2024";

export function WeComBindingModal({
  isOpen,
  onClose,
  onBindingSuccess,
}: WeComBindingModalProps) {
  const { t } = useTranslation();

  // QR code state
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [customerServiceUrl, setCustomerServiceUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingSuccess, setBindingSuccess] = useState(false);

  // Already-bound state
  const [alreadyBound, setAlreadyBound] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRelayUrl, setCustomRelayUrl] = useState("");
  const [customAuthToken, setCustomAuthToken] = useState("");
  const [customSubmitting, setCustomSubmitting] = useState(false);

  // Polling ref
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // Generate QR code from URL
  async function generateQR(url: string) {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 280,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
      setCustomerServiceUrl(url);
    } catch {
      setError(t("channels.wecomQrGenerationFailed"));
    }
  }

  // Fetch binding link from relay
  async function fetchBindingLink(relayUrl: string, authToken: string) {
    setLoading(true);
    setError(null);
    setQrDataUrl(null);
    setCustomerServiceUrl(null);
    setBindingSuccess(false);

    try {
      const result = await bindWeComAccount(relayUrl, authToken);
      if (result.ok && result.customerServiceUrl) {
        await generateQR(result.customerServiceUrl);
        startPolling();
      } else {
        setError(t("channels.wecomFailedToBind") + " " + t("channels.wecomUnknownError"));
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("timed out") || msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
        setError(t("channels.wecomRelayUnavailable"));
      } else if (msg.includes("Authentication")) {
        setError(t("channels.wecomAuthError"));
      } else {
        setError(t("channels.wecomFailedToBind") + " " + msg);
      }
    } finally {
      setLoading(false);
      setCustomSubmitting(false);
    }
  }

  // Poll binding status
  function startPolling() {
    stopPolling();

    async function poll() {
      try {
        const status = await fetchWeComBindingStatus();
        if (status.status === "bound") {
          setBindingSuccess(true);
          stopPolling();
          onBindingSuccess();
          return;
        }
      } catch {
        // Ignore polling errors
      }
      pollTimerRef.current = setTimeout(poll, 2000);
    }
    pollTimerRef.current = setTimeout(poll, 2000);
  }

  // Check binding status first when dialog opens
  useEffect(() => {
    if (isOpen && !qrDataUrl && !loading && !error && !bindingSuccess && !alreadyBound && !checkingStatus) {
      setCheckingStatus(true);
      fetchWeComBindingStatus()
        .then((status) => {
          if (status.status != null) {
            setAlreadyBound(true);
          } else {
            fetchBindingLink(DEFAULT_RELAY_URL, DEFAULT_AUTH_TOKEN);
          }
        })
        .catch(() => {
          // Status check failed, proceed with binding flow
          fetchBindingLink(DEFAULT_RELAY_URL, DEFAULT_AUTH_TOKEN);
        })
        .finally(() => setCheckingStatus(false));
    }
    // Cleanup on close
    if (!isOpen) {
      stopPolling();
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  function handleClose() {
    stopPolling();
    setError(null);
    setQrDataUrl(null);
    setCustomerServiceUrl(null);
    setBindingSuccess(false);
    setAlreadyBound(false);
    setCheckingStatus(false);
    setShowAdvanced(false);
    setCustomRelayUrl("");
    setCustomAuthToken("");
    setCustomSubmitting(false);
    onClose();
  }

  function handleRebind() {
    setAlreadyBound(false);
    fetchBindingLink(DEFAULT_RELAY_URL, DEFAULT_AUTH_TOKEN);
  }

  function handleCustomSubmit() {
    const url = customRelayUrl.trim();
    const token = customAuthToken.trim();
    if (!url || !token) return;
    setCustomSubmitting(true);
    stopPolling();
    fetchBindingLink(url, token);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("channels.wecomBindingModalTitle")}
      maxWidth={420}
    >
      <div className="modal-form-col">
        {/* Already bound state */}
        {alreadyBound && !loading && !bindingSuccess && (
          <div className="wecom-qr-container">
            <div className="wecom-binding-success">
              {t("channels.wecomBindingSuccessIcon")}
            </div>
            <div className="wecom-binding-success-text">
              {t("channels.wecomAlreadyBound")}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRebind}
            >
              {t("channels.wecomRebind")}
            </button>
          </div>
        )}

        {/* Loading state */}
        {(loading || checkingStatus) && !alreadyBound && (
          <div className="wecom-qr-container">
            <div className="wecom-qr-loading">
              {t("channels.wecomGeneratingQr")}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="modal-error-box">
            {error}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fetchBindingLink(DEFAULT_RELAY_URL, DEFAULT_AUTH_TOKEN)}
            >
              {t("channels.retry")}
            </button>
          </div>
        )}

        {/* QR code display */}
        {qrDataUrl && !bindingSuccess && !loading && (
          <div className="wecom-qr-container">
            <img
              src={qrDataUrl}
              alt="WeChat QR Code"
              className="wecom-qr-image"
            />
            <div className="wecom-qr-hint">
              {t("channels.wecomScanQrHint")}
            </div>
            <div className="wecom-qr-waiting">
              {t("channels.wecomWaitingForScan")}
            </div>
          </div>
        )}

        {/* Binding success */}
        {bindingSuccess && (
          <div className="wecom-qr-container">
            <div className="wecom-binding-success">
              {t("channels.wecomBindingSuccessIcon")}
            </div>
            <div className="wecom-binding-success-text">
              {t("channels.wecomBindingSuccess")}
            </div>
          </div>
        )}

        {/* Advanced settings toggle */}
        {!bindingSuccess && !alreadyBound && (
          <div className="wecom-advanced-section">
            <button
              className="btn-link wecom-advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? "▾" : "▸"} {t("channels.wecomAdvancedSettings")}
            </button>

            {showAdvanced && (
              <div className="wecom-advanced-form">
                <div>
                  <label className="form-label-block">
                    {t("channels.wecomRelayUrl")}
                  </label>
                  <input
                    type="text"
                    value={customRelayUrl}
                    onChange={(e) => setCustomRelayUrl(e.target.value)}
                    placeholder={t("channels.wecomRelayUrlPlaceholder")}
                    disabled={customSubmitting}
                  />
                </div>
                <div>
                  <label className="form-label-block">
                    {t("channels.wecomAuthToken")}
                  </label>
                  <input
                    type="password"
                    value={customAuthToken}
                    onChange={(e) => setCustomAuthToken(e.target.value)}
                    placeholder={t("channels.wecomAuthTokenPlaceholder")}
                    disabled={customSubmitting}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleCustomSubmit}
                  disabled={customSubmitting || !customRelayUrl.trim() || !customAuthToken.trim()}
                >
                  {customSubmitting
                    ? t("channels.wecomConnecting")
                    : t("channels.wecomApplyCustomRelay")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Close button */}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleClose}>
            {(bindingSuccess || alreadyBound) ? t("common.done") : t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

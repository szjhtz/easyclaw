import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ALL_CHANNELS, CUSTOM_CHANNELS } from "@easyclaw/core";
import { fetchChannels, createChannel, deleteChannel, type Channel } from "../api.js";

const tableStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  borderCollapse: "collapse",
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "2px solid #e0e0e0",
  fontSize: 13,
  color: "#5f6368",
  fontWeight: 600,
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  fontSize: 14,
};

export function ChannelsPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<{ key: string; detail?: string } | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    try {
      setChannels(await fetchChannels());
      setError(null);
    } catch (err) {
      setError({ key: "channels.failedToLoad", detail: String(err) });
    }
  }

  async function handleConnect(channelType: string) {
    if (!accountId.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createChannel({
        channelType,
        enabled: true,
        accountId: accountId.trim(),
        settings: {},
      });
      setConfiguring(null);
      setAccountId("");
      await loadChannels();
    } catch (err) {
      setError({ key: "channels.failedToSave", detail: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(id: string) {
    setError(null);
    try {
      await deleteChannel(id);
      await loadChannels();
    } catch (err) {
      setError({ key: "channels.failedToDelete", detail: String(err) });
    }
  }

  const isComingSoon = (ch: string) => (CUSTOM_CHANNELS as readonly string[]).includes(ch);
  const connectedTypes = new Set(channels.map((ch) => ch.channelType));
  const availableChannels = ALL_CHANNELS.filter((ch) => !connectedTypes.has(ch));

  return (
    <div>
      <h1>{t("channels.title")}</h1>
      <p>{t("channels.description")}</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{t(error.key)}{error.detail ?? ""}</div>
      )}

      {/* Section A: Connected Channels table */}
      <h3>{t("channels.connectedTitle")}</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("channels.colChannel")}</th>
            <th style={thStyle}>{t("channels.colAccountId")}</th>
            <th style={thStyle}>{t("channels.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {channels.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: "24px 12px" }}>
                {t("channels.noChannels")}
              </td>
            </tr>
          ) : (
            channels.map((ch) => (
              <tr key={ch.id}>
                <td style={tdStyle}>
                  <strong>{t(`channels.label_${ch.channelType}`)}</strong>
                </td>
                <td style={tdStyle}>
                  <code style={{ backgroundColor: "#f1f3f4", padding: "1px 5px", borderRadius: 3, fontSize: 13 }}>
                    {ch.accountId}
                  </code>
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleDisconnect(ch.id)}
                    style={{
                      padding: "3px 8px",
                      border: "1px solid #e57373",
                      borderRadius: 4,
                      backgroundColor: "transparent",
                      color: "#c62828",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {t("channels.disconnect")}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Section B: Available Channels cards */}
      {availableChannels.length > 0 && (
        <>
          <h3 style={{ marginTop: 32 }}>{t("channels.availableTitle")}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
            {availableChannels.map((ch) => {
              const comingSoon = isComingSoon(ch);

              return (
                <div
                  key={ch}
                  style={{
                    padding: "16px 20px",
                    border: "1px solid #e0e0e0",
                    borderRadius: 8,
                    backgroundColor: "#fff",
                    opacity: comingSoon ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{t(`channels.label_${ch}`)}</strong>
                      {comingSoon && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 10,
                            fontWeight: 500,
                            backgroundColor: "#fff3e0",
                            color: "#e65100",
                          }}
                        >
                          {t("channels.comingSoon")}
                        </span>
                      )}
                    </div>
                    {!comingSoon && (
                      <button
                        onClick={() => {
                          setConfiguring(configuring === ch ? null : ch);
                          setAccountId("");
                        }}
                        style={{
                          padding: "4px 12px",
                          border: "1px solid #1a73e8",
                          borderRadius: 4,
                          backgroundColor: configuring === ch ? "#1a73e8" : "transparent",
                          color: configuring === ch ? "#fff" : "#1a73e8",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {t("channels.configure")}
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    {t(`channels.desc_${ch}`)}
                  </div>

                  {configuring === ch && !comingSoon && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e0e0e0" }}>
                      <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>
                        {t("channels.accountIdLabel")}
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          value={accountId}
                          onChange={(e) => setAccountId(e.target.value)}
                          placeholder={t("channels.accountIdPlaceholder")}
                          style={{
                            flex: 1,
                            padding: 8,
                            borderRadius: 4,
                            border: "1px solid #e0e0e0",
                            fontSize: 13,
                          }}
                        />
                        <button
                          onClick={() => handleConnect(ch)}
                          disabled={saving || !accountId.trim()}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: "#1a73e8",
                            color: "#fff",
                            border: "none",
                            borderRadius: 4,
                            cursor: saving ? "default" : "pointer",
                            opacity: saving || !accountId.trim() ? 0.6 : 1,
                            fontSize: 13,
                          }}
                        >
                          {saving ? "..." : t("common.save")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

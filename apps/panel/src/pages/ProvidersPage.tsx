import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ALL_PROVIDERS, PROVIDER_URLS, getDefaultModelForProvider } from "@easyclaw/core";
import type { LLMProvider } from "@easyclaw/core";
import {
  fetchSettings,
  updateSettings,
  fetchProviderKeys,
  createProviderKey,
  updateProviderKey,
  activateProviderKey,
  deleteProviderKey,
} from "../api.js";
import type { ProviderKeyEntry } from "../api.js";
import { ModelSelect } from "../components/ModelSelect.js";

const tableStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 800,
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

export function ProvidersPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ProviderKeyEntry[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<string>("");
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newModel, setNewModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; detail?: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [keysList, settings] = await Promise.all([fetchProviderKeys(), fetchSettings()]);
      setKeys(keysList);
      if (settings["llm-provider"]) {
        setDefaultProvider(settings["llm-provider"]);
      }
      setError(null);
    } catch (err) {
      setError({ key: "providers.failedToLoad", detail: String(err) });
    }
  }

  async function handleAddKey(provider: string) {
    if (!apiKey.trim()) return;
    setValidating(true);
    setError(null);
    try {
      const entry = await createProviderKey({
        provider,
        label: newLabel.trim() || t("providers.labelDefault"),
        model: newModel || getDefaultModelForProvider(provider as LLMProvider).modelId,
        apiKey: apiKey.trim(),
      });

      // If first key overall, set as active provider
      if (keys.length === 0 || !defaultProvider) {
        await updateSettings({ "llm-provider": provider });
        setDefaultProvider(provider);
      }

      setApiKey("");
      setNewLabel("");
      setNewModel("");
      setExpandedProvider(null);
      setSavedId(entry.id);
      setTimeout(() => setSavedId(null), 2000);
      await loadData();
    } catch (err) {
      setError({ key: "providers.failedToSave", detail: String(err) });
    } finally {
      setSaving(false);
      setValidating(false);
    }
  }

  async function handleUpdateKey(keyId: string, provider: string) {
    if (!apiKey.trim()) return;
    setValidating(true);
    setError(null);
    try {
      // Delete old and create new (update key = re-add with same metadata)
      const existing = keys.find((k) => k.id === keyId);
      await deleteProviderKey(keyId);
      const entry = await createProviderKey({
        provider,
        label: existing?.label || t("providers.labelDefault"),
        model: existing?.model || getDefaultModelForProvider(provider as LLMProvider).modelId,
        apiKey: apiKey.trim(),
      });

      // If the deleted key was default, activate the new one
      if (existing?.isDefault) {
        await activateProviderKey(entry.id);
      }

      setApiKey("");
      setExpandedKeyId(null);
      setSavedId(entry.id);
      setTimeout(() => setSavedId(null), 2000);
      await loadData();
    } catch (err) {
      setError({ key: "providers.failedToSave", detail: String(err) });
      await loadData();
    } finally {
      setSaving(false);
      setValidating(false);
    }
  }

  async function handleActivate(keyId: string, provider: string) {
    setError(null);
    try {
      await activateProviderKey(keyId);
      await updateSettings({ "llm-provider": provider });
      setDefaultProvider(provider);
      await loadData();
    } catch (err) {
      setError({ key: "providers.failedToSave", detail: String(err) });
    }
  }

  async function handleRemoveKey(keyId: string) {
    setError(null);
    try {
      await deleteProviderKey(keyId);
      await loadData();
    } catch (err) {
      setError({ key: "providers.failedToSave", detail: String(err) });
    }
  }

  async function handleModelChange(keyId: string, model: string) {
    setError(null);
    try {
      await updateProviderKey(keyId, { model });
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, model } : k)));
    } catch (err) {
      setError({ key: "providers.failedToSave", detail: String(err) });
    }
  }

  function renderHint(provider: string) {
    const cmd = provider === "anthropic" ? "claude setup-token" : provider === "amazon-bedrock" ? "aws configure" : "";
    const hint = t(`providers.hint_${provider}`, { cmd, defaultValue: "" });
    if (!hint) return null;
    if (!cmd) return <span style={{ color: "#5f6368" }}>{hint} </span>;
    const parts = hint.split(cmd);
    if (parts.length === 2) {
      return (
        <span style={{ color: "#5f6368" }}>
          {parts[0]}
          <code style={{ backgroundColor: "#f1f3f4", padding: "1px 5px", borderRadius: 3, fontFamily: "monospace" }}>{cmd}</code>
          {parts[1]}{" "}
        </span>
      );
    }
    return <span style={{ color: "#5f6368" }}>{hint} </span>;
  }

  return (
    <div>
      <h1>{t("providers.title")}</h1>
      <p>{t("providers.description")}</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{t(error.key)}{error.detail ?? ""}</div>
      )}

      {/* Section A: Configured Keys table */}
      <h3>{t("providers.configuredKeysTitle")}</h3>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("providers.colProvider")}</th>
            <th style={thStyle}>{t("providers.colLabel")}</th>
            <th style={thStyle}>{t("providers.colModel")}</th>
            <th style={thStyle}>{t("providers.colStatus")}</th>
            <th style={thStyle}>{t("providers.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: "24px 12px" }}>
                {t("providers.noKeys")}
              </td>
            </tr>
          ) : (
            keys.map((k) => {
              const isActive = k.isDefault && k.provider === defaultProvider;
              const isExp = expandedKeyId === k.id;
              return (
                <tr key={k.id}>
                  <td style={tdStyle}>
                    <strong>{t(`providers.label_${k.provider}`)}</strong>
                    {savedId === k.id && (
                      <span style={{ marginLeft: 8, color: "green", fontSize: 12 }}>{t("common.saved")}</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#555" }}>{k.label}</span>
                  </td>
                  <td style={tdStyle}>
                    <ModelSelect
                      provider={k.provider}
                      value={k.model}
                      onChange={(model) => handleModelChange(k.id, model)}
                    />
                  </td>
                  <td style={tdStyle}>
                    {isActive && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: "#c2d9fc",
                          color: "#1a56c4",
                        }}
                      >
                        {t("providers.active")}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!isActive && (
                        <button
                          onClick={() => handleActivate(k.id, k.provider)}
                          style={{
                            padding: "3px 8px",
                            border: "1px solid #1a73e8",
                            borderRadius: 4,
                            backgroundColor: "transparent",
                            color: "#1a73e8",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          {t("providers.activate")}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setExpandedKeyId(isExp ? null : k.id);
                          setApiKey("");
                        }}
                        style={{
                          padding: "3px 8px",
                          border: "1px solid #888",
                          borderRadius: 4,
                          backgroundColor: "transparent",
                          color: "#555",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {t("providers.updateKey")}
                      </button>
                      <button
                        onClick={() => handleRemoveKey(k.id)}
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
                        {t("providers.removeKey")}
                      </button>
                    </div>
                    {isExp && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            autoComplete="off"
                            data-1p-ignore
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={k.provider === "anthropic" ? t("providers.anthropicUpdatePlaceholder") : t("providers.updateKeyPlaceholder")}
                            style={{
                              flex: 1,
                              padding: 8,
                              borderRadius: 4,
                              border: "1px solid #e0e0e0",
                              fontSize: 13,
                              fontFamily: "monospace",
                            }}
                          />
                          <button
                            onClick={() => handleUpdateKey(k.id, k.provider)}
                            disabled={saving || validating || !apiKey.trim()}
                            style={{
                              padding: "8px 16px",
                              backgroundColor: "#1a73e8",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              cursor: saving || validating ? "default" : "pointer",
                              opacity: saving || validating || !apiKey.trim() ? 0.6 : 1,
                              fontSize: 13,
                            }}
                          >
                            {validating ? t("providers.validating") : saving ? "..." : t("common.save")}
                          </button>
                        </div>
                        <small style={{ color: "#888", fontSize: 11 }}>
                          {t("providers.apiKeyHelp")}
                        </small>
                        {k.provider === "anthropic" && (
                          <div style={{ marginTop: 6, padding: "6px 10px", backgroundColor: "#fff8e1", borderRadius: 4, fontSize: 11, color: "#7a6200", lineHeight: 1.5 }}>
                            {t("providers.anthropicTokenWarning")}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Section B: Add Key cards */}
      <h3 style={{ marginTop: 32 }}>{t("providers.addTitle")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
        {ALL_PROVIDERS.map((p) => {
          const isExp = expandedProvider === p;
          return (
            <div
              key={p}
              style={{
                padding: "16px 20px",
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                backgroundColor: "#fff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 15 }}>{t(`providers.label_${p}`)}</strong>
                <button
                  onClick={() => {
                    setExpandedProvider(isExp ? null : p);
                    setApiKey("");
                    setNewLabel("");
                    setNewModel(getDefaultModelForProvider(p).modelId);
                  }}
                  style={{
                    padding: "4px 12px",
                    border: "1px solid #1a73e8",
                    borderRadius: 4,
                    backgroundColor: isExp ? "#1a73e8" : "transparent",
                    color: isExp ? "#fff" : "#1a73e8",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {t("providers.addKey")}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                {t(`providers.desc_${p}`)}
              </div>
              {isExp && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e0e0e0" }}>
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    {renderHint(p)}
                    <a
                      href={PROVIDER_URLS[p as LLMProvider]}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#1a73e8", fontSize: 12 }}
                    >
                      {t("providers.viewPricing")} &rarr;
                    </a>
                  </div>
                  {p === "anthropic" && (
                    <div style={{ marginBottom: 8, padding: "6px 10px", backgroundColor: "#fff8e1", borderRadius: 4, fontSize: 11, color: "#7a6200", lineHeight: 1.5 }}>
                      {t("providers.anthropicTokenWarning")}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, marginBottom: 4, color: "#555" }}>{t("providers.keyLabel")}</div>
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder={t("providers.labelPlaceholder")}
                        style={{
                          width: "100%",
                          padding: 8,
                          borderRadius: 4,
                          border: "1px solid #e0e0e0",
                          fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4, color: "#555" }}>{t("providers.modelLabel")}</div>
                      <ModelSelect
                        provider={p}
                        value={newModel || getDefaultModelForProvider(p).modelId}
                        onChange={setNewModel}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      autoComplete="off"
                      data-1p-ignore
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={p === "anthropic" ? t("providers.anthropicTokenPlaceholder") : t("providers.apiKeyPlaceholder")}
                      style={{
                        flex: 1,
                        padding: 8,
                        borderRadius: 4,
                        border: "1px solid #e0e0e0",
                        fontSize: 13,
                        fontFamily: "monospace",
                      }}
                    />
                    <button
                      onClick={() => handleAddKey(p)}
                      disabled={saving || validating || !apiKey.trim()}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#1a73e8",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        cursor: saving || validating ? "default" : "pointer",
                        opacity: saving || validating || !apiKey.trim() ? 0.6 : 1,
                        fontSize: 13,
                      }}
                    >
                      {validating ? t("providers.validating") : saving ? "..." : t("common.save")}
                    </button>
                  </div>
                  <small style={{ color: "#888", fontSize: 11 }}>
                    {t("providers.apiKeyHelp")}
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

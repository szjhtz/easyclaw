import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchRules, createRule, updateRule, deleteRule, type Rule } from "../api.js";

const EXAMPLE_RULE_KEYS = [
  "onboarding.exampleRule1",
  "onboarding.exampleRule2",
  "onboarding.exampleRule3",
];

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

function StatusBadge({ status }: { status?: Rule["artifactStatus"] }) {
  const { t } = useTranslation();

  const styles: Record<string, { background: string; color: string; label: string }> = {
    ok: { background: "#e6f4ea", color: "#1e7e34", label: t("rules.compiled") },
    failed: { background: "#fce8e6", color: "#c5221f", label: t("rules.failed") },
    pending: { background: "#fef7e0", color: "#b06000", label: t("rules.pending") },
  };

  const info = status ? styles[status] : undefined;
  const background = info?.background ?? "#f1f3f4";
  const color = info?.color ?? "#5f6368";
  const label = info?.label ?? t("rules.notCompiled");

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        background,
        color,
      }}
    >
      {label}
    </span>
  );
}

export function RulesPage() {
  const { t } = useTranslation();
  const [rules, setRules] = useState<Rule[]>([]);
  const [newRuleText, setNewRuleText] = useState("");
  const [error, setError] = useState<{ key: string; detail?: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      setRules(await fetchRules());
      setError(null);
    } catch (err) {
      setError({ key: "rules.failedToLoad", detail: String(err) });
    }
  }

  async function handleCreate() {
    if (!newRuleText.trim()) return;
    try {
      await createRule(newRuleText.trim());
      setNewRuleText("");
      await loadRules();
    } catch (err) {
      setError({ key: "rules.failedToCreate", detail: String(err) });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRule(id);
      await loadRules();
    } catch (err) {
      setError({ key: "rules.failedToDelete", detail: String(err) });
    }
  }

  function handleStartEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditText(rule.text);
  }

  async function handleSaveEdit(id: string) {
    if (!editText.trim()) return;
    try {
      await updateRule(id, editText.trim());
      setEditingId(null);
      setEditText("");
      await loadRules();
    } catch (err) {
      setError({ key: "rules.failedToUpdate", detail: String(err) });
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function handleRecompile(rule: Rule) {
    try {
      await updateRule(rule.id, rule.text);
      await loadRules();
    } catch (err) {
      setError({ key: "rules.failedToRecompile", detail: String(err) });
    }
  }

  return (
    <div>
      <h1>{t("rules.title")}</h1>
      <p>{t("rules.description")}</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{t(error.key)}{error.detail ?? ""}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <textarea
          value={newRuleText}
          onChange={(e) => setNewRuleText(e.target.value)}
          placeholder={t("rules.placeholder")}
          rows={3}
          style={{ width: "100%", maxWidth: 600, marginBottom: 8, display: "block" }}
        />
        {rules.length === 0 && !newRuleText && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#888" }}>{t("onboarding.tryExample")}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {EXAMPLE_RULE_KEYS.map((key) => {
                const text = t(key);
                return (
                  <button
                    key={key}
                    onClick={() => setNewRuleText(text)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 16,
                      border: "1px solid #e0e0e0",
                      backgroundColor: "#fff",
                      fontSize: 13,
                      cursor: "pointer",
                      color: "#333",
                    }}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={handleCreate}>{t("rules.addRule")}</button>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("rules.colRule")}</th>
            <th style={thStyle}>{t("rules.colStatus")}</th>
            <th style={thStyle}>{t("rules.colType")}</th>
            <th style={thStyle}>{t("rules.colCreated")}</th>
            <th style={thStyle}>{t("rules.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: "24px 12px" }}>
                {t("rules.emptyState")}
              </td>
            </tr>
          ) : (
            rules.map((rule) => (
              <tr key={rule.id}>
                <td style={{ ...tdStyle, maxWidth: 280 }}>
                  {editingId === rule.id ? (
                    <div>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        style={{ width: "100%", marginBottom: 6, display: "block", fontSize: 13 }}
                      />
                      <button onClick={() => handleSaveEdit(rule.id)} style={{ marginRight: 6, fontSize: 12 }}>
                        {t("common.save")}
                      </button>
                      <button onClick={handleCancelEdit} style={{ fontSize: 12 }}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <span title={rule.text}>
                      {rule.text.length > 80 ? rule.text.slice(0, 80) + "..." : rule.text}
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  <StatusBadge status={rule.artifactStatus} />
                </td>
                <td style={tdStyle}>
                  {rule.artifactType ?? "—"}
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
                  {new Date(rule.createdAt).toLocaleDateString()}
                </td>
                <td style={tdStyle}>
                  {editingId !== rule.id && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleStartEdit(rule)}
                        style={{ cursor: "pointer", fontSize: 12 }}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        onClick={() => handleRecompile(rule)}
                        style={{ cursor: "pointer", fontSize: 12 }}
                      >
                        {t("rules.recompile")}
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        style={{ color: "red", cursor: "pointer", fontSize: 12 }}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

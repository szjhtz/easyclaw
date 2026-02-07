import { useState, useEffect } from "react";
import { fetchRules, createRule, updateRule, deleteRule, type Rule } from "../api.js";

function StatusBadge({ status }: { status?: Rule["artifactStatus"] }) {
  const styles: Record<string, { background: string; color: string; label: string }> = {
    ok: { background: "#e6f4ea", color: "#1e7e34", label: "Compiled" },
    failed: { background: "#fce8e6", color: "#c5221f", label: "Failed" },
    pending: { background: "#fef7e0", color: "#b06000", label: "Pending" },
  };

  const info = status ? styles[status] : undefined;
  const background = info?.background ?? "#f1f3f4";
  const color = info?.color ?? "#5f6368";
  const label = info?.label ?? "Not compiled";

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
  const [rules, setRules] = useState<Rule[]>([]);
  const [newRuleText, setNewRuleText] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      setError("Failed to load rules: " + String(err));
    }
  }

  async function handleCreate() {
    if (!newRuleText.trim()) return;
    try {
      await createRule(newRuleText.trim());
      setNewRuleText("");
      await loadRules();
    } catch (err) {
      setError("Failed to create rule: " + String(err));
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRule(id);
      await loadRules();
    } catch (err) {
      setError("Failed to delete rule: " + String(err));
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
      setError("Failed to update rule: " + String(err));
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
      setError("Failed to recompile rule: " + String(err));
    }
  }

  return (
    <div>
      <h1>Rules</h1>
      <p>Define rules that control agent behavior.</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <textarea
          value={newRuleText}
          onChange={(e) => setNewRuleText(e.target.value)}
          placeholder="Enter a new rule..."
          rows={3}
          style={{ width: "100%", maxWidth: 600, marginBottom: 8, display: "block" }}
        />
        <button onClick={handleCreate}>Add Rule</button>
      </div>

      {rules.length === 0 ? (
        <p style={{ color: "#888" }}>No rules yet. Add your first rule above.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {rules.map((rule) => (
            <li
              key={rule.id}
              style={{
                padding: "12px 16px",
                marginBottom: 8,
                border: "1px solid #e0e0e0",
                borderRadius: 4,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1 }}>
                {editingId === rule.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      style={{ width: "100%", maxWidth: 600, marginBottom: 8, display: "block" }}
                    />
                    <button onClick={() => handleSaveEdit(rule.id)} style={{ marginRight: 8 }}>
                      Save
                    </button>
                    <button onClick={handleCancelEdit}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{rule.text}</span>
                      <StatusBadge status={rule.artifactStatus} />
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                      Created: {new Date(rule.createdAt).toLocaleString()}
                      {rule.artifactType && (
                        <span style={{ marginLeft: 8 }}>
                          Type: {rule.artifactType}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
              {editingId !== rule.id && (
                <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
                  <button
                    onClick={() => handleStartEdit(rule)}
                    style={{ cursor: "pointer" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRecompile(rule)}
                    style={{ cursor: "pointer" }}
                  >
                    Recompile
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    style={{ color: "red", cursor: "pointer" }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

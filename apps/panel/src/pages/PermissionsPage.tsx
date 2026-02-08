import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchPermissions,
  updatePermissions,
  openFileDialog,
  type Permissions,
} from "../api.js";

type PermLevel = "read" | "readwrite";

interface PathEntry {
  path: string;
  permission: PermLevel;
}

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

const switcherBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px",
  border: "1px solid #ccc",
  backgroundColor: active ? "#1a73e8" : "transparent",
  color: active ? "#fff" : "#555",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: active ? 600 : 400,
});

/**
 * Merge readPaths/writePaths into a unified PathEntry list.
 * - path in readPaths only → "read"
 * - path in writePaths (and implicitly readPaths) → "readwrite"
 */
function mergePermissions(perms: Permissions): PathEntry[] {
  const writeSet = new Set(perms.writePaths);
  const allPaths = new Set([...perms.readPaths, ...perms.writePaths]);
  const entries: PathEntry[] = [];
  for (const p of allPaths) {
    entries.push({ path: p, permission: writeSet.has(p) ? "readwrite" : "read" });
  }
  return entries;
}

/**
 * Split PathEntry list back into readPaths/writePaths.
 * - "read" → readPaths only
 * - "readwrite" → both readPaths and writePaths
 */
function splitPermissions(entries: PathEntry[]): Permissions {
  const readPaths: string[] = [];
  const writePaths: string[] = [];
  for (const e of entries) {
    readPaths.push(e.path);
    if (e.permission === "readwrite") {
      writePaths.push(e.path);
    }
  }
  return { readPaths, writePaths };
}

function PermissionSwitcher({
  value,
  onChange,
  t,
}: {
  value: PermLevel;
  onChange: (v: PermLevel) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => onChange("read")}
        style={{
          ...switcherBtnStyle(value === "read"),
          borderRadius: "4px 0 0 4px",
          borderRight: "none",
        }}
      >
        {t("permissions.readOnly")}
      </button>
      <button
        type="button"
        onClick={() => onChange("readwrite")}
        style={{
          ...switcherBtnStyle(value === "readwrite"),
          borderRadius: "0 4px 4px 0",
        }}
      >
        {t("permissions.readWrite")}
      </button>
    </div>
  );
}

export function PermissionsPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<PathEntry[]>([]);
  const [error, setError] = useState<{ key: string; detail?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [pendingPerm, setPendingPerm] = useState<PermLevel>("read");

  useEffect(() => {
    loadPermissions();
  }, []);

  async function loadPermissions() {
    try {
      const perms = await fetchPermissions();
      setEntries(mergePermissions(perms));
      setError(null);
    } catch (err) {
      setError({ key: "permissions.failedToLoad", detail: String(err) });
    }
  }

  async function handleBrowse() {
    setError(null);
    try {
      const selected = await openFileDialog();
      if (!selected) return;
      // Duplicate check
      if (entries.some((e) => e.path === selected)) {
        setError({ key: "permissions.duplicatePath" });
        return;
      }
      setPendingPath(selected);
      setPendingPerm("read");
    } catch (err) {
      setError({ key: "permissions.failedToOpenDialog", detail: String(err) });
    }
  }

  function handleConfirmAdd() {
    if (!pendingPath) return;
    setEntries((prev) => [...prev, { path: pendingPath, permission: pendingPerm }]);
    setPendingPath(null);
  }

  function handleCancelAdd() {
    setPendingPath(null);
  }

  function handleTogglePermission(index: number, perm: PermLevel) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, permission: perm } : e)));
  }

  function handleRemove(index: number) {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    try {
      await updatePermissions(splitPermissions(entries));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError({ key: "permissions.failedToSave", detail: String(err) });
    }
  }

  return (
    <div>
      <h1>{t("permissions.title")}</h1>
      <p>{t("permissions.description")}</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{t(error.key)}{error.detail ?? ""}</div>
      )}

      <div style={{ maxWidth: 720 }}>
        {/* Add path area */}
        <div style={{ marginBottom: 16 }}>
          {pendingPath ? (
            <div
              style={{
                padding: "12px 16px",
                border: "1px solid #1a73e8",
                borderRadius: 8,
                backgroundColor: "#e8f0fe",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <code style={{ backgroundColor: "#fff", padding: "2px 8px", borderRadius: 3, fontSize: 13 }}>
                {pendingPath}
              </code>
              <PermissionSwitcher value={pendingPerm} onChange={setPendingPerm} t={t} />
              <button
                onClick={handleConfirmAdd}
                style={{
                  padding: "4px 14px",
                  backgroundColor: "#1a73e8",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("common.add")}
              </button>
              <button
                onClick={handleCancelAdd}
                style={{
                  padding: "4px 14px",
                  border: "1px solid #888",
                  borderRadius: 4,
                  backgroundColor: "transparent",
                  color: "#555",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button
              onClick={handleBrowse}
              style={{
                padding: "8px 16px",
                border: "1px solid #1a73e8",
                borderRadius: 4,
                backgroundColor: "transparent",
                color: "#1a73e8",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {t("permissions.browsePath")}
            </button>
          )}
        </div>

        {/* Permissions table */}
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{t("permissions.colPath")}</th>
              <th style={thStyle}>{t("permissions.colPermission")}</th>
              <th style={{ ...thStyle, width: 80 }}>{t("permissions.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: "24px 12px" }}>
                  {t("permissions.noPaths")}
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => (
                <tr key={entry.path}>
                  <td style={tdStyle}>
                    <code style={{ backgroundColor: "#f1f3f4", padding: "1px 5px", borderRadius: 3, fontSize: 13 }}>
                      {entry.path}
                    </code>
                  </td>
                  <td style={tdStyle}>
                    <PermissionSwitcher
                      value={entry.permission}
                      onChange={(perm) => handleTogglePermission(i, perm)}
                      t={t}
                    />
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleRemove(i)}
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
                      {t("common.remove")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <button onClick={handleSave} style={{ marginTop: 24 }}>
          {t("permissions.savePermissions")}
        </button>
        {saved && (
          <span style={{ marginLeft: 12, color: "green" }}>{t("common.saved")}</span>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  fetchPermissions,
  updatePermissions,
  type Permissions,
} from "../api.js";

export function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permissions>({
    readPaths: [],
    writePaths: [],
  });
  const [readInput, setReadInput] = useState("");
  const [writeInput, setWriteInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, []);

  async function loadPermissions() {
    try {
      const perms = await fetchPermissions();
      setPermissions(perms);
      setError(null);
    } catch (err) {
      setError("Failed to load permissions: " + String(err));
    }
  }

  function addReadPath() {
    if (!readInput.trim()) return;
    setPermissions((p) => ({
      ...p,
      readPaths: [...p.readPaths, readInput.trim()],
    }));
    setReadInput("");
  }

  function addWritePath() {
    if (!writeInput.trim()) return;
    setPermissions((p) => ({
      ...p,
      writePaths: [...p.writePaths, writeInput.trim()],
    }));
    setWriteInput("");
  }

  function removeReadPath(index: number) {
    setPermissions((p) => ({
      ...p,
      readPaths: p.readPaths.filter((_, i) => i !== index),
    }));
  }

  function removeWritePath(index: number) {
    setPermissions((p) => ({
      ...p,
      writePaths: p.writePaths.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    try {
      await updatePermissions(permissions);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError("Failed to save permissions: " + String(err));
    }
  }

  return (
    <div>
      <h1>File Permissions</h1>
      <p>Control which file paths the agent can read and write.</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ maxWidth: 600 }}>
        <h3>Read Paths</h3>
        <div style={{ marginBottom: 8 }}>
          <input
            value={readInput}
            onChange={(e) => setReadInput(e.target.value)}
            placeholder="/path/to/allow"
            style={{ padding: 8, marginRight: 8 }}
          />
          <button onClick={addReadPath}>Add</button>
        </div>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {permissions.readPaths.map((p, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <code>{p}</code>
              <button
                onClick={() => removeReadPath(i)}
                style={{ marginLeft: 8, color: "red", cursor: "pointer" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <h3>Write Paths</h3>
        <div style={{ marginBottom: 8 }}>
          <input
            value={writeInput}
            onChange={(e) => setWriteInput(e.target.value)}
            placeholder="/path/to/allow"
            style={{ padding: 8, marginRight: 8 }}
          />
          <button onClick={addWritePath}>Add</button>
        </div>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {permissions.writePaths.map((p, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <code>{p}</code>
              <button
                onClick={() => removeWritePath(i)}
                style={{ marginLeft: 8, color: "red", cursor: "pointer" }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button onClick={handleSave} style={{ marginTop: 16 }}>
          Save Permissions
        </button>
        {saved && (
          <span style={{ marginLeft: 12, color: "green" }}>Saved!</span>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { fetchSettings, updateSettings } from "../api.js";

export function ProvidersPage() {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("openai");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const settings = await fetchSettings();
      if (settings["llm-provider"]) setProvider(settings["llm-provider"]);
      setError(null);
    } catch (err) {
      setError("Failed to load settings: " + String(err));
    }
  }

  async function handleSave() {
    try {
      await updateSettings({
        "llm-provider": provider,
        "llm-api-key": apiKey,
      });
      setSaved(true);
      setApiKey("");
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError("Failed to save: " + String(err));
    }
  }

  return (
    <div>
      <h1>LLM Providers</h1>
      <p>Configure your LLM provider and API key.</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ maxWidth: 400 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
            <option value="zhipu">Zhipu</option>
            <option value="moonshot">Moonshot</option>
            <option value="qwen">Qwen</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 16 }}>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
          />
          <small style={{ color: "#888" }}>
            Stored securely in your OS keychain. Never written to config files.
          </small>
        </label>

        <button onClick={handleSave}>Save</button>
        {saved && (
          <span style={{ marginLeft: 12, color: "green" }}>Saved!</span>
        )}
      </div>
    </div>
  );
}

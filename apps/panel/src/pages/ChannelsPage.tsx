import { useState, useEffect } from "react";
import { fetchChannels, type Channel } from "../api.js";

export function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  async function loadChannels() {
    try {
      setChannels(await fetchChannels());
      setError(null);
    } catch (err) {
      setError("Failed to load channels: " + String(err));
    }
  }

  return (
    <div>
      <h1>Channels</h1>
      <p>Configure messaging channels (WeCom, DingTalk, etc.).</p>

      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>{error}</div>
      )}

      {channels.length === 0 ? (
        <p style={{ color: "#888" }}>
          No channels configured yet. Channel support will be available in a future update.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {channels.map((ch) => (
            <li
              key={ch.id}
              style={{
                padding: "12px 16px",
                marginBottom: 8,
                border: "1px solid #e0e0e0",
                borderRadius: 4,
              }}
            >
              <strong>{ch.channelType}</strong> — {ch.accountId}
              <span
                style={{
                  marginLeft: 8,
                  color: ch.enabled ? "green" : "#888",
                  fontSize: 12,
                }}
              >
                {ch.enabled ? "Enabled" : "Disabled"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

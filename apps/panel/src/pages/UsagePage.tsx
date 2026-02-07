export function UsagePage() {
  return (
    <div>
      <h1>Token Usage</h1>
      <p>View token usage and cost tracking.</p>

      <div
        style={{
          padding: 24,
          border: "1px solid #e0e0e0",
          borderRadius: 4,
          backgroundColor: "#fafafa",
          textAlign: "center",
          color: "#888",
        }}
      >
        <p>Token usage tracking will be available in a future update.</p>
        <p style={{ fontSize: 12 }}>
          This will display token counts and estimated costs from the OpenClaw
          telemetry source.
        </p>
      </div>
    </div>
  );
}

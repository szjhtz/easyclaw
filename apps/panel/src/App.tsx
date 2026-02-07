import type { EasyClawConfig } from "@easyclaw/core";

const defaultConfig: EasyClawConfig = {
  region: "us",
  language: "en",
  gatewayVersion: "0.0.0",
  panelPort: 3210,
};

export function App() {
  return (
    <div>
      <h1>EasyClaw Management Panel</h1>
      <p>Region: {defaultConfig.region}</p>
    </div>
  );
}

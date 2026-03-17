import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/release/**", "**/.git/**", "**/e2e/**"],
    alias: {
      "@rivonclaw/logger": resolve(__dirname, "../../packages/logger/src/index.ts"),
      "@rivonclaw/gateway": resolve(__dirname, "../../packages/gateway/src/index.ts"),
      "@rivonclaw/core/node": resolve(__dirname, "../../packages/core/src/node.ts"),
      "@rivonclaw/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@rivonclaw/storage": resolve(__dirname, "../../packages/storage/src/index.ts"),
    },
  },
});

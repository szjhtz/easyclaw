import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    alias: {
      "@rivonclaw/logger": resolve(__dirname, "../../packages/logger/src/index.ts"),
      "@rivonclaw/policy": resolve(__dirname, "../../packages/policy/src/index.ts"),
    },
  },
});

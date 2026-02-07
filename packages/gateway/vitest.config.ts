import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    alias: {
      "@easyclaw/logger": resolve(__dirname, "../logger/src/index.ts"),
      "@easyclaw/secrets": resolve(__dirname, "../secrets/src/index.ts"),
    },
  },
});

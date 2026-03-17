import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    alias: {
      "@rivonclaw/logger": resolve(__dirname, "../logger/src/index.ts"),
      "@rivonclaw/secrets": resolve(__dirname, "../secrets/src/index.ts"),
    },
  },
});

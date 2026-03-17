import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    alias: {
      "@rivonclaw/logger": resolve(__dirname, "../logger/src/index.ts"),
      "@rivonclaw/core/node": resolve(__dirname, "../core/src/node.ts"),
      "@rivonclaw/core": resolve(__dirname, "../core/src/index.ts"),
    },
  },
});

import { describe, it, expect } from "vitest";
import { createLogger, LOG_DIR } from "./index.js";

describe("createLogger", () => {
  it("creates a logger with the given name", () => {
    const log = createLogger("test");
    expect(log).toBeDefined();
    expect(log.settings.name).toBe("test");
  });

  it("LOG_DIR points to ~/.easyclaw/logs", () => {
    expect(LOG_DIR).toContain(".easyclaw");
    expect(LOG_DIR).toContain("logs");
  });
});

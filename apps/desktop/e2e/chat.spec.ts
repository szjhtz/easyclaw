import { test, expect } from "./electron-fixture.js";

test.describe("Chat Page", () => {
  test("chat page is default and gateway connects", async ({ window }) => {
    // Chat should be the active nav item by default
    const firstNav = window.locator(".nav-list .nav-btn").first();
    await expect(firstNav).toHaveClass(/nav-active/);

    // Wait for gateway to reach "Connected" state
    const connectedDot = window.locator(".chat-status-dot-connected");
    await expect(connectedDot).toBeVisible({ timeout: 30_000 });

    // Verify connection stays stable for 3 seconds
    await window.waitForTimeout(3_000);
    await expect(connectedDot).toBeVisible();
  });
});

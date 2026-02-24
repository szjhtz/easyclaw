import { test, expect } from "./electron-fixture.js";

test.describe("Channels Page", () => {
  test("navigates to channels page and loads successfully", async ({ window }) => {
    // Dismiss any modal(s) blocking the UI (e.g. "What's New", telemetry consent).
    for (let i = 0; i < 3; i++) {
      const backdrop = window.locator(".modal-backdrop");
      if (!await backdrop.isVisible({ timeout: 3_000 }).catch(() => false)) break;
      await backdrop.click({ position: { x: 5, y: 5 }, force: true });
      await backdrop.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    }

    // Navigate to Channels page via sidebar ("Messaging" in English)
    const channelsBtn = window.locator(".nav-btn", { hasText: "Messaging" });
    await channelsBtn.click();
    await expect(channelsBtn).toHaveClass(/nav-active/);

    // Wait for channel data to load — the page title and header appear once
    // the gateway responds with channel status (polling starts immediately).
    const channelTitle = window.locator(".channel-title");
    await expect(channelTitle).toBeVisible({ timeout: 15_000 });
    await expect(channelTitle).toHaveText("Channels");

    // Verify the refresh button is present
    const refreshBtn = window.locator(".channel-header .btn.btn-secondary");
    await expect(refreshBtn).toBeVisible();

    // Verify the "Add Account" section renders with the channel dropdown
    const addSection = window.locator(".channel-add-section");
    await expect(addSection).toBeVisible();

    // Verify the accounts table is rendered (even if empty)
    const table = window.locator(".channel-table");
    await expect(table).toBeVisible();

    // Verify the table has expected column headers
    const headers = table.locator("thead th");
    await expect(headers).toHaveCount(6);
  });
});

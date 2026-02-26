import { test, expect } from "./electron-fixture.js";

test.describe("Dropdown positioning", () => {
  test("model select dropdown appears adjacent to its trigger", async ({ window }) => {
    // Dismiss any modal(s) blocking the UI
    for (let i = 0; i < 3; i++) {
      const backdrop = window.locator(".modal-backdrop");
      if (!await backdrop.isVisible({ timeout: 3_000 }).catch(() => false)) break;
      await backdrop.click({ position: { x: 5, y: 5 }, force: true });
      await backdrop.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    }

    // Navigate to Models page
    const providersBtn = window.locator(".nav-btn", { hasText: "Models" });
    await providersBtn.click();
    await expect(providersBtn).toHaveClass(/nav-active/);

    // Switch to API Key tab where the model dropdown lives
    const apiTab = window.locator(".tab-btn", { hasText: /API/i });
    await apiTab.click();
    await expect(apiTab).toHaveClass(/tab-btn-active/);

    // Select a provider that has models (e.g. Anthropic/Claude)
    await window.locator(".provider-select-trigger").click();
    const claudeOption = window.locator(".provider-select-option", { hasText: /Claude/i });
    if (await claudeOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await claudeOption.click();
    } else {
      // Close provider dropdown and pick whatever is already selected
      await window.locator(".provider-select-trigger").click();
    }

    // Wait for the model dropdown to be ready
    const trigger = window.locator(".page-two-col .custom-select-trigger").first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });

    // Click the model dropdown trigger
    await trigger.click();

    // Wait for the dropdown to appear
    const dropdown = window.locator(".custom-select-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // Get bounding rects of trigger and dropdown
    const triggerBox = await trigger.boundingBox();
    const dropdownBox = await dropdown.boundingBox();

    expect(triggerBox).toBeTruthy();
    expect(dropdownBox).toBeTruthy();

    // The dropdown's left edge must be close to the trigger's left edge.
    // A large horizontal offset (e.g. sidebar width ~250px) indicates
    // position:fixed is broken by a CSS containing block.
    const horizontalOffset = Math.abs(dropdownBox!.x - triggerBox!.x);
    expect(
      horizontalOffset,
      `Dropdown left edge (${dropdownBox!.x}) is ${horizontalOffset}px away from trigger left edge (${triggerBox!.x}). ` +
      `This likely means a CSS transform/filter on an ancestor is breaking position:fixed.`,
    ).toBeLessThan(20);

    // The dropdown must be vertically adjacent to the trigger
    // (either directly above or directly below, within a small gap)
    const gap = 8; // max allowed gap between trigger and dropdown
    const isBelow = dropdownBox!.y >= triggerBox!.y + triggerBox!.height - gap;
    const isAbove = dropdownBox!.y + dropdownBox!.height <= triggerBox!.y + gap;
    expect(
      isBelow || isAbove,
      `Dropdown (y=${dropdownBox!.y}, h=${dropdownBox!.height}) is not adjacent to trigger ` +
      `(y=${triggerBox!.y}, h=${triggerBox!.height}). Expected dropdown directly above or below.`,
    ).toBe(true);

    // Close dropdown
    await trigger.click();
  });

  test("model select dropdown in existing key card is correctly positioned", async ({ window }) => {
    // This test requires a pre-seeded provider key (from the fixture)
    const volcengineKey = process.env.E2E_VOLCENGINE_API_KEY;
    test.skip(!volcengineKey, "E2E_VOLCENGINE_API_KEY required");

    // Dismiss any modal(s)
    for (let i = 0; i < 3; i++) {
      const backdrop = window.locator(".modal-backdrop");
      if (!await backdrop.isVisible({ timeout: 3_000 }).catch(() => false)) break;
      await backdrop.click({ position: { x: 5, y: 5 }, force: true });
      await backdrop.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    }

    // Navigate to Models page
    const providersBtn = window.locator(".nav-btn", { hasText: "Models" });
    await providersBtn.click();
    await expect(providersBtn).toHaveClass(/nav-active/);

    // Find the model dropdown in the existing key card
    const keyCard = window.locator(".key-card").first();
    await expect(keyCard).toBeVisible({ timeout: 10_000 });

    const trigger = keyCard.locator(".custom-select-trigger");
    // Key cards may use a native <select> for custom models — skip if no custom-select
    if (!await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, "Key card uses native select, not custom-select");
      return;
    }

    // Scroll the trigger into view first and wait for scroll to settle,
    // because Select.tsx closes on scroll events — if Playwright's auto-scroll
    // happens during click(), the dropdown opens then immediately closes.
    await trigger.scrollIntoViewIfNeeded();
    await window.waitForTimeout(500);
    await trigger.click();

    const dropdown = window.locator(".custom-select-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    const triggerBox = await trigger.boundingBox();
    const dropdownBox = await dropdown.boundingBox();

    expect(triggerBox).toBeTruthy();
    expect(dropdownBox).toBeTruthy();

    // Horizontal alignment check
    const horizontalOffset = Math.abs(dropdownBox!.x - triggerBox!.x);
    expect(
      horizontalOffset,
      `Dropdown horizontally misaligned by ${horizontalOffset}px (trigger x=${triggerBox!.x}, dropdown x=${dropdownBox!.x})`,
    ).toBeLessThan(20);

    // Dropdown should be at least as wide as the trigger (may be wider for long model names)
    expect(
      dropdownBox!.width,
      `Dropdown width (${dropdownBox!.width}) is narrower than trigger width (${triggerBox!.width})`,
    ).toBeGreaterThanOrEqual(triggerBox!.width - 10);

    // Close dropdown
    await trigger.click();
  });
});

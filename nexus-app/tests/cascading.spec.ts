import { test, expect } from '@playwright/test';

test('Window Cascading and Positioning', async ({ page }) => {
    // 1. Load the desktop
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify desktop loaded
    await expect(page.getByLabel('AETHER Chat')).toBeVisible();

    // Helper to open dock app robustly
    const openApp = async (label: string) => {
        console.log(`Opening ${label}...`);

        // Hover bottom of screen to trigger Dock (if hidden)
        const viewport = page.viewportSize();
        if (viewport) {
            // Dock activation zone is `bottom: 22px` (approx), height 8px.
            // Hover around 26px from bottom to hit it.
            await page.mouse.move(viewport.width / 2, viewport.height - 26);
            // Wait for Dock animation
            await page.waitForTimeout(1000);
        }

        // Click app icon
        await page.getByLabel(label).click();
    };

    // 2. Open Terminal
    await openApp('Terminal');

    // Wait for window
    const terminalWindow = page.locator('[data-testid="window-frame-terminal"]');
    await expect(terminalWindow).toBeVisible({ timeout: 10000 });
    const box1 = await terminalWindow.boundingBox();
    expect(box1).not.toBeNull();
    if (!box1) return;

    console.log(`Terminal Position: (${box1.x}, ${box1.y})`);

    // Assert Top Constraint (Header Height = 40)
    expect(box1.y).toBeGreaterThanOrEqual(38);

    // 3. Open File Manager
    await openApp('File Manager');
    const filesWindow = page.locator('[data-testid="window-frame-files"]');
    await expect(filesWindow).toBeVisible({ timeout: 10000 });
    const box2 = await filesWindow.boundingBox();
    expect(box2).not.toBeNull();
    if (!box2) return;

    console.log(`Files Position: (${box2.x}, ${box2.y})`);

    // 4. Assert Cascade (Window 2 should be down-right of Window 1)
    expect(box2.x).toBeGreaterThan(box1.x + 20); // expect ~32px offset
    expect(box2.y).toBeGreaterThan(box1.y + 20);

    // 5. Open Browser
    await openApp('Web Browser');
    const browserWindow = page.locator('[data-testid="window-frame-browser"]');
    await expect(browserWindow).toBeVisible({ timeout: 10000 });
    const box3 = await browserWindow.boundingBox();
    expect(box3).not.toBeNull();
    if (!box3) return;

    console.log(`Browser Position: (${box3.x}, ${box3.y})`);

    // 6. Assert Cascade (Window 3 > Window 2)
    expect(box3.x).toBeGreaterThan(box2.x + 20);
    expect(box3.y).toBeGreaterThan(box2.y + 20);

    // 7. Verify Stability (Window 1 shouldn't move)
    const box1New = await terminalWindow.boundingBox();
    expect(box1New?.x).toBeCloseTo(box1.x, 1);
    expect(box1New?.y).toBeCloseTo(box1.y, 1);

    console.log('Verification Passed: Windows cascade correctly and stay within bounds.');
});

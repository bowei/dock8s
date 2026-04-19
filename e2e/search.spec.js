import { test, expect } from '@playwright/test';

const WIDGET = 'example.com/widget/v1.Widget';

test.describe('search dialog', () => {
  test('search dialog is shown on load without hash', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
    await expect(page.locator('#search-dialog-input')).toBeFocused();
  });

  test('pressing / opens the search dialog', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
  });

  test('pressing Escape closes the search dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-dialog-overlay')).toBeHidden();
  });

  test('search results show root types by default', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('#search-dialog-list li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.search-dialog-type-name')).toHaveText('Widget');
    await expect(items.nth(1).locator('.search-dialog-type-name')).toHaveText('WidgetList');
  });

  test('typing filters results by name', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-dialog-input').fill('List');
    await expect(page.locator('#search-dialog-list li')).toHaveCount(1);
    await expect(page.locator('#search-dialog-list li .search-dialog-type-name')).toHaveText('WidgetList');
  });

  test('pressing Enter navigates to the selected result', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Enter');
    await expect(page.locator('#search-dialog-overlay')).toBeHidden();
    await expect(page.locator('.column')).toHaveCount(1);
    await expect(page.locator('.column .header-row')).toHaveText('Widget');
  });

  test('clicking a result navigates to that type', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-dialog-list li').nth(1).click();
    await expect(page.locator('#search-dialog-overlay')).toBeHidden();
    await expect(page.locator('.column .header-row')).toHaveText('WidgetList');
  });

  test('field search with f: prefix shows field results', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-dialog-input').fill('f:spec');
    const items = page.locator('#search-dialog-list li:not(.search-results-truncated)');
    await expect(items).not.toHaveCount(0);
    // Each result should show a path containing "spec"
    const first = items.first();
    await expect(first).toContainText('spec', { ignoreCase: true });
  });

  test('no results for unmatched filter', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-dialog-input').fill('zzznomatch');
    await expect(page.locator('#search-dialog-list li')).toHaveCount(0);
  });

  test('clicking overlay closes the search dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
    // Click in the overlay area outside the dialog
    await page.locator('#search-dialog-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#search-dialog-overlay')).toBeHidden();
  });
});

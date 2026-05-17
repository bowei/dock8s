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
    await expect(items).toHaveCount(4);
    // Sorted by short type name: AlphaWidget, BetaWidget, Widget, WidgetList
    await expect(items.nth(0).locator('.search-dialog-type-name')).toHaveText('AlphaWidget');
    await expect(items.nth(1).locator('.search-dialog-type-name')).toHaveText('BetaWidget');
    await expect(items.nth(2).locator('.search-dialog-type-name')).toHaveText('Widget');
    await expect(items.nth(3).locator('.search-dialog-type-name')).toHaveText('WidgetList');
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
    // First result (alphabetically) is AlphaWidget
    await expect(page.locator('.column .header-row')).toHaveText('AlphaWidget');
  });

  test('clicking a result navigates to that type', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-dialog-list li').nth(3).click();
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

  test('alpha and beta checkboxes are checked by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-show-alpha')).toBeChecked();
    await expect(page.locator('#search-show-beta')).toBeChecked();
  });

  test('unchecking Show alpha hides alpha types', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-show-alpha').uncheck();
    const list = page.locator('#search-dialog-list');
    await expect(list).not.toContainText('AlphaWidget');
    // Beta and stable types still visible
    await expect(list).toContainText('BetaWidget');
    await expect(list).toContainText('Widget');
  });

  test('unchecking Show beta hides beta types', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-show-beta').uncheck();
    const list = page.locator('#search-dialog-list');
    await expect(list).not.toContainText('BetaWidget');
    // Alpha and stable types still visible
    await expect(list).toContainText('AlphaWidget');
    await expect(list).toContainText('Widget');
  });

  test('unchecking both alpha and beta shows only stable types', async ({ page }) => {
    await page.goto('/');
    await page.locator('#search-show-alpha').uncheck();
    await page.locator('#search-show-beta').uncheck();
    const items = page.locator('#search-dialog-list li');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).locator('.search-dialog-type-name')).toHaveText('Widget');
    await expect(items.nth(1).locator('.search-dialog-type-name')).toHaveText('WidgetList');
  });

  test('re-checking Show alpha restores alpha types', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('#search-dialog-list');
    await page.locator('#search-show-alpha').uncheck();
    await expect(list).not.toContainText('AlphaWidget');
    await page.locator('#search-show-alpha').check();
    await expect(list).toContainText('AlphaWidget');
  });
});

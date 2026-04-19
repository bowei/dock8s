import { test, expect } from '@playwright/test';

const WIDGET = 'example.com/widget/v1.Widget';

test.describe('URL hash state', () => {
  test('navigating to hash restores single column', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await expect(page.locator('.column')).toHaveCount(1);
    await expect(page.locator('.column[data-type-name="example.com/widget/v1.Widget"]')).toBeVisible();
  });

  test('navigating to hash with field path restores two columns', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    await expect(page.locator('.column')).toHaveCount(2);
    await expect(page.locator('li[data-field-name="Spec"]')).toHaveClass(/selected/);
    await expect(page.locator('.column').nth(1).locator('.header-row')).toHaveText('WidgetSpec');
  });

  test('clicking a field updates the URL hash', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('li[data-field-name="Spec"]').click();
    await expect(page).toHaveURL(new RegExp(`${WIDGET.replace(/\./g, '\\.').replace(/\//g, '\\/')}/Spec$`));
  });

  test('changing field selection updates the hash', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('li[data-field-name="Spec"]').click();
    await page.locator('li[data-field-name="Status"]').click();
    await expect(page).toHaveURL(new RegExp('Widget/Status$'));
  });

  test('invalid hash falls back to search dialog', async ({ page }) => {
    await page.goto('/#nonexistent.type/That.Does/Not.Exist');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
  });

  test('empty hash shows search dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
  });
});

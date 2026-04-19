import { test, expect } from '@playwright/test';

const WIDGET = 'example.com/widget/v1.Widget';

test.describe('column navigation', () => {
  test('loads Widget column from hash', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await expect(page.locator('.column')).toHaveCount(1);
    await expect(page.locator('.column .header-row')).toHaveText('Widget');
  });

  test('column header shows package path', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await expect(page.locator('.column .type-name').first()).toHaveText('example.com/widget/v1');
  });

  test('fields with known types show a chevron', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    const specItem = page.locator('li[data-field-name="Spec"]');
    await expect(specItem.locator('.chevron')).toBeVisible();
  });

  test('primitive fields do not show a chevron', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    const colorItem = page.locator('.column:last-child li[data-field-name="Color"]');
    await expect(colorItem.locator('.chevron')).toHaveCount(0);
  });

  test('clicking a typed field opens a second column', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('li[data-field-name="Spec"]').click();
    await expect(page.locator('.column')).toHaveCount(2);
    await expect(page.locator('.column').nth(1).locator('.header-row')).toHaveText('WidgetSpec');
  });

  test('clicked field gets selected class', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('li[data-field-name="Spec"]').click();
    await expect(page.locator('li[data-field-name="Spec"]')).toHaveClass(/selected/);
  });

  test('clicking a different field replaces the second column', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('li[data-field-name="Spec"]').click();
    await expect(page.locator('.column')).toHaveCount(2);
    await page.locator('li[data-field-name="Status"]').click();
    await expect(page.locator('.column')).toHaveCount(2);
    await expect(page.locator('.column').nth(1).locator('.header-row')).toHaveText('WidgetStatus');
  });

  test('clicking a primitive field does not add a column', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    await page.locator('.column:last-child li[data-field-name="Color"]').click();
    await expect(page.locator('.column')).toHaveCount(2);
  });

  test('enum type column shows enum values', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Status`);
    // Phase is an enum type — click it to open Phase column
    await page.locator('.column:last-child li[data-field-name="Phase"]').click();
    await expect(page.locator('.column')).toHaveCount(3);
    await expect(page.locator('.column').nth(2).locator('.header-row')).toHaveText('Phase');
    // Phase column should contain enum values (not fields with chevrons)
    await expect(page.locator('.column').nth(2).locator('li')).toHaveCount(3);
  });
});

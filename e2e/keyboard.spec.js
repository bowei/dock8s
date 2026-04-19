import { test, expect } from '@playwright/test';

const WIDGET = 'example.com/widget/v1.Widget';

test.describe('keyboard navigation', () => {
  test('ArrowDown selects first item when nothing is selected', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('li.selected');
    await expect(selected).toHaveCount(1);
  });

  test('ArrowDown moves selection to next item', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('ArrowDown');
    const firstSelected = await page.locator('li.selected').getAttribute('data-field-name');
    await page.keyboard.press('ArrowDown');
    const secondSelected = await page.locator('li.selected').getAttribute('data-field-name');
    expect(firstSelected).not.toBe(secondSelected);
  });

  test('ArrowRight on a typed field opens next column', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    // Select the first item
    await page.keyboard.press('ArrowDown');
    // ArrowRight on a typed field (e.g. ObjectMeta) should open it
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.column')).toHaveCount(2);
  });

  test('ArrowLeft removes the last column', async ({ page }) => {
    // Load a hash with three path segments so selection is in the second column
    // (ObjectMeta selected in col 1; Name — a string field — selected in col 2)
    await page.goto(`/#${WIDGET}/ObjectMeta/Name`);
    await expect(page.locator('.column')).toHaveCount(2);
    // ArrowLeft removes the active column (the second one)
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.column')).toHaveCount(1);
  });

  test('/ key opens search dialog when body is focused', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
  });

  test('Escape closes search dialog', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('/');
    await expect(page.locator('#search-dialog-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-dialog-overlay')).toBeHidden();
  });

  test('? key opens help dialog', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('?');
    await expect(page.locator('#help-dialog-overlay')).toBeVisible();
  });

  test('Escape closes help dialog', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('body').click();
    await page.keyboard.press('?');
    await expect(page.locator('#help-dialog-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#help-dialog-overlay')).toBeHidden();
  });

  test('Enter expands docstring on field with doc', async ({ page }) => {
    // Navigate to WidgetSpec where fields have docstrings
    await page.goto(`/#${WIDGET}/Spec`);
    // Select first item in WidgetSpec column (last column)
    await page.locator('body').click();
    // Move focus to the last column's first item via ArrowRight from Spec
    await page.keyboard.press('ArrowRight');
    // Now select the first item in WidgetSpec column
    const lastColumnFirstItem = page.locator('.column:last-child li').first();
    await lastColumnFirstItem.click();
    // The item should have a docstring; press Enter to expand it
    await page.keyboard.press('Enter');
    const docDetails = lastColumnFirstItem.locator('.doc-string > div:last-child');
    await expect(docDetails).not.toBeHidden();
  });
});

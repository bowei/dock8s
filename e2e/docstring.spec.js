import { test, expect } from '@playwright/test';

const WIDGET = 'example.com/widget/v1.Widget';

test.describe('docstring display', () => {
  test('field with a docstring shows an expand button', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    const colorItem = page.locator('.column:last-child li[data-field-name="Color"]');
    await expect(colorItem.locator('.expand-btn')).toBeVisible();
  });

  test('clicking expand button shows docstring details', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    const colorItem = page.locator('.column:last-child li[data-field-name="Color"]');
    await colorItem.locator('.expand-btn').click();
    // details div (second child of .doc-string) should become visible
    const details = colorItem.locator('.doc-string > div').nth(1);
    await expect(details).not.toBeHidden();
  });

  test('expanded docstring contains paragraph text', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    const colorItem = page.locator('.column:last-child li[data-field-name="Color"]');
    await colorItem.locator('.expand-btn').click();
    const details = colorItem.locator('.doc-string > div').nth(1);
    await expect(details).toContainText('CSS color');
  });

  test('pressing Enter on a selected field collapses an expanded docstring', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    const colorItem = page.locator('.column:last-child li[data-field-name="Color"]');
    await colorItem.locator('.expand-btn').click();
    const details = colorItem.locator('.doc-string > div').nth(1);
    await expect(details).not.toBeHidden();
    // Select the item, then use Enter to toggle it back closed
    await colorItem.click();
    await page.keyboard.press('Enter');
    await expect(details).toBeHidden();
  });

  test('deprecated field docstring contains deprecated marker', async ({ page }) => {
    await page.goto(`/#${WIDGET}/Spec`);
    const tagsItem = page.locator('.column:last-child li[data-field-name="Tags"]');
    await tagsItem.locator('.expand-btn').click();
    const details = tagsItem.locator('.doc-string > div').nth(1);
    await expect(details).toContainText('Deprecated');
  });

  test('single-sentence docstring does not get an expand button', async ({ page }) => {
    // Message has a one-sentence docstring — no expand button shown
    // (expand button only appears when there are multiple content elements)
    await page.goto(`/#${WIDGET}/Status`);
    const messageItem = page.locator('.column:last-child li[data-field-name="Message"]');
    await expect(messageItem.locator('.expand-btn')).toHaveCount(0);
  });
});

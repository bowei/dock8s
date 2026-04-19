import { test, expect } from '@playwright/test';

const WIDGET = 'example.com/widget/v1.Widget';

const THEMES = [
  { label: 'Dark', value: 'theme-dark.css' },
  { label: 'Blue', value: 'theme-blue.css' },
  { label: 'Green', value: 'theme-green.css' },
  { label: 'Light', value: 'theme-light.css' },
  { label: 'Brown', value: 'theme-brown.css' },
];

test.describe('theme switching', () => {
  test('page loads with a stylesheet applied', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    const href = await page.locator('link[rel="stylesheet"]').getAttribute('href');
    expect(href).toMatch(/theme-\w+\.css/);
  });

  for (const { label, value } of THEMES) {
    test(`selecting ${label} theme updates the stylesheet`, async ({ page }) => {
      await page.goto(`/#${WIDGET}`);
      await page.locator('#theme-select').selectOption({ value });
      const href = await page.locator('link[rel="stylesheet"]').getAttribute('href');
      expect(href).toBe(value);
    });
  }

  test('theme preference is persisted in localStorage', async ({ page }) => {
    await page.goto(`/#${WIDGET}`);
    await page.locator('#theme-select').selectOption({ value: 'theme-dark.css' });
    // Reload and verify the saved theme is restored
    await page.reload();
    const href = await page.locator('link[rel="stylesheet"]').getAttribute('href');
    expect(href).toBe('theme-dark.css');
  });
});

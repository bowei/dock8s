import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3001',
  },
  webServer: {
    command: './dock8s -generate e2e/dist -type example.com/widget/v1.Widget e2e/fixture && python3 -m http.server 3001 --directory e2e/dist',
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});

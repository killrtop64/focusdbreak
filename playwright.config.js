import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  fullyParallel:true,
  forbidOnly:Boolean(process.env.CI),
  retries:process.env.CI ? 1 : 0,
  workers:process.env.CI ? 2 : undefined,
  reporter:'list',
  use:{
    baseURL:'http://127.0.0.1:4173',
    browserName:'chromium',
    channel:process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport:{ width:1440, height:1100 },
    trace:'retain-on-failure',
  },
  webServer:{
    command:'node scripts/serve.mjs',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,
    timeout:15_000,
  },
});

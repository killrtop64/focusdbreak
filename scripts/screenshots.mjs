import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs', { recursive:true });
const browser = await chromium.launch({ channel:process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage({ viewport:{ width:1440, height:1050 }, deviceScaleFactor:1 });
await page.goto('http://127.0.0.1:4173/');
await page.locator('#language-toggle').click();
for (const task of ['Build something useful', 'Read a chapter', 'Make time for a real break']) {
  await page.locator('#task-input').fill(task);
  await page.locator('#task-form button').click();
}
await page.locator('#task-input').blur();
await page.screenshot({ path:'docs/desktop.png', fullPage:true });
await page.setViewportSize({ width:390, height:844 });
await page.screenshot({ path:'docs/mobile.png', fullPage:true });
await browser.close();

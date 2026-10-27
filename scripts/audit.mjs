import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const browser = await chromium.launch({ channel:process.env.PLAYWRIGHT_CHANNEL || undefined });
const context = await browser.newContext({ viewport:{ width:1440, height:1050 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4173/');
for (const view of ['focus','insights','guide','settings']) {
  if (view === 'settings') await page.locator('#open-settings').click();
  else await page.locator('[data-view=' + view + ']').click();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  console.log(JSON.stringify({ view, violations:result.violations.map(v => ({
    id:v.id, impact:v.impact, nodes:v.nodes.map(n => ({ target:n.target, summary:n.failureSummary })),
  })) }));
}
await browser.close();

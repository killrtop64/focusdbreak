import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createState, normalizeTask } from '../src/core.js';
import { encodeDocument } from '../shared/state-codec.js';
const KEY = 'focus-break:v1';
function backup(text = 'Важная задача 🌿') {
  const value = createState(); value.tasks.push(normalizeTask({ id:'keep',text })); return value;
}
async function seed(page,entries) {
  await page.goto('/');
  // Install the offline shell before reloading this freshly created context.
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.evaluate(entries=>{
    localStorage.clear();
    for (const [key,raw] of Object.entries(entries)) localStorage.setItem(key,raw);
  },entries);
  await page.reload();
}
test('corruption pauses autosave, preserves original, and restores a last good copy offline', async ({ page, context }) => {
  const original = '{broken data';
  await seed(page,{ [KEY]:original,[KEY+':last-good']:encodeDocument(backup(),1) });
  await expect(page.locator('#recovery-dialog')).toBeVisible();
  await expect(page.locator('#recovery-reason')).toContainText('повреждён');
  await page.keyboard.press('Escape');
  await expect(page.locator('#recovery-dialog')).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(original);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.locator('#recover-backup').click();
  await expect(page.locator('#recovery-dialog')).not.toBeVisible();
  await expect(page.locator('.task-select')).toHaveText('Важная задача 🌿');
  expect(await page.evaluate(key=>Object.keys(localStorage).filter(item=>item.startsWith(key+':checkpoint:')).map(item=>localStorage.getItem(item)),KEY)).toContain(original);
  await page.reload();
  await expect(page.locator('.task-select')).toHaveText('Важная задача 🌿');
});
test('unsupported versions never get replaced by a blank state', async ({ page }) => {
  const original = JSON.stringify({ ...backup(),version:99 });
  await seed(page,{ [KEY]:original });
  await expect(page.locator('#recovery-reason')).toContainText('не поддерживается');
  await expect(page.locator('#recover-backup')).toBeDisabled();
  await page.locator('#retry-storage').click();
  await expect(page.locator('#recovery-dialog')).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(original);
});
test('a crash draft requires explicit recovery and survives a second restart', async ({ page }) => {
  await seed(page,{ [KEY]:encodeDocument(backup('old'),1),[KEY+':draft']:JSON.stringify(backup('latest')) });
  await expect(page.locator('#recovery-reason')).toContainText('несохранённые');
  await page.locator('#recover-backup').click();
  await expect(page.locator('.task-select')).toHaveText('latest');
  await page.reload();
  await expect(page.locator('#recovery-dialog')).not.toBeVisible();
  await expect(page.locator('.task-select')).toHaveText('latest');
});
test('invalid imports leave existing data intact; 150 valid tasks import without truncation', async ({ page }) => {
  await seed(page,{ [KEY]:encodeDocument(backup('original'),1) });
  await page.locator('#open-settings').click();
  const malformed = backup(); malformed.tasks.push(malformed.tasks[0]);
  await page.locator('#import-file').setInputFiles({ name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed)) });
  await expect(page.locator('#toast')).toContainText('Не удалось');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).payload.tasks[0].text,KEY)).toBe('original');
  const value = backup();
  value.tasks = Array.from({ length:150 },(_,i)=>normalizeTask({ id:'t'+i,text:'Задача '+i }));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#import-file').setInputFiles({ name:'large.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value)) });
  await expect(page.locator('.task-select')).toHaveCount(150);
  await page.reload();
  await expect(page.locator('.task-select')).toHaveCount(150);
});
test('browser write denial stops editing and offers an export without erasing the previous data', async ({ page }) => {
  const original = encodeDocument(backup('original'),1);
  await seed(page,{ [KEY]:original });
  await page.evaluate(()=>{ Storage.prototype.setItem = ()=>{ throw new DOMException('Storage is full','QuotaExceededError'); }; });
  await page.locator('#task-input').fill('unsaved change');
  await page.locator('#task-form button').click();
  await expect(page.locator('#recovery-dialog')).toBeVisible();
  await expect(page.locator('#recovery-reason')).toContainText('Не удалось сохранить');
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export-recovery').click()]);
  expect(download.suggestedFilename()).toContain('recovery');
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(original);
});
test('a daily note survives an immediate page reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view=plan]').click();
  await page.locator('#day-note').fill('Последние символы перед закрытием 🌿');
  await page.reload();
  if (await page.locator('#recovery-dialog').isVisible()) await page.locator('#recover-backup').click();
  await page.locator('[data-view=plan]').click();
  await expect(page.locator('#day-note')).toHaveValue('Последние символы перед закрытием 🌿');
});

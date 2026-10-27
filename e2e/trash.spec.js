import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createState, normalizeTask, trashTasks } from '../src/core.js';
import { encodeDocument } from '../shared/state-codec.js';
const KEY = 'focus-break:v1';
async function seed(page,value) {
  await page.goto('/');
  await page.evaluate(({ key,raw })=>{ localStorage.clear(); localStorage.setItem(key,raw); },{ key:KEY,raw:encodeDocument(value,1) });
  await page.reload();
}
test('deletion preserves a detailed task after restart and restores all its fields', async ({ page }) => {
  const value = createState();
  const task = normalizeTask({ id:'keep',text:'<img src=x onerror="alert(1)"> Важное 🌿',project:'Учёба',tags:['экзамен'],priority:'high',dueDate:'2026-12-01',repeat:'weekly',estimate:4,description:'Сохранить подробности',extra:{ keep:true } });
  value.tasks.push(task); value.activeTask = task.id;
  await seed(page,value);
  await page.locator('.task-delete').click();
  await expect(page.locator('#empty-tasks')).toBeVisible();
  await expect(page.locator('#trash-count')).toHaveText('1');
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).payload.trash.length,KEY)).toBe(1);
  await page.reload();
  await page.locator('#open-trash').click();
  await expect(page.locator('.trash-title')).toHaveText(task.text);
  await expect(page.locator('.trash-item')).toContainText('Учёба');
  await expect(page.locator('.trash-item')).toContainText('#экзамен');
  expect(await page.locator('#trash-list img').count()).toBe(0);
  await page.locator('.trash-restore').click();
  await expect(page.locator('#trash-empty')).toBeVisible();
  await page.locator('#trash-dialog .dialog-close').click();
  await expect(page.locator('.task-select')).toHaveText(task.text);
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).payload.tasks,KEY)).toEqual([task]);
  await page.reload();
  await expect(page.locator('#trash-count')).toHaveText('0');
  await expect(page.locator('.task-select')).toHaveText(task.text);
});
test('undo returns a deleted task without opening the trash', async ({ page }) => {
  await page.goto('/');
  await page.locator('#task-input').fill('Вернуть одним нажатием');
  await page.locator('#task-form button').click();
  await page.locator('.task-delete').click();
  await page.locator('#toast .toast-action').click();
  await expect(page.locator('.task-select')).toHaveText('Вернуть одним нажатием');
  await expect(page.locator('#trash-count')).toHaveText('0');
});
test('completed-task cleanup and restore-all preserve daily completion totals', async ({ page }) => {
  const value = createState();
  value.tasks = ['a','b','open'].map(id=>normalizeTask({ id,text:id }));
  await seed(page,value);
  await page.locator('.task-check').first().click();
  await page.locator('.task-check[aria-pressed=false]').first().click();
  await expect(page.locator('#today-tasks')).toHaveText('2');
  await page.locator('#clear-completed').click();
  await expect(page.locator('.task-select')).toHaveCount(1);
  await expect(page.locator('#trash-count')).toHaveText('2');
  await expect(page.locator('#today-tasks')).toHaveText('2');
  await page.locator('#open-trash').click();
  await expect(page.locator('.trash-item')).toHaveCount(2);
  await page.locator('#restore-all').click();
  await expect(page.locator('.trash-item')).toHaveCount(0);
  await expect(page.locator('#restore-all')).toBeDisabled();
  await page.locator('#trash-dialog .dialog-close').click();
  await expect(page.locator('.task-select')).toHaveCount(3);
  await expect(page.locator('#today-tasks')).toHaveText('2');
});
test('trash search, both languages and a narrow dialog meet automated accessibility checks', async ({ page }) => {
  const value = createState();
  value.tasks = [normalizeTask({ id:'a',text:'Прочитать книгу',project:'Учёба',tags:['русский'] }),normalizeTask({ id:'b',text:'Household task' })];
  trashTasks(value,['a','b']);
  await seed(page,value);
  for (const language of ['ru','en']) {
    if (language === 'en') await page.locator('#language-toggle').click();
    await page.locator('#open-trash').click();
    for (const width of [1440,390]) {
      await page.setViewportSize({ width,height:900 });
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('#trash-dialog').evaluate(dialog=>dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    await page.locator('#trash-search').fill('РУССКИЙ');
    await expect(page.locator('.trash-item')).toHaveCount(1);
    await expect(page.locator('.trash-title')).toHaveText('Прочитать книгу');
    await page.locator('#trash-search').fill('nothing');
    await expect(page.locator('#trash-empty')).toBeVisible();
    // Chromium consumes Escape in a nonempty search input to clear its value.
    await page.locator('#trash-search').fill('');
    await page.keyboard.press('Escape');
    await expect(page.locator('#trash-dialog')).not.toBeVisible();
  }
});
test('a downloaded backup includes trash and restores it through import', async ({ page }) => {
  const value = createState(); value.tasks.push(normalizeTask({ id:'a',text:'Удалено, но сохранено' }));
  trashTasks(value,['a']); await seed(page,value);
  await page.locator('[data-view=insights]').click();
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#export-data').click()]);
  const filename = await download.path();
  await page.locator('#open-settings').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#clear-data').click();
  await expect(page.locator('#trash-count')).toHaveText('0');
  await page.locator('#open-settings').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#import-file').setInputFiles(filename);
  await page.locator('[data-view=focus]').click();
  await expect(page.locator('#trash-count')).toHaveText('1');
  await page.locator('#open-trash').click();
  await expect(page.locator('.trash-title')).toHaveText('Удалено, но сохранено');
});
test('another tab sees deletion and restoration while the trash dialog is open', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#task-input').fill('Между вкладками');
  await page.locator('#task-form button').click();
  await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key) || '{}').payload?.tasks.length,KEY)).toBe(1);
  const other = await context.newPage(); await other.goto('/');
  await other.locator('#open-trash').click();
  await page.locator('.task-delete').click();
  await expect(other.locator('.trash-title')).toHaveText('Между вкладками');
  await other.locator('.trash-restore').click();
  await expect(page.locator('.task-select')).toHaveText('Между вкладками');
  await expect(page.locator('#trash-count')).toHaveText('0');
});

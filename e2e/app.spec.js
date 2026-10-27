import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('tasks persist, unsafe-looking task text stays text, and daily totals survive cleanup', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const task = '<img src=x onerror="alert(1)"> Ship something useful';
  await page.locator('#task-input').fill(task);
  await page.locator('#task-form button').click();
  await expect(page.locator('.task-select')).toHaveText(task);
  await expect(page.locator('#current-task-label')).toHaveText(task);
  expect(await page.locator('.task-list img').count()).toBe(0);
  await page.reload();
  await expect(page.locator('.task-select')).toHaveText(task);
  await page.locator('.task-check').click();
  await expect(page.locator('#today-tasks')).toHaveText('1');
  await page.locator('#clear-completed').click();
  await expect(page.locator('#empty-tasks')).toBeVisible();
  await expect(page.locator('#today-tasks')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#today-tasks')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('timer pauses, survives reload, and finishes only once after time has passed', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#start-timer').click();
  await page.clock.fastForward(30_000);
  await expect(page.locator('#timer-value')).toHaveText('24:30');
  await page.locator('#start-timer').click();
  await page.clock.fastForward(60_000);
  await expect(page.locator('#timer-value')).toHaveText('24:30');
  await page.reload();
  await expect(page.locator('#timer-value')).toHaveText('24:30');
  await page.locator('#start-timer').click();
  await page.clock.fastForward(1_470_000);
  await expect(page.locator('#timer-value')).toHaveText('05:00');
  await expect(page.locator('#today-sessions')).toHaveText('1');
  await expect(page.locator('#today-minutes')).toContainText('25');
  await page.clock.fastForward(60_000);
  await expect(page.locator('#timer-value')).toHaveText('05:00');
  await page.reload();
  await expect(page.locator('#today-sessions')).toHaveText('1');
});

test('settings validate, language switches, and keyboard shortcuts respect typing', async ({ page }) => {
  await page.goto('/');
  await page.locator('#task-input').fill('1 2 3 and a space');
  await expect(page.locator('#view-focus')).toBeVisible();
  await expect(page.locator('#timer-state')).toHaveText('Готов к началу');
  await page.locator('#open-settings').click();
  await page.locator('[name=focus]').fill('40');
  await page.locator('[name=goal]').fill('6');
  await page.locator('#settings-form [type=submit]').click();
  await expect(page.locator('#timer-value')).toHaveText('40:00');
  await expect(page.locator('#goal-label')).toHaveText('0 / 6');
  await page.locator('#language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('h1:visible')).toContainText('Make room');
  await page.locator('#zen-toggle').click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('#timer-value')).toHaveText('40:00');
});

test('mobile layout fits a narrow screen in every view', async ({ page }) => {
  await page.setViewportSize({ width:375, height:812 });
  await page.goto('/');
  for (const view of ['focus','insights','guide']) {
    await page.locator('[data-view=' + view + ']').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('#view-' + view)).toBeVisible();
  }
  await page.locator('#language-toggle').click();
  await expect(page.locator('h1:visible')).toContainText('A moment');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('offline assets are available after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.locator('#task-input').fill('Work offline');
  await page.locator('#task-form button').click();
  // A reload also ensures that the service worker controls this page.
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.task-select')).toHaveText('Work offline');
  await page.locator('#start-timer').click();
  await expect(page.locator('#timer-state')).toHaveText('Сессия идёт');
});

test('a second tab follows timer and task changes', async ({ page, context }) => {
  await page.goto('/');
  const other = await context.newPage();
  await other.goto('/');
  await page.locator('#task-input').fill('Across tabs');
  await page.locator('#task-form button').click();
  await expect(other.locator('.task-select')).toHaveText('Across tabs');
  await page.locator('#start-timer').click();
  await expect(other.locator('#timer-state')).toHaveText('Сессия идёт');
  await other.locator('#start-timer').click();
  await expect(page.locator('#timer-state')).toHaveText('На паузе');
});

test('export, deletion, and import restore a real user backup', async ({ page }) => {
  await page.goto('/');
  await page.locator('#task-input').fill('Keep this safe');
  await page.locator('#task-form button').click();
  await page.locator('[data-view=insights]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-data').click(),
  ]);
  const path = await download.path();
  await page.locator('#open-settings').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-data').click();
  await page.locator('[data-view=focus]').click();
  await expect(page.locator('#empty-tasks')).toBeVisible();
  await page.locator('#open-settings').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles(path);
  await expect(page.locator('.task-select')).toHaveText('Keep this safe');
});

test('all three views and settings meet automated WCAG AA checks', async ({ page }) => {
  await page.goto('/');
  for (const width of [1440,390]) {
    await page.setViewportSize({ width, height:1050 });
    for (const view of ['focus','insights','guide']) {
      await page.locator('[data-view=' + view + ']').click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    await page.locator('#open-settings').click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.locator('#settings-dialog .dialog-close').click();
  }
});

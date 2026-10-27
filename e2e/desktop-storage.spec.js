import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createState } from '../src/core.js';
// This exercises the UI/preload contract in a browser, not native Electron or OS APIs.
async function desktopFixture(page,mode,{ openResult = true,canAutoStart = mode === 'profile' } = {}) {
  const state = createState(); state.settings.startAtLogin = mode === 'portable';
  const storage = { mode,directory:String.raw`D:\Мои программы\Focus Break\Focus Break Data`,canAutoStart };
  await page.addInitScript(({ state,storage,openResult })=>{
    window.desktopCalls = { preferences:[],opened:0,compact:[] };
    window.focusDesktop = {
      platform:'win32',
      loadState:async()=>({ kind:'ready',state:JSON.parse(localStorage.getItem('desktop-fixture-state') || JSON.stringify(state)),storage }),
      saveState:async raw=>{ localStorage.setItem('desktop-fixture-state',raw); return true; },
      replaceState:async raw=>{ localStorage.setItem('desktop-fixture-state',raw); return true; },
      recoverState:async()=>({ kind:'ready',state }),
      setTimer:async()=>true,
      setPreferences:async input=>{ window.desktopCalls.preferences.push(structuredClone(input)); return true; },
      compact:async enabled=>{ window.desktopCalls.compact.push(enabled); return enabled; },pin:async()=>true,exportFile:async()=>true,
      openDataDirectory:async()=>{ window.desktopCalls.opened++; return openResult; },
      onAction:()=>()=>{},onBeforeQuit:()=>()=>{},
    };
  },{ state,storage,openResult });
  await page.goto('/'); await page.locator('#open-settings').click();
  return storage;
}
test('portable settings show the selected folder and disable inherited autostart', async ({ page }) => {
  const storage = await desktopFixture(page,'portable');
  await expect(page.locator('#storage-mode')).toContainText('Portable');
  await expect(page.locator('#data-directory')).toHaveValue(storage.directory);
  await expect(page.locator('#data-directory')).toHaveAttribute('readonly','');
  await expect(page.locator('#portable-storage-hint')).toBeVisible();
  await expect(page.locator('[name=startAtLogin]')).toBeDisabled();
  await expect(page.locator('[name=startAtLogin]')).not.toBeChecked();
  await page.locator('#open-data-directory').click();
  expect(await page.evaluate(()=>window.desktopCalls.opened)).toBe(1);
  await page.locator('#settings-form [type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>window.desktopCalls.preferences.at(-1)?.startAtLogin)).toBe(false);
  await page.reload(); await page.locator('#open-settings').click();
  await expect(page.locator('[name=startAtLogin]')).toBeDisabled();
});
test('installed Windows settings retain the autostart control', async ({ page }) => {
  await desktopFixture(page,'profile');
  await expect(page.locator('#storage-mode')).toContainText('профиле Windows');
  await expect(page.locator('#portable-storage-hint')).not.toBeVisible();
  await expect(page.locator('[name=startAtLogin]')).toBeEnabled();
  await page.locator('[name=startAtLogin]').check();
  await page.locator('#settings-form [type=submit]').click();
  await expect.poll(()=>page.evaluate(()=>window.desktopCalls.preferences.at(-1)?.startAtLogin)).toBe(true);
});
test('custom storage disables autostart and reports failure to open its folder', async ({ page }) => {
  await desktopFixture(page,'custom',{ openResult:false });
  await expect(page.locator('#storage-mode')).toContainText('выбранной папке');
  await expect(page.locator('[name=startAtLogin]')).toBeDisabled();
  await page.locator('#open-data-directory').click();
  await expect(page.locator('#toast')).toContainText('Не удалось открыть папку');
});
test('leaving compact timer restores the regular window mode', async ({ page }) => {
  await desktopFixture(page,'profile');
  await page.locator('#settings-dialog .dialog-close').click();
  await page.locator('#compact-toggle').click();
  await expect(page.locator('body')).toHaveClass(/compact/);
  await expect(page.locator('#compact-toggle')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/compact/);
  await expect(page.locator('#compact-toggle')).toHaveAttribute('aria-pressed','false');
  await expect.poll(()=>page.evaluate(()=>window.desktopCalls.compact)).toEqual([true,false]);
  await page.locator('#compact-toggle').click();
  await page.locator('[data-view=insights]').click();
  await expect(page.locator('body')).not.toHaveClass(/compact/);
  await expect.poll(()=>page.evaluate(()=>window.desktopCalls.compact)).toEqual([true,false,true,false]);
});
test('portable settings fit mobile widths and pass RU/EN accessibility checks', async ({ page }) => {
  await desktopFixture(page,'portable');
  for (const language of ['ru','en']) {
    for (const width of [1440,390]) {
      await page.setViewportSize({ width,height:1050 });
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('#settings-dialog').evaluate(dialog=>dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    if (language === 'ru') {
      await page.locator('#settings-dialog .dialog-close').click();
      await page.locator('#language-toggle').click();
      await page.locator('#open-settings').click();
      await expect(page.locator('#storage-mode')).toContainText('data next to the EXE');
    }
  }
});

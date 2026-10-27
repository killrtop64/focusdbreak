import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createStateJournal } from '../shared/state-journal.js';
import { decodeDocument } from '../shared/state-codec.js';

const desktop = window.focusDesktop;
const android = Capacitor.getPlatform() === 'android';
export const platform = { desktop:Boolean(desktop), android, native:Boolean(desktop || android),storage:null };
const KEY = 'focus-break:v1';
let scheduled = '';
const keys = { primary:KEY, backup:KEY + ':last-good', pending:KEY + ':pending', draft:KEY + ':draft' };
const journal = desktop ? null : createStateJournal({
  async read(key) {
    return android ? (await Preferences.get({ key:keys[key] })).value : localStorage.getItem(keys[key]);
  },
  async write(key,raw) {
    if (android) await Preferences.set({ key:keys[key],value:raw });
    else localStorage.setItem(keys[key],raw);
  },
  async remove(key) {
    if (android) await Preferences.remove({ key:keys[key] });
    else localStorage.removeItem(keys[key]);
  },
  async archive(key,raw,reason) {
    const name = KEY + ':checkpoint:' + reason + ':' + Date.now() + ':' + crypto.randomUUID();
    if (android) await Preferences.set({ key:name,value:raw });
    else localStorage.setItem(name,raw);
  },
});
let pendingSave = Promise.resolve();
// Serialize browser tabs; each journal also rejects an outdated primary snapshot.
const withStorageLock = operation => !platform.native && navigator.locks
  ? navigator.locks.request('focus-break-storage',operation) : operation();

export async function loadNativeState(options) {
  if (desktop) {
    const report = await desktop.loadState();
    platform.storage = report.storage || null;
    return report;
  }
  return withStorageLock(()=>journal.load(options));
}
export function persistNativeState(raw) {
  decodeDocument(raw);
  // A synchronous browser draft survives closing the page before async commit.
  // Native platforms use their journal plus the desktop quit handshake.
  if (!platform.native) localStorage.setItem(keys.draft,raw);
  pendingSave = desktop ? desktop.saveState(raw) : withStorageLock(()=>journal.save(raw));
  return pendingSave;
}
export async function replaceStoredState(raw,reason = 'import') {
  decodeDocument(raw);
  pendingSave = desktop ? desktop.replaceState(raw,reason) : withStorageLock(()=>journal.replace(raw,reason));
  return pendingSave;
}
export function recoverStoredState() { return desktop ? desktop.recoverState() : withStorageLock(()=>journal.recover()); }
export async function flushStorage() { await pendingSave; if (journal) await journal.flush(); }
export async function requestNotifications() {
  if (desktop) return true;
  if (android) return (await LocalNotifications.requestPermissions()).display === 'granted';
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}
export async function syncNative(state, body, label) {
  if (desktop) {
    await desktop.setPreferences(state.settings);
    await desktop.setTimer({
      running:state.timer.running, endAt:state.timer.endAt, body, label,
      notifications:state.settings.notifications, sound:state.settings.sound,
    });
    return;
  }
  if (!android) return;
  const key = [state.timer.running, state.timer.endAt, state.settings.notifications, state.settings.language].join(':');
  if (key === scheduled) return;
  scheduled = key;
  await LocalNotifications.cancel({ notifications:[{ id:1001 }] });
  if (!state.timer.running || !state.settings.notifications || state.timer.endAt <= Date.now()) return;
  const permissions = await LocalNotifications.checkPermissions();
  if (permissions.display !== 'granted') return;
  await LocalNotifications.createChannel({ id:'focus-timer', name:'Focus Break', importance:4, visibility:1 });
  await LocalNotifications.schedule({ notifications:[{
    id:1001, title:'Focus Break', body, channelId:'focus-timer',
    schedule:{ at:new Date(state.timer.endAt), allowWhileIdle:true },
    smallIcon:'ic_stat_focus',
  }] });
}
export function notifyBrowser(enabled, body) {
  if (!platform.native && enabled && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('Focus Break', { body, icon:'./icon.svg' });
  }
}
export async function exportFile(name, text, type) {
  if (desktop) return desktop.exportFile(name, text);
  if (android) {
    const file = await Filesystem.writeFile({ path:name, data:text, directory:Directory.Cache, encoding:Encoding.UTF8 });
    await Share.share({ title:'Focus Break', files:[file.uri] });
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export function setCompact(enabled) { return desktop?.compact(enabled); }
export function setPinned(enabled) { return desktop?.pin(enabled); }
export function openDataDirectory() { return desktop?.openDataDirectory() || Promise.resolve(false); }
export async function setupNative(onAction, onFlush) {
  desktop?.onAction(onAction);
  desktop?.onBeforeQuit(onFlush);
  if (android) {
    await App.addListener('appStateChange', event => {
      if (event.isActive) onAction('resume');
      else onFlush().catch(()=>{});
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', () => onAction('resume'));
    await App.addListener('backButton', async () => { if (onAction('back') === false) await App.minimizeApp(); });
  }
}

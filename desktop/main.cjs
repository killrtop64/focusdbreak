const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, protocol, shell, dialog, nativeImage, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createFileStateStore } = require('./state-store.cjs');
const { configureDataLocation, dataLocationErrorMessage } = require('./data-location.cjs');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'focusbreak://app/';
const APP_ID = 'io.focusbreak.app';
let window, tray, quitting = false, quitRequested = false, timerTimeout, compact = false, previousBounds;
let settings = { closeToTray:true, startAtLogin:false };
let timer = null;
let stateStore, quitAcknowledgement;
let dataLocation;

protocol.registerSchemesAsPrivileged([{ scheme:'focusbreak', privileges:{ standard:true, secure:true, supportFetchAPI:true, corsEnabled:true } }]);
app.setAppUserModelId(APP_ID);
try { dataLocation = configureDataLocation(app); }
catch (error) { dialog.showErrorBox('Focus Break',dataLocationErrorMessage(error)); app.exit(1); }
const locked = dataLocation && app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', showWindow);
  app.whenReady().then(boot);
}

function showWindow() {
  if (!window || window.isDestroyed()) return;
  window.show();
  if (window.isMinimized()) window.restore();
  window.focus();
}
function trusted(event) {
  if (!event.senderFrame?.url?.startsWith(ORIGIN)) throw new Error('Untrusted frame');
}
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => { trusted(event); return callback(...args); });
}
function notify() {
  if (!timer || !timer.notifications) return;
  const notification = new Notification({
    title:'Focus Break',
    body:timer.body,
    silent:!timer.sound,
    icon:path.join(ROOT, 'build/icons/256.png'),
  });
  notification.on('click', showWindow);
  notification.show();
}
function setTimer(input) {
  clearTimeout(timerTimeout);
  if (!input || input.running !== true || !Number.isFinite(input.endAt) || input.endAt > Date.now() + 7_200_000) {
    timer = null; tray?.setToolTip('Focus Break'); return;
  }
  // Repeated state saves do not reschedule an identical deadline.
  timer = {
    endAt:input.endAt, notifications:input.notifications === true, sound:input.sound === true,
    body:typeof input.body === 'string' ? input.body.slice(0, 200) : 'Session complete',
  };
  tray?.setToolTip('Focus Break · ' + (input.label || '').slice(0, 100));
  timerTimeout = setTimeout(() => {
    notify(); timer = null;
    tray?.setToolTip('Focus Break');
  }, Math.max(0, timer.endAt - Date.now()));
}
async function boot() {
  protocol.handle('focusbreak', async request => {
    const url = new URL(request.url);
    const root = path.join(ROOT, 'dist');
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.hostname !== 'app' || (file !== root && !file.startsWith(root + path.sep))) return new Response('Forbidden', { status:403 });
    try {
      const bytes = await fs.readFile(file);
      const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
      return new Response(bytes, { headers:{
        'Content-Type':types[path.extname(file)] || 'application/octet-stream',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
      } });
    } catch { return new Response('Not found', { status:404 }); }
  });
  window = new BrowserWindow({
    width:1320, height:940, minWidth:380, minHeight:620, show:false,
    backgroundColor:'#131918', title:'Focus Break',
    icon:path.join(ROOT, 'build/icons/256.png'),
    webPreferences:{
      preload:path.join(__dirname, 'preload.cjs'), contextIsolation:true, sandbox:true,
      nodeIntegration:false, backgroundThrottling:false, spellcheck:false,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.osha\.gov|github\.com|learn\.chatgpt\.com)\//.test(url)) shell.openExternal(url);
    return { action:'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(ORIGIN)) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.once('ready-to-show', () => window.show());
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    if (settings.closeToTray && tray) window.hide();
    else app.quit();
  });
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'build/icons/32.png')));
    tray.setToolTip('Focus Break');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label:'Focus Break', click:showWindow },
      { label:'Старт / пауза · Start / pause', click:() => window.webContents.send('app:action', 'toggle') },
      { label:'Поверх окон · Always on top', type:'checkbox', click:item => window.setAlwaysOnTop(item.checked) },
      { type:'separator' },
      { label:'Выход · Quit', click:() => app.quit() },
    ]));
    tray.on('double-click', showWindow);
    tray.on('click', showWindow);
  } catch { tray = null; }

  stateStore = await createFileStateStore(app.getPath('userData'));
  handle('state:load', async () => ({ ...await stateStore.load(),storage:dataLocation }));
  handle('storage:open-directory', async () => (await shell.openPath(dataLocation.directory)) === '');
  handle('state:save', raw => stateStore.save(raw));
  handle('state:replace', (raw,reason) => stateStore.replace(raw,reason === 'reset' ? 'reset' : 'import'));
  handle('state:recover', () => stateStore.recover());
  ipcMain.on('state:flushed',(event,nonce,success) => {
    trusted(event);
    if (quitAcknowledgement?.nonce === nonce) quitAcknowledgement.resolve(success === true);
  });
  handle('timer:set', setTimer);
  handle('preferences:set', input => {
    settings = { closeToTray:input?.closeToTray !== false, startAtLogin:dataLocation.canAutoStart && input?.startAtLogin === true };
    if (dataLocation.canAutoStart) app.setLoginItemSettings({ openAtLogin:settings.startAtLogin });
    return true;
  });
  handle('window:pin', enabled => { window.setAlwaysOnTop(enabled === true); return window.isAlwaysOnTop(); });
  handle('window:compact', enabled => {
    if ((enabled === true) === compact) return compact;
    compact = enabled === true;
    if (compact) {
      previousBounds = window.getBounds();
      window.setMinimumSize(360, 520); window.setSize(390, 650); window.setAlwaysOnTop(true);
    } else {
      window.setMinimumSize(380, 620);
      if (previousBounds) window.setBounds(previousBounds);
      window.setAlwaysOnTop(false);
    }
    return compact;
  });
  handle('file:export', async input => {
    if (!input || typeof input.text !== 'string' || input.text.length > 20_000_000) throw new Error('Invalid export');
    const name = path.basename(String(input.name || 'focus-break.json')).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const chosen = await dialog.showSaveDialog(window, { defaultPath:path.join(app.getPath('downloads'), name) });
    if (chosen.canceled) return false;
    await fs.writeFile(chosen.filePath, input.text, { mode:0o600 });
    return true;
  });
  powerMonitor.on('resume', () => {
    if (timer && timer.endAt <= Date.now()) { clearTimeout(timerTimeout); notify(); timer = null; }
    if (window && !window.isDestroyed()) window.webContents.send('app:action', 'resume');
  });
  await window.loadURL(ORIGIN);
}
app.on('before-quit', async event => {
  if (quitting) return;
  event.preventDefault();
  if (quitRequested) return;
  quitRequested = true;
  let saved = true;
  if (window && !window.isDestroyed()) {
    saved = await new Promise(resolve => {
      const nonce = Date.now().toString();
      const timeout = setTimeout(()=>resolve(false),4000);
      quitAcknowledgement = { nonce, resolve:success => { clearTimeout(timeout); resolve(success); } };
      window.webContents.send('state:before-quit',nonce);
    });
    quitAcknowledgement = null;
  }
  try { await stateStore?.flush(); } catch { saved = false; }
  if (!saved) {
    const options = {
      type:'warning',title:'Focus Break',
      message:'Не удалось подтвердить сохранение. / Saving could not be confirmed.',
      detail:'Останьтесь в приложении и скачайте резервную копию. / Stay in the app and export a backup.',
      buttons:['Остаться / Stay','Выйти / Quit'],defaultId:0,cancelId:0,
    };
    const choice = await (window && !window.isDestroyed() ? dialog.showMessageBox(window,options) : dialog.showMessageBox(options));
    if (choice.response === 0) { quitRequested = false; showWindow(); return; }
  }
  quitting = true; clearTimeout(timerTimeout); app.quit();
});
app.on('window-all-closed', () => { if (!tray) app.quit(); });

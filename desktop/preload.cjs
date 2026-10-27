const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('focusDesktop', {
  platform:process.platform,
  loadState:() => ipcRenderer.invoke('state:load'),
  saveState:raw => ipcRenderer.invoke('state:save', raw),
  replaceState:(raw,reason) => ipcRenderer.invoke('state:replace', raw, reason),
  recoverState:() => ipcRenderer.invoke('state:recover'),
  openDataDirectory:() => ipcRenderer.invoke('storage:open-directory'),
  setTimer:timer => ipcRenderer.invoke('timer:set', timer),
  setPreferences:settings => ipcRenderer.invoke('preferences:set', settings),
  compact:enabled => ipcRenderer.invoke('window:compact', enabled),
  pin:enabled => ipcRenderer.invoke('window:pin', enabled),
  exportFile:(name, text) => ipcRenderer.invoke('file:export', { name, text }),
  onAction:callback => {
    const listener = (_, action) => callback(action);
    ipcRenderer.on('app:action', listener);
    return () => ipcRenderer.removeListener('app:action', listener);
  },
  onBeforeQuit:callback => {
    ipcRenderer.on('state:before-quit', async (_event, nonce) => {
      try { await callback(); ipcRenderer.send('state:flushed',nonce,true); }
      catch { ipcRenderer.send('state:flushed',nonce,false); }
    });
  },
});

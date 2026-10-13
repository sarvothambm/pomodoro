const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  updateTray: (data) => ipcRenderer.send('update-tray', data),
  sendNotification: (data) => ipcRenderer.send('send-notification', data),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  showWindow: () => ipcRenderer.send('show-window'),
  setPowerSaveBlocker: (enable) => ipcRenderer.send('set-power-save-blocker', enable),
  onTrayAction: (callback) => {
    ipcRenderer.on('tray-action', (event, action) => callback(action));
  }
});

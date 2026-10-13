const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, powerSaveBlocker } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let powerSaveId = null;
let isQuitting = false;

// Ensure unique isolated user-data to prevent Chromium lock collisions
app.setPath('userData', path.join(app.getPath('appData'), 'PulsePomodoroApp'));

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getIcon() {
  const iconPath = path.join(__dirname, 'icon.png');
  return nativeImage.createFromPath(iconPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 780,
    minHeight: 600,
    title: 'Pulse Pomodoro',
    backgroundColor: '#0a0a0f',
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // Crucial for laptop timers: do not throttle when hidden/minimized
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize or close to tray logic
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon?.({
          title: 'Pulse Pomodoro',
          content: 'Timer is still running quietly in your system tray.'
        });
      }
    }
  });
}

function createTray() {
  const icon = getIcon();
  tray = new Tray(icon);
  tray.setToolTip('Pulse Pomodoro - Minimalist Focus Timer');

  const updateMenu = (statusText = 'Ready', timeRemaining = '25:00', isRunning = false) => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `● ${statusText}: ${timeRemaining}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: isRunning ? '⏸ Pause Timer' : '▶ Start Timer',
        click: () => mainWindow?.webContents.send('tray-action', 'toggle')
      },
      {
        label: '⏭ Skip Interval',
        click: () => mainWindow?.webContents.send('tray-action', 'skip')
      },
      {
        label: '↺ Reset Timer',
        click: () => mainWindow?.webContents.send('tray-action', 'reset')
      },
      { type: 'separator' },
      {
        label: '⏱ 25 min Focus',
        click: () => mainWindow?.webContents.send('tray-action', 'set-25')
      },
      {
        label: '⏱ 30 min Focus',
        click: () => mainWindow?.webContents.send('tray-action', 'set-30')
      },
      {
        label: '☕ 5 min Short Break',
        click: () => mainWindow?.webContents.send('tray-action', 'set-5')
      },
      {
        label: '🌴 15 min Long Break',
        click: () => mainWindow?.webContents.send('tray-action', 'set-15')
      },
      { type: 'separator' },
      {
        label: '📊 Open Dashboard',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('tray-action', 'open-dashboard');
          }
        }
      },
      {
        label: '🪟 Show Window',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: '⏏ Minimize to Tray',
        click: () => mainWindow?.hide()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  };

  updateMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // macOS dock title / tray title
  ipcMain.on('update-tray', (event, { status, timeRemaining, isRunning }) => {
    if (tray) {
      const tooltip = `Pulse Pomodoro [${status}]: ${timeRemaining}`;
      tray.setToolTip(tooltip);
      if (process.platform === 'darwin') {
        tray.setTitle(`${timeRemaining}`);
      }
      updateMenu(status, timeRemaining, isRunning);
    }
  });
}

// Power save blocker (prevents laptop display/system sleep during active work)
ipcMain.on('set-power-save-blocker', (event, enable) => {
  if (enable && powerSaveId === null) {
    powerSaveId = powerSaveBlocker.start('prevent-app-suspension');
  } else if (!enable && powerSaveId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveId)) {
      powerSaveBlocker.stop(powerSaveId);
    }
    powerSaveId = null;
  }
});

// Native Desktop Notifications
ipcMain.on('send-notification', (event, { title, body, silent }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title,
      body,
      icon: getIcon(),
      silent: silent || false
    });
    notif.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    notif.show();
  }
});

ipcMain.on('minimize-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.on('show-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep app alive in tray unless explicitly quit
    if (isQuitting) {
      app.quit();
    }
  }
});

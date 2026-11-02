// Electron shell: one window, plus a menu-bar (tray) icon with an "Open Cadence" button.
// Later milestones add a hidden music.youtube.com view for playback.
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

let win = null;
let tray = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1b1410',
    title: 'Cadence',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const dev = process.env.CADENCE_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => { win = null; });
}

// Show the window, creating it again if it was closed.
function openCadence() {
  if (!win) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Cadence');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Cadence', click: openCadence },
    { type: 'separator' },
    { label: 'Quit Cadence', role: 'quit' },
  ]));
  // Windows/Linux: a plain click opens the app too (macOS shows the menu on click).
  tray.on('click', openCadence);
}

// A second launch just brings the existing window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openCadence);
  app.whenReady().then(() => {
    createWindow();   // open on start
    createTray();
    app.on('activate', openCadence);
  });
  // Stay alive in the menu bar after the window is closed on macOS.
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

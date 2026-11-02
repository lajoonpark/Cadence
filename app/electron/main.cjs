// Electron shell: the shop window, a hidden YouTube Music player (ytm.cjs) and a menu-bar (tray)
// icon with an "Open Cadence" button.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('node:path');
const { createYtm } = require('./ytm.cjs');

// Music starts when you pick a record, without a click inside the YouTube Music page itself.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let tray = null;
let ytm = null;

function startPlayer() {
  ytm = createYtm({
    onState: (s) => win?.webContents.send('ytm:state', s),
    onSignedIn: () => win?.webContents.send('ytm:signedIn'),
  });
  ipcMain.handle('ytm:home', (_e, next) => ytm.home(next));
  ipcMain.handle('ytm:play', (_e, endpoint) => ytm.play(endpoint));
  ipcMain.handle('ytm:command', (_e, name, arg) => ytm.command(name, arg));
  ipcMain.handle('ytm:signIn', () => ytm.signIn(win));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1b1410',
    title: 'Cadence',
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  const dev = process.env.CADENCE_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => {
    win = null;
    // The hidden player keeps the app alive, so quit explicitly where closing the window means quit.
    if (process.platform !== 'darwin') app.quit();
  });
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
    startPlayer();
    createWindow();   // open on start
    createTray();
    app.on('activate', openCadence);
  });
  // Stay alive in the menu bar after the window is closed on macOS (the music keeps playing).
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

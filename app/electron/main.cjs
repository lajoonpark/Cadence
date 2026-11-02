// Electron shell: just a window for now. Later milestones add a hidden music.youtube.com view for playback.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1b1410',
    title: 'Cadence',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const dev = process.env.CADENCE_DEV_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

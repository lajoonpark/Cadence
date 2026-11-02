// The only bridge between the shop (renderer) and YouTube Music (main process).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cadence', {
  home: (next) => ipcRenderer.invoke('ytm:home', next),
  play: (endpoint) => ipcRenderer.invoke('ytm:play', endpoint),
  command: (name, arg) => ipcRenderer.invoke('ytm:command', name, arg),
  signIn: () => ipcRenderer.invoke('ytm:signIn'),
  onState: (cb) => ipcRenderer.on('ytm:state', (_e, s) => cb(s)),
  onSignedIn: (cb) => ipcRenderer.on('ytm:signedIn', () => cb()),
});

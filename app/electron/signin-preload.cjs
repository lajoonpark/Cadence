// Sign-in window only: Firefox has no User-Agent Client Hints API, so hide it to match the
// Firefox user agent this window sends (see signIn in ytm.cjs).
const { contextBridge } = require('electron');

contextBridge.executeInMainWorld({
  func: () => { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined }); },
});

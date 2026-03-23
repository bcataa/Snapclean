const { contextBridge, ipcRenderer } = require("electron");
console.log("overlay preload loaded");

const api = {
  captureArea(rect) {
    ipcRenderer.send("overlay:capture-area", rect);
  },
  captureAreaAction(payload) {
    ipcRenderer.send("overlay:capture-area-action", payload);
  },
  captureFullscreen() {
    ipcRenderer.send("overlay:capture-fullscreen");
  },
  cancel() {
    ipcRenderer.send("overlay:cancel");
  },
  onStart(callback) {
    ipcRenderer.on("overlay:start", (_event, data) => callback(data));
  },
};

contextBridge.exposeInMainWorld("overlayAPI", api);
contextBridge.exposeInMainWorld("electronAPI", {
  captureArea(data) {
    ipcRenderer.send("overlay:capture-area-action", data);
  },
  captureFullscreen: api.captureFullscreen,
  cancel: api.cancel,
  onStart: api.onStart,
});

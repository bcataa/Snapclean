const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("captureAPI", {
  onGrab(callback) {
    ipcRenderer.on("capture:grab", () => callback());
  },
  sendResult(dataUrl) {
    ipcRenderer.send("capture:result", dataUrl);
  },
});

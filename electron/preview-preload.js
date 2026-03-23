const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("previewAPI", {
  expand() {
    ipcRenderer.send("preview:expand");
  },
  collapse() {
    ipcRenderer.send("preview:collapse");
  },
  pin(value) {
    ipcRenderer.send("preview:pin", Boolean(value));
  },
  setEditMode(value) {
    ipcRenderer.send("preview:edit-mode", Boolean(value));
  },
  updateData(dataUrl) {
    ipcRenderer.send("preview:update-data", dataUrl);
  },
  edit() {
    ipcRenderer.send("preview:edit");
  },
  copy() {
    ipcRenderer.send("preview:copy");
  },
  save() {
    ipcRenderer.send("preview:save");
  },
  closeNow() {
    ipcRenderer.send("preview:close");
  },
  onShow(callback) {
    ipcRenderer.on("preview:show", (_event, data) => callback(data));
  },
  onForcePin(callback) {
    ipcRenderer.on("preview:force-pin", (_event, pinned) => callback(Boolean(pinned)));
  },
});

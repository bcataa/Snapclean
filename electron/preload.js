const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  receiveScreenshot: (callback) => {
    ipcRenderer.on("load-screenshot", (_e, data) => {
      callback(data);
    });
  },

  async readClipboardImage() {
    return ipcRenderer.invoke("clipboard:read-image");
  },

  onClipboardImageUpdated(callback) {
    if (typeof callback !== "function") return () => {};
    const listener = () => callback();
    ipcRenderer.on("editor:clipboard-updated", listener);
    return () => ipcRenderer.removeListener("editor:clipboard-updated", listener);
  },

  async loadSettings() {
    return ipcRenderer.invoke("settings:load");
  },

  async saveSettings(settings) {
    return ipcRenderer.invoke("settings:save", settings);
  },

  async getSettingsPath() {
    return ipcRenderer.invoke("settings:path");
  },

  async setEditorPinned(pinned) {
    return ipcRenderer.invoke("editor:set-pinned", Boolean(pinned));
  },
});

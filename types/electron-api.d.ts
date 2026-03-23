export {};

export interface AppSettings {
  shortcut: string;
  autoCopy: boolean;
  showPreview: boolean;
  defaultMode: "area" | "fullscreen";
}

declare global {
  interface Window {
    electronAPI?: {
      receiveScreenshot: (callback: (dataUrl: string) => void) => void;
      readClipboardImage: () => Promise<string | null>;
      onClipboardImageUpdated: (callback: () => void) => () => void;
      loadSettings: () => Promise<AppSettings>;
      saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
      getSettingsPath: () => Promise<string>;
      setEditorPinned: (pinned: boolean) => Promise<boolean>;
    };
  }
}

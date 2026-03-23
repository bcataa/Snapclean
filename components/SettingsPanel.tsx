"use client";

import { useEffect, useState } from "react";
import type { AppSettings } from "@/types/electron-api";

const defaults: AppSettings = {
  shortcut: "CommandOrControl+Shift+S",
  autoCopy: true,
  showPreview: true,
  defaultMode: "area",
};

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 " +
  "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-colors";

const toggleClass =
  "relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors " +
  "focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900";

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settingsPath, setSettingsPath] = useState("");

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.loadSettings) {
      setLoaded(true);
      return;
    }
    api.loadSettings().then((s) => {
      setSettings({ ...defaults, ...s });
      setLoaded(true);
    });
    api.getSettingsPath().then(setSettingsPath);
  }, []);

  async function handleSave() {
    const api = window.electronAPI;
    if (api?.saveSettings) {
      const updated = await api.saveSettings(settings);
      setSettings({ ...defaults, ...updated });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (!loaded) {
    return (
      <div className="flex h-40 items-center justify-center text-zinc-500">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      {/* Shortcut */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-zinc-300">
          Global Shortcut
        </label>
        <input
          type="text"
          value={settings.shortcut}
          onChange={(e) => update("shortcut", e.target.value)}
          className={inputClass}
          placeholder="CommandOrControl+Shift+S"
        />
        <p className="text-xs text-zinc-500">
          Electron accelerator format. Restart required after change.
        </p>
      </div>

      {/* Default mode */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-zinc-300">
          Default Capture Mode
        </label>
        <div className="flex gap-3">
          {(["area", "fullscreen"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => update("defaultMode", mode)}
              className={
                "rounded-lg border px-4 py-2 text-sm font-medium transition-all " +
                (settings.defaultMode === mode
                  ? "border-blue-500 bg-blue-500/20 text-blue-400"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200")
              }
            >
              {mode === "area" ? "Area Select" : "Fullscreen"}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle: auto copy */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-300">
            Auto-copy to clipboard
          </p>
          <p className="text-xs text-zinc-500">
            Copies screenshot immediately after capture
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.autoCopy}
          onClick={() => update("autoCopy", !settings.autoCopy)}
          className={
            toggleClass +
            (settings.autoCopy ? " bg-blue-500" : " bg-zinc-700")
          }
        >
          <span
            className={
              "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform " +
              (settings.autoCopy ? "translate-x-6" : "translate-x-1")
            }
          />
        </button>
      </div>

      {/* Toggle: show preview */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-300">
            Show preview after capture
          </p>
          <p className="text-xs text-zinc-500">
            Floating thumbnail with Edit / Copy / Save actions
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.showPreview}
          onClick={() => update("showPreview", !settings.showPreview)}
          className={
            toggleClass +
            (settings.showPreview ? " bg-blue-500" : " bg-zinc-700")
          }
        >
          <span
            className={
              "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform " +
              (settings.showPreview ? "translate-x-6" : "translate-x-1")
            }
          />
        </button>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-500 active:scale-[0.98]"
        >
          Save Settings
        </button>
        {saved && (
          <span className="text-sm text-green-400 animate-in fade-in">
            Saved & shortcut re-registered
          </span>
        )}
      </div>

      {settingsPath && (
        <p className="border-t border-zinc-800 pt-4 text-xs text-zinc-600">
          Settings file: {settingsPath}
        </p>
      )}
    </div>
  );
}

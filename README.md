# CleanShot Web

A CleanShot X-style screenshot tool built with **Electron**, **Next.js 14** (App Router), **Tailwind CSS**, and **Fabric.js**. Global shortcut triggers a screen-freeze overlay for area selection, shows a floating preview, and opens a full editor on demand.

## Requirements

- **Node.js 20+**
- **macOS** recommended (menu-bar mode, `desktopCapturer`, screen recording permission)

## Quick start

```bash
npm install
npm run dev:electron
```

This starts the Next.js dev server and launches Electron concurrently. The main window loads `http://localhost:3000` (retries until the dev server is up).

## How it works

### Capture flow

1. **Press the global shortcut** (default **⌘⇧S** / **Ctrl+Shift+S**)
2. Electron captures a frozen frame of the primary display via `desktopCapturer`
3. A **fullscreen transparent overlay** appears with the frozen frame dimmed
4. **Drag** to select an area — live dimensions and a magnifier loupe are shown
5. On release, the selected region is **cropped** and optionally **copied to clipboard**
6. A **floating preview** appears (bottom-right) with **Edit**, **Copy**, and **Close** actions
7. Clicking **Edit** opens the main editor window and loads the screenshot into the Fabric.js canvas

### Mode keys (during overlay)

| Key   | Action          |
| ----- | --------------- |
| Drag  | Area selection  |
| **F** | Fullscreen capture |
| **Esc** | Cancel        |

### Menu bar

On macOS the app hides its dock icon and lives in the **menu bar** (tray). Right-click the tray for Capture Area, Fullscreen Capture, Open Editor, or Quit.

## Settings

Open `http://localhost:3000/settings` in the editor (or click "Settings" at the bottom of the main page). You can change:

- **Global shortcut** (Electron accelerator format)
- **Default capture mode** (area or fullscreen)
- **Auto-copy to clipboard** after capture
- **Show floating preview** after capture

Settings are stored as JSON in your app data directory:

- macOS: `~/Library/Application Support/cleanshot-web/settings.json`
- Windows: `%APPDATA%/cleanshot-web/settings.json`

See `settings.example.json` for the format. After saving, the global shortcut is immediately re-registered.

## Editor features

- **Upload** — PNG / JPEG file upload; canvas resizes to image dimensions
- **Add Blur** — Semi-transparent dark rectangles; drag and resize
- **Highlight** — Yellow marker-style rectangles; drag and resize
- **Download** — Export as PNG with optional "CleanShot Web" watermark

## macOS permissions

Grant **Screen Recording** permission for Electron (or Terminal, if running via CLI) in **System Settings → Privacy & Security → Screen Recording**, or captures will be empty.

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Next.js dev server only                  |
| `npm run electron`   | Electron only (expects dev server at :3000) |
| `npm run dev:electron` | Next.js + Electron together            |
| `npm run build`      | Production static export (`out/`)        |
| `npm run build:mac`  | Build `.app` + `.dmg` with electron-builder |
| `npm run lint`       | ESLint                                   |

## Packaging macOS app

This project is configured with `electron-builder`:

- `appId`: `com.snapclean.app`
- `productName`: `SnapClean`
- mac target: `dmg`
- icon: `build/icon.icns`

Run:

```bash
npm run build:mac
```

Artifacts are generated in `dist/`:

- `dist/mac-arm64/SnapClean.app`
- `dist/SnapClean-<version>.dmg`

The packaged app does **not** use localhost. In production (`app.isPackaged === true`), Electron loads the static Next.js build from `out/index.html`.

## GitHub release installer (no terminal for users)

To let users install without terminal:

1. Push this project to GitHub.
2. Create a tag like `v0.1.1` and push it.
3. GitHub Actions workflow `.github/workflows/release-mac.yml` builds and publishes `SnapClean-mac.dmg` to Releases.

Website download options:

- Set `NEXT_PUBLIC_GH_OWNER` and `NEXT_PUBLIC_GH_REPO` to auto-link:
  `https://github.com/<owner>/<repo>/releases/latest/download/SnapClean-mac.dmg`
- Or set `NEXT_PUBLIC_MAC_DOWNLOAD_URL` directly.

## Project structure

```
electron/
  main.js              Electron main process — windows, shortcuts, capture, IPC
  preload.js           Main-window bridge (screenshot + settings)
  overlay.html         Fullscreen selection overlay (pure HTML/JS)
  overlay-preload.js   Overlay IPC bridge
  preview.html         Floating preview widget
  preview-preload.js   Preview IPC bridge
app/
  page.tsx             Home — renders ScreenshotApp
  settings/page.tsx    Settings UI page
components/
  ScreenshotApp.tsx    Editor layout + IPC integration
  CanvasEditor.tsx     Fabric.js canvas (client-only)
  Toolbar.tsx          Upload / Blur / Highlight / Download buttons
  SettingsPanel.tsx    Settings form component
types/
  electron-api.d.ts    Window.electronAPI typings
```

All image processing is client-side. No backend, auth, or database.

## Security

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Only minimal IPC is exposed through `contextBridge` in each preload script

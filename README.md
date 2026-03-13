# My Switcher Browser Extension

Cross-browser extension source for switching Google services with account-aware URLs in both Chrome and Firefox.

## Overview

My Switcher provides a compact popup for opening Google AI tools and common Google services with a selected account slot. The current codebase shares one React/Vite popup implementation across both browser targets, with per-browser manifest output at build time.

Core capabilities:

- Account-aware app launching for Google AI apps and general Google services.
- Compact popup UI tuned to show regular actions and app grids without unnecessary scrolling.
- Custom app management with local sync storage persistence.
- Custom app backup import/export with JSON validation before writing into extension storage.
- Theme switching with runtime storage fallback for local preview.

## Browser Targets

- Chrome: MV3 manifest in `extension/manifest.json`, packaged as `dist/chrome/` and `artifacts/my-switcher-chrome.zip`.
- Firefox: MV3-compatible manifest override in `extension/manifest.firefox.json`, packaged as `dist/firefox/` and `artifacts/my-switcher-firefox.xpi`.
- Shared runtime layer: `src/lib/webextension.ts` normalizes `chrome.*` and `browser.*` differences for storage and tab creation.

## Project Structure

- `extension/manifest.json`: Chrome MV3 manifest source.
- `extension/manifest.firefox.json`: Firefox MV3 manifest override.
- `popup.html`: popup entry consumed by Vite.
- `src/App.tsx`: popup UI and extension interaction logic.
- `src/index.css`: compact popup layout, theming tokens, and responsive grid styling.
- `src/lib/custom-app-backup.ts`: backup export and validated import parsing for custom apps.
- `src/lib/webextension.ts`: `browser.*` adapter with callback-to-promise fallback for `chrome.*`.
- `src/lib/popup-state.ts`: sync storage and local preview storage abstraction.
- `scripts/build-extension.mjs`: target-aware Vite build entry.
- `scripts/package-extension.mjs`: target-aware extension packager.

## Local Preview

1. Install dependencies:
   `npm install`
2. Start the popup preview:
   `npm run dev`

The dev server uses local storage when it is not running inside an extension runtime.

## Build Targets

Build the default Chrome target:

```bash
npm run build
```

Build Chrome explicitly:

```bash
npm run build:chrome
```

Output: `dist/chrome/`

Build Firefox explicitly:

```bash
npm run build:firefox
```

Output: `dist/firefox/`

## Package Targets

Package the Chrome extension as a `.zip`:

```bash
npm run package:chrome
```

Output: `artifacts/my-switcher-chrome.zip`

Package the Firefox extension as an `.xpi`:

```bash
npm run package:firefox
```

Output: `artifacts/my-switcher-firefox.xpi`

If the default Firefox artifact is locked by the browser, the packager falls back to a timestamped filename in `artifacts/`.

## Load Unpacked Builds

- Chrome:
  Open `chrome://extensions`, enable Developer Mode, choose "Load unpacked", and select `dist/chrome/`.
- Firefox:
  Open `about:debugging#/runtime/this-firefox`, choose "Load Temporary Add-on", and select the generated `dist/firefox/manifest.json`.

## Store Submission Notes

- Chrome Web Store:
  Keep permissions minimal. The current Chrome manifest only requests `storage`.
- Firefox AMO:
  Update `browser_specific_settings.gecko.id` in `extension/manifest.firefox.json` to your own stable extension ID before publishing.

## Compatibility Notes

- Storage:
  `src/lib/popup-state.ts` prefers extension sync storage and falls back to `localStorage` during local preview or runtime failure.
- API namespace:
  Firefox uses `browser.*`; Chrome uses `chrome.*`. The runtime adapter keeps popup code browser-agnostic.
- Backup files:
  Import accepts either the structured My Switcher backup payload or a raw custom app array, but rejects malformed entries and unsupported schema versions.

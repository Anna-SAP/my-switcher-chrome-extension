# My Switcher Chrome Extension

Chrome-first extension source for switching Google services with account-aware URLs, plus a Firefox-compatible build target.

## Project Structure

- `extension/manifest.json`: Chrome MV3 manifest source.
- `extension/manifest.firefox.json`: Firefox MV3 manifest override.
- `popup.html`: popup entry consumed by Vite.
- `src/App.tsx`: popup UI and extension interaction logic.
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

## Build Chrome Sources

Generate the distributable Chrome extension directory:

```bash
npm run build:chrome
```

Output: `dist/chrome/`

## Package a `.zip`

Manual packaging through the built-in script:

```bash
npm run package:chrome
```

Output: `artifacts/my-switcher-chrome.zip`

## Optional Firefox Build

Generate the Firefox build directory:

```bash
npm run build:firefox
```

Package the Firefox `.xpi`:

```bash
npm run package:firefox
```

Before submitting to AMO, update `browser_specific_settings.gecko.id` in `extension/manifest.firefox.json` to your own stable extension ID.

# My Switcher Firefox Extension

Firefox-first WebExtension source for switching Google services with account-aware URLs.

## Project Structure

- `extension/manifest.json`: Firefox MV3 manifest source.
- `popup.html`: popup entry consumed by Vite.
- `src/App.tsx`: popup UI and extension interaction logic.
- `src/lib/webextension.ts`: `browser.*` adapter with callback-to-promise fallback for `chrome.*`.
- `src/lib/popup-state.ts`: sync storage and local preview storage abstraction.
- `scripts/package-firefox.mjs`: manual `.xpi` packager.

## Local Preview

1. Install dependencies:
   `npm install`
2. Start the popup preview:
   `npm run dev`

The dev server uses local storage when it is not running inside Firefox.

## Build Firefox Sources

Generate the distributable Firefox extension directory:

```bash
npm run build:firefox
```

Output: `dist/firefox/`

## Package a `.xpi`

Manual packaging through the built-in script:

```bash
npm run package:firefox
```

Output: `artifacts/my-switcher-firefox.xpi`

Alternative using `web-ext`:

```bash
npm install --save-dev web-ext
npx web-ext build --source-dir dist/firefox --artifacts-dir artifacts/web-ext
```

Before submitting to AMO, update `browser_specific_settings.gecko.id` in `extension/manifest.json` to your own stable extension ID.
# Project Rules

## Build Requirement

After every code change, always run the full package build for both Chrome and Firefox before committing/pushing:

```bash
npm run package:chrome && npm run package:firefox
```

This produces the required artifacts:
- `artifacts/my-switcher-chrome.zip`
- `artifacts/my-switcher-firefox.xpi`

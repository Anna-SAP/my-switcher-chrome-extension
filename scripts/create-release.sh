#!/usr/bin/env bash
# Usage: ./scripts/create-release.sh [version]
# Example: ./scripts/create-release.sh v1.1.0
#
# Prerequisites:
#   - gh CLI installed and authenticated (gh auth login)
#   - artifacts/ directory contains the built packages

set -euo pipefail

VERSION="${1:-v1.1.0}"
CHROME_ZIP="artifacts/my-switcher-chrome.zip"
FIREFOX_XPI="artifacts/my-switcher-firefox.xpi"

# Verify artifacts exist
for file in "$CHROME_ZIP" "$FIREFOX_XPI"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: $file not found. Run 'npm run package:chrome && npm run package:firefox' first."
    exit 1
  fi
done

# Verify gh is authenticated
if ! gh auth status &>/dev/null; then
  echo "ERROR: gh CLI is not authenticated. Run 'gh auth login' first."
  exit 1
fi

echo "Creating release $VERSION with assets:"
echo "  - $CHROME_ZIP"
echo "  - $FIREFOX_XPI"

gh release create "$VERSION" \
  "$CHROME_ZIP" \
  "$FIREFOX_XPI" \
  --title "$VERSION – Profile Pictures" \
  --notes "Adds Google account profile pictures to the account selector dropdown."

echo "Release $VERSION created successfully!"

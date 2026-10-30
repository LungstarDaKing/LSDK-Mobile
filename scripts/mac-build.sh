#!/usr/bin/env bash
# Run on a Mac with Xcode installed:  bash scripts/mac-build.sh
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "ERROR: $1" >&2; exit 1; }
[ "$(uname)" = "Darwin" ] || fail "This must run on macOS."
command -v xcodebuild >/dev/null || fail "Xcode not installed. Install it from the App Store, open it once, accept the licence."
command -v node >/dev/null || fail "Node.js missing. Install Node 20+ from nodejs.org."
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || fail "Node 20 or newer is required."
if ! command -v pod >/dev/null; then echo "Installing CocoaPods..."; sudo gem install cocoapods || brew install cocoapods; fi
[ -f .env ] || fail "Missing .env. Run: cp .env.example .env  then fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY."
grep -q "YOUR-PROJECT" .env && fail ".env still has placeholder values."

npm ci
npm run typecheck
npm test
npx expo prebuild --platform ios --clean
(cd ios && pod install)
echo
echo "Done. Opening Xcode. In Xcode: select the LSDKChat target > Signing & Capabilities > pick your Team, then press Run."
open ios/LSDKChat.xcworkspace

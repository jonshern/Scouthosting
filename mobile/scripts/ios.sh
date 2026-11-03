#!/usr/bin/env bash
# Build Compass and install it on your iPhone from this Mac. With a free Apple ID the copy lasts
# 7 days, then run this again; with the paid Apple Developer Program it lasts a year. See docs/ios.md.
# Same script as Waypoint's (jonshern/bluecard scripts/ios.sh); keep them in step.
#
#   mobile/scripts/ios.sh           build a standalone copy and install it on the iPhone (the usual one)
#   mobile/scripts/ios.sh dev       install a development copy that loads live code from this Mac
#   mobile/scripts/ios.sh check     only check that this Mac is ready, change nothing
#
# Environment (all optional):
#   APPLE_TEAM_ID            the signing team; found from your Apple Development certificate otherwise
#   IOS_DEVICE               the iPhone's name or UDID when more than one device is connected
#   COMPASS_IOS_BUNDLE_ID    a different bundle id, if Xcode says com.jonshern.compass is taken
#   COMPASS_IOS_PUSH=1       keep push notifications in the build (needs the paid team; a free Apple ID
#                            can't sign them, so they are left out otherwise)
set -euo pipefail
cd "$(dirname "$0")/../.."

mode=${1:-release}
case "$mode" in release | dev | check) ;; *) echo "Usage: mobile/scripts/ios.sh [dev|check]" >&2; exit 2 ;; esac

problems=0
ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FIX   %s\n' "$1"; problems=$((problems + 1)); }

echo "Checking this Mac"
if [ "$(uname -s)" != Darwin ]; then
  echo "This only runs on a Mac (Xcode builds the iPhone app)." >&2
  exit 1
fi

if xcodebuild -version >/dev/null 2>&1; then
  ok "$(xcodebuild -version | head -1)"
else
  bad "Xcode isn't installed or isn't selected. Install Xcode from the App Store, open it once, then run: sudo xcode-select -s /Applications/Xcode.app"
fi

if command -v pod >/dev/null 2>&1; then
  ok "CocoaPods $(pod --version)"
else
  bad "CocoaPods is missing. Run: brew install cocoapods"
fi

if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  ok "Node $(node --version)"
else
  bad "Node 20 or newer is needed. Run: brew install node@22"
fi

# The team is the 10-character OU on the "Apple Development" certificate Xcode makes for your Apple ID.
team=${APPLE_TEAM_ID:-}
if [ -z "$team" ]; then
  team=$(security find-certificate -a -c "Apple Development" -p 2>/dev/null |
    openssl x509 -noout -subject 2>/dev/null |
    sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p' | head -1 || true)
fi
if [ -n "$team" ]; then
  ok "Signing team $team"
else
  bad "No signing certificate yet. In Xcode: Settings > Accounts > + > Apple ID, sign in, then select your team > Manage Certificates > + > Apple Development."
fi

server=$(sed -n 's/^EXPO_PUBLIC_COMPASS_BASE_URL=\(.*\)$/\1/p' mobile/.env.local mobile/.env 2>/dev/null | head -1 || true)
if [ -n "$server" ]; then
  ok "Server built in: $server"
else
  printf '  note  No server built in. Set it on the phone later (Profile > Server, or on the sign-in screen),\n        or put EXPO_PUBLIC_COMPASS_BASE_URL=https://<mac>.<tailnet>.ts.net in mobile/.env.local first.\n'
fi

if [ "${COMPASS_IOS_PUSH:-}" = 1 ]; then
  ok "Push notifications on (needs a paid Apple Developer team)"
else
  export COMPASS_IOS_NO_PUSH=1
  echo "  note  Push notifications left out (a free Apple ID can't sign them). With the paid team: COMPASS_IOS_PUSH=1 mobile/scripts/ios.sh"
fi

if [ "$problems" -gt 0 ]; then
  echo
  echo "$problems thing(s) to fix first, then run mobile/scripts/ios.sh again."
  exit 1
fi
[ "$mode" = check ] && { echo; echo "Ready. Plug in the iPhone and run mobile/scripts/ios.sh"; exit 0; }

export APPLE_TEAM_ID="$team"

# Expo's iOS build breaks on a space anywhere in the path (like /Volumes/Crucial X9/...). Build
# from a copy in a space-free folder instead; node_modules there is kept between runs.
repo=$PWD
case "$repo" in
  *" "*)
    build=${COMPASS_IOS_BUILD_DIR:-$HOME/Library/Caches/compass-ios}
    case "$build" in *" "*) echo "COMPASS_IOS_BUILD_DIR can't contain a space: $build" >&2; exit 1 ;; esac
    echo "This checkout's path has a space, so building from a copy in $build"
    mkdir -p "$build"
    rsync -a --delete --exclude .git --exclude node_modules --exclude /.next --exclude /var --exclude /test-results --exclude /mobile/ios --exclude /mobile/android "$repo/" "$build/"
    cd "$build"
    ;;
esac

cd mobile
[ -d node_modules ] || npm ci

# ios/ is generated from app.json (and app.config.js), never edited by hand, so rebuild it each time.
npx expo prebuild --platform ios --clean

# expo run:ios builds with automatic signing but doesn't let Xcode make a provisioning profile.
# One xcodebuild with -allowProvisioningUpdates makes it (and registers the plugged-in iPhone);
# run:ios then reuses the profile and the build products.
config=Release
[ "$mode" = dev ] && config=Debug
workspaces=(ios/*.xcworkspace)
workspace=${workspaces[0]}
scheme=$(basename "$workspace" .xcworkspace)
echo
echo "Setting up signing for team $team (the first build takes 10 to 20 minutes; later ones are quicker)."
xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration "$config" -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM="$team" -quiet build

device=(--device)
[ -n "${IOS_DEVICE:-}" ] && device=(--device "$IOS_DEVICE")

echo
echo "Installing on the iPhone. Keep it plugged in and unlocked; it opens Compass when done."
echo "If it asks, tap Trust, and turn on Developer Mode (docs/ios.md)."
if [ "$mode" = dev ]; then
  # Debug build with the dev client; it loads code from the Metro server this starts on the Mac.
  npx expo run:ios "${device[@]}"
else
  # Release build: the JavaScript is inside the app, so it runs anywhere without the Mac.
  npx expo run:ios "${device[@]}" --configuration Release --no-bundler
fi

echo
echo "Installed. (If it didn't open by itself, the phone locked; open Compass from the home screen.)"
echo "With a free Apple ID this copy stops opening after 7 days (around $(date -v+7d '+%a %b %-d' 2>/dev/null || echo 'a week from now'));"
echo "run mobile/scripts/ios.sh again before then. Your sign-in and the saved copy stay on the phone when you reinstall."

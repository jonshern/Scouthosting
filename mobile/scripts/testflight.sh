#!/usr/bin/env bash
# Build the Compass app for the App Store and upload it to App Store Connect, where it shows up in
# TestFlight. Runs on the Mac with Xcode; needs the paid Apple Developer team. See docs/testflight.md (repo root).
# Same script as Waypoint's (bluecard scripts/testflight.sh) and Lantern's
# (emmett-scouting scripts/testflight.sh); keep them in step.
#
#   mobile/scripts/testflight.sh            archive, sign for the App Store and upload (the usual one)
#   mobile/scripts/testflight.sh archive    archive and export the .ipa only, upload nothing
#   mobile/scripts/testflight.sh check      only check that this Mac is ready, change nothing
#
# Environment:
#   APPLE_TEAM_ID            the paid team's 10-character id (required; Xcode > Settings > Accounts)
#   IOS_BUILD_NUMBER         the build number; defaults to the time in UTC, YYYYMMDDHHMM, so every
#                            upload is higher than the last without keeping a counter anywhere
#   COMPASS_IOS_BUNDLE_ID   a different bundle id (it must match the App Store Connect record)
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH
#                            an App Store Connect API key (.p8) to upload with, instead of the
#                            Apple ID signed in to Xcode. Optional.
set -euo pipefail
cd "$(dirname "$0")/../.."

app_name=Compass
app_dir=mobile
bundle=${COMPASS_IOS_BUNDLE_ID:-com.jonshern.compass}
build_cache=${COMPASS_IOS_BUILD_DIR:-$HOME/Library/Caches/compass-ios}
usage="Usage: mobile/scripts/testflight.sh [archive|check]"

mode=${1:-upload}
case "$mode" in upload | archive | check) ;; *) echo "$usage" >&2; exit 2 ;; esac

problems=0
ok() { printf '  ok    %s\n' "$1"; }
bad() { printf '  FIX   %s\n' "$1"; problems=$((problems + 1)); }

echo "Checking this Mac"
if [ "$(uname -s)" != Darwin ]; then
  echo "This only runs on a Mac (Xcode builds and uploads the iPhone app)." >&2
  exit 1
fi

if xcodebuild -version >/dev/null 2>&1; then
  ok "$(xcodebuild -version | head -1)"
else
  bad "Xcode isn't installed or isn't selected. Install Xcode, open it once, then run: sudo xcode-select -s /Applications/Xcode.app"
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

team=${APPLE_TEAM_ID:-}
if [[ "$team" =~ ^[A-Z0-9]{10}$ ]]; then
  ok "Team $team"
else
  bad "Set APPLE_TEAM_ID to the paid team's id (Xcode > Settings > Accounts > the team, or developer.apple.com > Membership). The free Personal Team can't upload."
fi

auth=()
if [ -n "${ASC_KEY_ID:-}${ASC_ISSUER_ID:-}${ASC_KEY_PATH:-}" ]; then
  if [ -n "${ASC_KEY_ID:-}" ] && [ -n "${ASC_ISSUER_ID:-}" ] && [ -f "${ASC_KEY_PATH:-}" ]; then
    auth=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
    ok "Uploading with App Store Connect API key $ASC_KEY_ID"
  else
    bad "ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH (an existing .p8 file) go together; set all three or none."
  fi
else
  ok "Uploading as the Apple ID signed in to Xcode (it needs the Admin or App Manager role)"
fi

build_number=${IOS_BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}
if [[ "$build_number" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]]; then
  version=$(node -p "require('./$app_dir/app.json').expo.version")
  ok "$app_name $version, build $build_number, bundle id $bundle"
else
  bad "IOS_BUILD_NUMBER must be digits (up to three parts, like 12 or 1.0.12): $build_number"
fi

if [ "$problems" -gt 0 ]; then
  echo
  echo "$problems thing(s) to fix first, then run this again."
  exit 1
fi
[ "$mode" = check ] && { echo; echo "Ready. Run: APPLE_TEAM_ID=$team mobile/scripts/testflight.sh"; exit 0; }

export APPLE_TEAM_ID="$team" IOS_BUILD_NUMBER="$build_number"
[ -n "${COMPASS_IOS_BUNDLE_ID:-}" ] && export COMPASS_IOS_BUNDLE_ID
# The paid team can sign push, and TestFlight and App Store copies talk to Apple's production push
# servers, so keep push in and sign it for production (app.config.js).
unset COMPASS_IOS_NO_PUSH
export COMPASS_IOS_PUSH_MODE=production

# Expo's iOS build breaks on a space anywhere in the path (like /Volumes/Crucial X9/...), so build
# from a copy in a space-free folder; node_modules there is kept between runs.
repo=$PWD
case "$repo" in
  *" "*)
    case "$build_cache" in *" "*) echo "The build folder can't contain a space: $build_cache" >&2; exit 1 ;; esac
    echo "This checkout's path has a space, so building from a copy in $build_cache"
    mkdir -p "$build_cache"
    rsync -a --delete --exclude .git --exclude node_modules --exclude "/$app_dir/ios" --exclude "/$app_dir/android" \
      --exclude "/$app_dir/build" --exclude /.next --exclude /var --exclude /test-results "$repo/" "$build_cache/"
    cd "$build_cache"
    ;;
esac

cd "$app_dir"
[ -d node_modules ] || npm ci

# ios/ is generated from app.json (and app.config.js), never edited by hand, so rebuild it each time.
npx expo prebuild --platform ios --clean

workspaces=(ios/*.xcworkspace)
workspace=${workspaces[0]}
scheme=$(basename "$workspace" .xcworkspace)
out=$PWD/build/testflight/$build_number
archive=$out/$app_name.xcarchive
mkdir -p "$out"

echo
echo "Archiving $app_name (Release, 10 to 20 minutes the first time)."
xcodebuild -workspace "$workspace" -scheme "$scheme" -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$archive" -allowProvisioningUpdates ${auth[@]+"${auth[@]}"} \
  DEVELOPMENT_TEAM="$team" CODE_SIGN_STYLE=Automatic -quiet archive

destination=upload
[ "$mode" = archive ] && destination=export
cat >"$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>$destination</string>
  <key>teamID</key><string>$team</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>testFlightInternalTestingOnly</key><false/>
</dict>
</plist>
PLIST

echo
if [ "$destination" = upload ]; then
  echo "Signing for the App Store and uploading to App Store Connect."
else
  echo "Signing for the App Store (no upload)."
fi
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$out" -exportOptionsPlist "$out/ExportOptions.plist" \
  -allowProvisioningUpdates ${auth[@]+"${auth[@]}"}

echo
if [ "$destination" = upload ]; then
  echo "Uploaded $app_name $version ($build_number). App Store Connect takes 5 to 30 minutes to process it;"
  echo "then it appears under TestFlight, and internal testers get it in the TestFlight app (docs/testflight.md)."
else
  echo "Built $out/$app_name.ipa. Upload it later with Transporter, or run mobile/scripts/testflight.sh."
fi

# The Compass app on TestFlight

TestFlight puts the Compass app on your iPhone (and any leader or parent you invite) from the TestFlight app, with no cable and no 7-day expiry. Each build lasts 90 days, and a new upload shows up on the phone by itself. It needs the paid Apple Developer team. The other two apps work the same way: Waypoint (bluecard `mobile/scripts/testflight.sh`) and Lantern (emmett-scouting `mobile/scripts/testflight.sh`).

## How it's built

Locally on the Mac with Xcode, no Expo cloud builds and nothing to pay for. `mobile/scripts/testflight.sh`:

1. checks the Mac (Xcode, CocoaPods, Node, `APPLE_TEAM_ID`),
2. regenerates `mobile/ios/` with `expo prebuild`, giving it a new build number (UTC time, `YYYYMMDDHHMM`, so each upload is higher than the last),
3. `xcodebuild archive` in Release,
4. `xcodebuild -exportArchive` with the `app-store-connect` method, which signs it with an Apple Distribution certificate and uploads it to App Store Connect.

Xcode makes the certificate, the App ID and the profile itself (`-allowProvisioningUpdates`), using the Apple ID signed in under **Xcode > Settings > Accounts**. That Apple ID needs the Account Holder, Admin or App Manager role, which yours has.

## Once, in App Store Connect

1. In Xcode: **Settings > Accounts**, check the paid team shows next to your Apple ID. Its 10-character team id is on https://developer.apple.com/account under **Membership details**.
2. https://appstoreconnect.apple.com > **Apps > + > New App**: platform iOS, name **Compass**, primary language English (U.S.), bundle id **com.jonshern.compass**, SKU `compass`, full access. If the bundle id isn't in the list yet, run `APPLE_TEAM_ID=<team> mobile/scripts/testflight.sh archive` once (it registers it), or add it at developer.apple.com > Identifiers.
3. If the name Compass is taken in the store (likely), use something like "Compass for Scout Units"; only the store name changes, the app on the phone still says Compass.
4. **Users and Access**: you're already a user. Add anyone else who should test as a user with the Developer or Marketing role (internal testers must be App Store Connect users, up to 100).

## Every upload

```bash
APPLE_TEAM_ID=<team> mobile/scripts/testflight.sh check   # what's missing, changes nothing
APPLE_TEAM_ID=<team> mobile/scripts/testflight.sh  # archive and upload (10 to 20 minutes)
```

Then in App Store Connect > the app > **TestFlight**: the build shows "Processing" for 5 to 30 minutes. The first time, create an **Internal Testing** group, add yourself (and other users), and turn on automatic distribution so later builds go out without clicks. Install the **TestFlight** app on the iPhone, sign in with the same Apple ID, and Compass appears there.

Push notifications are in TestFlight builds (the free-signed copy leaves them out) and signed for Apple's production push servers (`COMPASS_IOS_PUSH_MODE=production`, set by the script). The phone gets a push token; whether a push arrives depends on Compass's own push setup on the server.

Export compliance is answered in the app (`ITSAppUsesNonExemptEncryption` is false: Compass only uses HTTPS and Apple's own encryption), so TestFlight doesn't ask.

## People outside your team

External testers (other leaders and parents, by email or a public link) need a short Beta App Review the first time each version goes out, about a day. That review signs in to the app, so it needs a demo account on a server Apple can reach; the Mac behind Tailscale isn't. Until there is a public server, keep to internal testers.

## Good to know

- **The server.** TestFlight copies find the server like any other copy: Profile > Server (or the sign-in screen), or `EXPO_PUBLIC_COMPASS_BASE_URL` in `mobile/.env.local` when the build was made ([ios.md](ios.md)). With no connection it shows the last saved copy.
- **The bundle id is permanent once uploaded.** `com.jonshern.compass` is what TestFlight uses now. A company id later (`com.<company>.compass`) means a new App Store Connect record, and testers install the new app (only the sign-in and the saved copy are on the phone).
- **The version** (1.0.0) is `expo.version` in `mobile/app.json`. Raise it when a release goes to the App Store; build numbers take care of themselves.
- **Free-signed copy and TestFlight copy** have the same bundle id, so installing one replaces the other. Nothing is lost; sign in again if asked.
- **Uploading with an API key** instead of the Xcode sign-in: make one at App Store Connect > Users and Access > Integrations (App Manager role), then set `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH` (the .p8 file).
- **No upload, only the .ipa:** `scripts/testflight.sh archive`. It lands in `mobile/build/testflight/<build>/` (or under `~/Library/Caches/compass-ios/` when the checkout path has a space), and Apple's Transporter app can upload it.

## Troubleshooting

- **"No suitable application records were found"**: step 2 isn't done, or the record's bundle id differs from the build's.
- **"No Accounts" / "No signing certificate 'iOS Distribution' found"**: sign in under Xcode > Settings > Accounts with the Apple ID that is on the paid team; Xcode makes the certificate during the export.
- **"The bundle version must be higher than the previously uploaded version"**: you set `IOS_BUILD_NUMBER` by hand lower than the last one. Leave it unset.
- **"Invalid Swift Support" or an icon error**: rerun after `npm ci` in `mobile/`; the icon is `mobile/assets/icon.png`, 1024 by 1024 with no transparency, which Apple requires.

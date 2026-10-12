# Compass in the app stores

The phone app in `mobile/` is set up for store builds: name, icon, iOS
privacy manifest, photo permission text and EAS build profiles are in
`mobile/app.json` and `mobile/eas.json`. The family checklist for all
three apps (Compass, Waypoint, Lantern), with the accounts and fees,
the store listing text and the privacy answers, lives in the bluecard
repo at `docs/app-stores.md`.

What's specific to Compass:

- **Bundle id** `com.jonshern.compass` is a placeholder. Set
  `ios.bundleIdentifier` and `android.package` from the company domain
  before the first upload; it can't change after that.
- **Server for store builds**: set `EXPO_PUBLIC_COMPASS_BASE_URL` under
  `build.production.env` in `mobile/eas.json`. Without it the app
  defaults to `https://compass.app`. People can still point it at
  another server from the sign-in screen or Profile > Server.
- **Permissions**: photo library only (adding photos to an album) and
  notifications. Camera and microphone are turned off.
- **Account deletion**: Apple requires a way to start deleting your
  account from inside the app. Compass has no self-serve account
  deletion yet; it has to exist (on the website, linked from Profile)
  before App Store review.
- **Universal links** (`https://<domain>/...` opening the app) are off
  until there's a domain. Turning them on needs `ios.associatedDomains`
  and `android.intentFilters` in `app.json` plus the
  `apple-app-site-association` and `assetlinks.json` files served by
  Compass.

```bash
cd mobile
npx eas-cli login
npx eas-cli init                                          # once; writes extra.eas.projectId
npx eas-cli build --profile preview --platform ios        # install link for registered iPhones
npx eas-cli build --profile production --platform all     # store builds
npx eas-cli submit --platform ios --latest
npx eas-cli submit --platform android --latest
```

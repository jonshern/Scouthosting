# Compass on your phone, against the server on your Mac

The Compass phone app (`mobile/`) is for parents and leaders: upcoming
events with RSVP and sign-up slots, chat, photos and announcements. It
talks to Compass's `/api/v1` with a bearer token, the same way the
Waypoint and Lantern apps do, so it works against any Compass server:
your Mac today, the cloud later.

The phone reaches the Mac over Tailscale, so it works on home Wi-Fi,
cellular or anywhere else, and nothing is open to the internet.

```
iPhone (Tailscale on)  --https-->  jons-mac.tail1234.ts.net  --tailscale serve-->  localhost:3000 (Compass)
                       --http--->  100.x.y.z:8081 (Expo dev server, Expo Go only)
```

## Mac side

1. Install Tailscale from https://tailscale.com/download, open it and
   sign in. In the Tailscale admin console under DNS, turn on
   **MagicDNS** and **HTTPS Certificates**.
2. Start Compass on port 3000. `npm run dev` is best for the phone:
   development mode lets Expo Go sign in (its `exp://` return link is
   allowed only in development) and doesn't force two-step sign-in on
   the test account. `make deploy` (the blue-green switch, see
   [runbooks-mac.md](runbooks-mac.md)) works too, but only installed
   builds can sign in against it, and admins must turn on two-step
   sign-in first at `/account/security`.
3. Put it on the tailnet: `mobile/scripts/phone.sh`. It runs
   `tailscale serve --bg 3000`, writes the address to
   `mobile/.env.local` for app builds, and prints:

   ```
   Server      https://jons-mac.tail1234.ts.net  (tailnet only)
   Phone app   Profile > Server (or Server on the sign-in screen) > https://jons-mac.tail1234.ts.net, or open this link on the phone:
               compass://connect?url=https://jons-mac.tail1234.ts.net
   Sign in     scoutmaster@example.invalid / AdminPasswordTest123!
   ```

4. To run the app from this checkout in Expo Go:
   `mobile/scripts/phone.sh app`. It starts Expo's dev server on the
   Mac's Tailscale address (8081, or the next free port if Lantern or
   Waypoint has it).

`mobile/scripts/phone.sh off` stops serving. The Waypoint and Lantern
repos have the same script; any one of them serving port 3000 is enough
for all three apps.

## Phone side

1. Install **Tailscale** from the App Store, sign in with the same
   account as the Mac, and leave it connected.
2. Get the app on the phone:
   - **Expo Go (free, works today).** Install Expo Go, run
     `mobile/scripts/phone.sh app` on the Mac, then open the
     `exp://100.x.y.z:8081` link it prints (or scan its QR code with the
     Camera).
   - **Installed app (needs the Apple Developer Program).** From
     `mobile/`: `npx eas-cli build --profile preview --platform ios`.
     See "Build (EAS)" in [mobile/README.md](../mobile/README.md).
3. On the sign-in screen tap **Server**, enter
   `https://<your-mac>.<tailnet>.ts.net` and tap **Save address**; it
   checks `/health` and says "Connected". Once signed in, the same
   setting is under **Profile**.
4. Tap **Sign in**. Compass's sign-in page opens in an in-app browser;
   use `scoutmaster@example.invalid` / `AdminPasswordTest123!`, then tap
   **Continue**.

The token is kept in the phone's keychain. It lasts 90 days or until
the password changes; after that the app goes back to the sign-in
screen. **Sign out** on Profile ends the session on the server too.
Saving a different server address signs you out of the old one.

## How the app finds the server

- An address set on the phone (or by a `compass://connect?url=` link) wins.
- Otherwise `EXPO_PUBLIC_COMPASS_BASE_URL` from the build
  (`mobile/.env.local`, or the build profile in `mobile/eas.json`).
- Otherwise `https://compass.app`.

Every call goes to `<server>/api/v1/…` with
`Authorization: Bearer <token>`; sign-in opens
`<server>/auth/mobile/begin?redirect=<app link>/auth/callback`. Code:
`mobile/src/api/config.ts`, `mobile/src/api/serverUrl.ts` (unit-tested),
`mobile/src/components/ServerSection.tsx`.

## Troubleshooting

- **"Couldn't reach …"**: Tailscale is off on the phone or the Mac,
  Compass isn't up (`curl localhost:3000/health` on the Mac), or serve
  stopped (`tailscale serve status`).
- **Sign-in shows `bad_redirect`**: Expo Go returns to `exp://`, which
  Compass allows only with `npm run dev`. Use an installed build against
  a production-mode server.
- **Sign-in sends you to two-step setup**: production mode requires it
  for leaders and admins. Set it up with an authenticator app, or use
  `npm run dev`.
- **Plain http**: iPhones block `http://` to other machines in installed
  builds. Use the `https://…ts.net` name, not the `100.x` address.

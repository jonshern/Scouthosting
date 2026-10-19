# Google and Apple sign-in

"Continue with Google" and "Continue with Apple" are the first buttons on
Compass's sign-in, sign-up and `/start` pages, and so in Waypoint and
Lantern too: both apps and both websites sign in through Compass
(`/auth/mobile/begin`). A button only shows once its keys are set; with
none set the pages start at passkeys, as before.

How it behaves:

- A new Google or Apple account still confirms the person is an adult
  (`/account/confirm-adult`) before going on, and `/start` carries on to
  naming the unit and its 30-day trial.
- If a Compass account already has that email and the email was
  confirmed, Google or Apple is added to that account. If the email was
  never confirmed, sign-in stops with a message asking them to sign in
  with their password and confirm the email first, so nobody can take
  over an account by signing up with someone else's address.
- Leaders and admins who use an authenticator app or passkey are still
  asked for it after Google or Apple, and one with neither is sent to
  set one up, as with any sign-in. In production Google and Apple are
  how an admin without two-step signs in, since admin password sign-in
  is refused.
- On a unit's own site (`troop100.<apex>` or its custom domain) the
  buttons sign in on the main site and come back to the unit's pages
  under `/o/<slug>`.
- Each sign-in host gets its own return address
  (`<origin>/api/auth/callback/google` or `/apple`): the main site, every
  name in `PASSKEY_EXTRA_HOSTS` (the Mac's Tailscale name, any port) and
  the `WEB_SIGNIN_ORIGINS` websites (Waypoint's and Lantern's, which run
  Compass's sign-in pages on their own address). So the Mac's own
  browser at `localhost:3000`, a phone app over Tailscale and the
  Waypoint and Lantern websites all work, as long as each address is
  registered with Google or Apple below. It's `https` for every host but
  `localhost`.

Code: `src/lib/auth/providers.ts` (settings), `src/lib/auth/social-routes.ts`
(begin and callback), `src/components/auth/SocialSignIn.tsx` (buttons),
`src/lib/auth/social-signin.db.test.ts` (the whole flow against Postgres).

## Google (free)

1. Open https://console.cloud.google.com, signed in as the account that
   should own it. Create a project (top bar, "New project", e.g.
   "Compass sign-in"). No billing account is needed for sign-in.
2. **Google Auth Platform → Branding** (older consoles: "OAuth consent
   screen"): app name "Compass", support email, developer contact email.
   Audience: **External**. Leave it in **Testing** for now and add the
   Google accounts that should be able to sign in (yours, Emmett's
   parent accounts, testers) under **Audience → Test users**, up to 100.
   Publishing to everyone needs the real domain and a privacy policy
   page; do that at go-live. Only the basic `openid`, `email` and
   `profile` scopes are used, so Google's app review isn't needed.
3. **Clients → Create client**: type **Web application**, name "Compass".
   Under **Authorized redirect URIs** add one line per address Compass is
   reached at:
   - `http://localhost:3000/api/auth/callback/google` (the Mac's own browser)
   - `https://<mac>.<tailnet>.ts.net/api/auth/callback/google` (the phone apps over Tailscale)
   - `https://<mac>.<tailnet>.ts.net:8443/api/auth/callback/google` (Waypoint's website)
   - `https://<mac>.<tailnet>.ts.net:8444/api/auth/callback/google` (Lantern's website)
   - later, the same path on the real domain and on each website's domain
4. Copy the client ID and client secret into Compass's `.env`
   (`Scouthosting-main/.env` on the Mac):

   ```
   GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

   and `make deploy`. The buttons appear on the next start.

## Apple (needs the Apple Developer Program, $99/yr)

Sign in with Apple needs a paid Apple Developer account. Apple only
accepts `https` return addresses on a real name, so it works on the
Tailscale name and the cloud domain, not on `localhost`.

1. https://developer.apple.com/account → **Certificates, Identifiers &
   Profiles → Identifiers → +**:
   - **App ID** (type App), e.g. `app.compass` (or the app's bundle id),
     with **Sign in with Apple** ticked. This is the primary App ID.
   - **Services ID**, e.g. `app.compass.signin`. Open it, tick **Sign in
     with Apple → Configure**, pick the App ID above, and add:
     - Domains: `<mac>.<tailnet>.ts.net` (and later the real domain)
     - Return URLs: `https://<mac>.<tailnet>.ts.net/api/auth/callback/apple`,
       plus `:8443` and `:8444` for the Waypoint and Lantern websites
       (later the same path on the real domains)
2. **Keys → +**: name "Compass sign-in", tick **Sign in with Apple**,
   configure it with the same App ID, register, and download the `.p8`
   file (Apple lets you download it once). Note the **Key ID**.
3. Your **Team ID** is at the top right of the developer site
   (Membership details).
4. In `.env`:

   ```
   APPLE_CLIENT_ID=app.compass.signin        # the Services ID, not the App ID
   APPLE_TEAM_ID=ABCDE12345
   APPLE_KEY_ID=XYZ987WVU6
   APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
   ```

   The key is the `.p8` file's text on one line with `\n` for each line
   break. Then `make deploy`. Compass signs Apple's client secret from it
   at each start (good for 150 days; every deploy renews it).

`APPLE_APP_BUNDLE_ID` is only for a later native "Sign in with Apple"
button inside the iPhone apps; the apps don't need it today, they use
the web sign-in.

## Optional settings

- `GOOGLE_REDIRECT_URI` / `APPLE_REDIRECT_URI` pin one return address
  (served at `/api/auth/<provider>/callback`) for every host instead of
  one per host. Then sign-in only works on that one host, so the
  websites can't use Google or Apple. Leave them unset, on the Mac and
  in the cloud.
- In the cloud, check at go-live that the Waypoint and Lantern websites'
  Firebase Hosting rewrites hand Compass the website's own Host; if
  Compass sees its `run.app` name instead, Google returns to the wrong
  address and those websites' Google button fails with "didn't finish".
- `PASSKEY_EXTRA_HOSTS` also decides which extra names may run sign-in
  (see [runbooks-mac.md](runbooks-mac.md#passkeys-on-the-mac)).

## When it doesn't work

- **Google says `redirect_uri_mismatch`**: the address in the error isn't
  in the client's Authorized redirect URIs. Add it exactly (scheme, host,
  port, path).
- **Google says "access blocked, app is in testing"**: add that Google
  account under Test users.
- **Back at /login with "didn't finish"**: the sign-in took over five
  minutes, or it started on one address and came back on another (for
  example started at `localhost` with `GOOGLE_REDIRECT_URI` pinned to the
  Tailscale name). Unset the pinned value.
- **Apple shows "invalid_client"**: `APPLE_CLIENT_ID` must be the Services
  ID, and the Return URL must match exactly.

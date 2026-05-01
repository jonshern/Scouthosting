# Compass — mobile (parent app + team chat)

Scaffold for the Compass parent mobile app and the team chat
experience. Part of the Compass rebrand of Scouthosting.

> Source files are authored against the locked design system + the
> Compass JSON API. Most screens are wired to real endpoints; install
> + native build wiring (fonts, real photo uploads, EAS pipeline) is
> left as TODOs for the reviewer.

## Stack

- React Native via Expo SDK 51
- TypeScript (strict mode)
- React Navigation 6 (bottom tabs + native stack)
- react-native-svg for the compass-rose mark, photo placeholders, and
  the icon set
- expo-font for Newsreader (display) + Inter Tight (UI). System
  fallbacks render until fonts load.
- vitest for the design-token smoke test (no react-native runtime)

## Install + run

```bash
cd mobile
npm install
npx expo start
```

Press `i` for the iOS simulator or `a` for Android.

## Folder structure

```
mobile/
├── App.tsx                 # entry — fonts, safe area, navigation container
├── app.json                # Expo config (name "Compass", slug "compass")
├── babel.config.js         # babel-preset-expo + reanimated plugin
├── tsconfig.json           # extends expo/tsconfig.base, strict mode
├── package.json            # Expo SDK 51 + react-navigation + svg
├── src/
│   ├── theme/
│   │   ├── tokens.ts       # Forest & Ember palette + type + spacing
│   │   └── atoms.tsx       # CompassMark, Wordmark, Avatar, Chip, Photo, Icon
│   ├── components/
│   │   ├── TwoDeepBanner.tsx
│   │   ├── EventCard.tsx
│   │   ├── ChannelRow.tsx
│   │   ├── MessageBubble.tsx
│   │   └── PollCard.tsx
│   ├── navigation/
│   │   ├── RootNavigator.tsx   # 5 bottom tabs + per-tab native stacks
│   │   └── types.ts            # type-safe param lists
│   └── screens/
│       ├── HomeScreen.tsx              # high
│       ├── CalendarScreen.tsx          # high
│       ├── EventDetailScreen.tsx       # high
│       ├── PaymentScreen.tsx           # medium
│       ├── MessagesScreen.tsx          # legacy (medium)
│       ├── PhotosScreen.tsx            # medium
│       ├── PhotoPermissionsScreen.tsx  # medium
│       ├── ProfileScreen.tsx           # light
│       └── chat/
│           ├── ChannelsListScreen.tsx     # high
│           ├── ThreadScreen.tsx           # high
│           ├── EventChannelScreen.tsx     # medium
│           ├── PollScreen.tsx             # medium
│           └── LeaderOversightScreen.tsx  # medium
├── tests/
│   ├── smoke.test.ts       # asserts mobile palette == design/tokens.js bold
│   └── tsconfig.json       # local tsconfig for test files
└── vitest.config.ts        # rooted at mobile/, no react-native runtime
```

## Fidelity matrix

| Screen                         | Fidelity | Notes |
|--------------------------------|----------|-------|
| HomeScreen                     | High     | Greeting + signature italic accent treatment + next-up event card + quick actions + activity feed; wired to /api/v1/orgs/:orgId/dashboard. |
| CalendarScreen                 | High     | Filter pills, month grouping, color-coded date blocks per event type. |
| EventDetailScreen              | High     | Hero, key facts, RSVP toggle (yes/maybe/no) wired to /api/v1/events/:id with optimistic counts. |
| chat/ChannelsListScreen        | High     | Grouped channels (Your / Event / Leader-only), unread badges, two-deep markers. |
| chat/ThreadScreen              | High     | Persistent green TWO-DEEP banner, raspberry leader names + role badges, reactions, pinned message. Hero uses signature italic + accent-fill. |
| MessagesScreen (legacy)        | Medium   | Kept for migration only — ChannelsListScreen replaces it. |
| PhotosScreen                   | Medium   | Album sections with up to 6 thumbnails each, wired to /api/v1/orgs/:orgId/photos. |
| PhotoPermissionsScreen         | Medium   | Per-scout privacy toggles; client-side only. |
| chat/EventChannelScreen        | Medium   | Embedded event card with RSVP tally, drivers ask, RSVP toast, read receipts. |
| chat/PollScreen                | Medium   | Embedded poll card with horizontal-fill bars and voted state. |
| chat/LeaderOversightScreen     | Medium   | Stats, moderation tools, YPT compliance callout. |
| ProfileScreen                  | Light    | Settings list + sign-out; placeholder for the auth integration. |

## Design system parity

- `src/theme/tokens.ts` mirrors the `bold` palette from
  `design/source/tokens.js` (Forest & Ember). The smoke test enforces
  this 1:1.
- The signature italic + chartreuse accent-fill display treatment
  appears on `HomeScreen` (greeting), `ThreadScreen` (hero line),
  `EventDetailScreen` (hero), and `PhotoPermissionsScreen` (headline).
- No emojis are baked into the codebase. Mock content from the design
  reference (e.g. emoji glyphs in chat) is rendered via short text
  glyphs ("HP", "T12", etc.) inside icon blocks.

## Run the tokens smoke test

From the worktree root:

```bash
npx vitest run mobile/tests/ --config mobile/vitest.config.ts
```

The test reads `design/source/tokens.js` (the canonical reference) and
`mobile/src/theme/tokens.ts` (the mobile mirror) without loading
react-native and asserts every Forest & Ember palette value matches.
There are 29 assertions covering name, base palette, and full
secondary spectrum.

## TODOs for backend wiring

- **Auth** — Google + Apple SSO ship today. WebAuthn passkey
  enrollment + Microsoft SSO are still TODO.
- **Push notifications** — registration on launch ships today via
  expo-notifications. The remaining work is real-device verification
  + receipt badging on the icon.
- **Photos** — uploads from device (camera / picker) still TODO; the
  album viewer is wired against `/api/v1/orgs/:orgId/photos`.
- **Realtime chat** — channel + thread + RSVP / poll tallies are
  wired to the JSON API and the SSE stream.
- **YPT enforcement** — the green TWO-DEEP banner and the leader
  oversight screen reflect server-side state. The actual
  `channel.scope === 'patrol' && channel.youthCount > 0 &&
  channel.yptCurrentAdultCount < 2 → suspend` guard is server-side and
  not modeled here.
- **Channel auto-creation** — one per den/patrol, one per pack/troop,
  one parents-only, one leader-only, one per published event with
  auto-archive. Listing here assumes the server feeds the data.
- **Fonts** — wire Newsreader + Inter Tight asset bundle to expo-font
  (currently configured but not yet bundling files).
- **Deep links** — `compass://event/:id`, `compass://channel/:id`,
  `compass://photo/:id`. Linking config not yet added.

# Open bugs / UX issues

Working list — Claude appends here as Jon finds things in staging.
When we sit down to fix, we'll prioritize and close in batches.
Promote anything sufficiently scoped to a real PR/branch and check it
off here with the commit SHA.

| Format: severity / area / one-line description / where it lives. Add
| repro steps, screenshot path, or DevTools paste under the bullet if
| useful. Strike through (`~~text~~`) when fixed; don't delete history.

---

## P1 — broken or actively confusing

### ~~Album photo upload returns "CSRF token missing"~~
- ~~Repro: as admin, go to `/admin/albums/<id>/photos`, choose a file,
  click Upload → response body is `CSRF token missing.` (HTTP 403).~~
- **Fixed (session 2026-05-03)**: added an admin-wide capture-phase
  submit listener in the `layout()` shell (`server/admin.js`) that
  intercepts any `enctype=multipart/form-data` form, sends it via
  `fetch()` with `X-CSRF-Token` set from the hidden `csrf` input,
  and follows the response's redirect. csrfProtect already accepted
  the header path (`lib/csrf.js:58`), so no server change needed.
  Native form submit is left alone for urlencoded forms.
- Bonus: every existing multipart admin form (album photos, post
  photos, form/document uploads, reimbursement receipts, org logo,
  roster CSV import) is covered without per-form changes.

### Preview destroys unsaved form state
- Reported by Jon, session 2026-05-03. Specific page TBD — Jon's
  screenshot was Custom pages, but that view has no preview button so
  it was likely Email broadcast / Announcement composer / Newsletter
  editor. Need confirmation on which form.
- Symptom: open a composer, type a draft body, click Preview to see
  what it'll look like, hit Back to return to the composer — body
  field is empty, you have to retype.
- Root cause likely: Preview is a separate POST/GET route that
  navigates away from the form instead of opening in a modal /
  new tab / using `history.pushState` and rehydrating on back.
- Fix options:
  - **Best**: open Preview in a new tab (`target="_blank"`) so the
    form stays mounted untouched.
  - **OK**: stash the draft in `sessionStorage` on submit-to-preview,
    rehydrate on form mount.
  - **Server-side fallback**: make Preview a POST that re-renders the
    composer with the typed values pre-filled below the preview.

### Site editor — build a "really nice" one (THE product investment)
- **Product statement (Jon, session 2026-05-03):** "I do really want
  something nice, that someone could design a really nice home page."
  This isn't a bug fix. It's the headline differentiator. A volunteer
  scoutmaster who produces a beautiful site in 30 minutes will choose
  Compass over the status quo (Scoutbook page, Wix, hand-coded HTML).
- **Quality bar**: Squarespace/Webflow-class — looks polished by
  default, can't be broken by a non-designer, ships with smart
  starter content, has live preview, drag-and-drop blocks.
- **Concrete plan, in order of investment:**
  1. **Tiptap as the block editor foundation** (~1 week)
     - Rich-text + custom node extensions for our domain blocks
       (hero, image, gallery, calendar, posts, contact, CTA).
     - Editor surface styled with `tokens.css` + `demo/styles.css` so
       what-you-type-is-what-renders for in-block content.
     - JSON output → store in existing `Page.customBlocks` /
       new `CustomPage.blocks` columns. Migration: add `blocks Json?`
       to CustomPage, keep `body` as fallback.
  2. **Unified site editor page** (~1 week)
     - Replace `/admin/content` and `/admin/pages` with a single
       `/admin/site` view: left rail = pages list (homepage at top,
       custom pages below, "+ New page" at bottom), center = block
       editor for the selected page, right rail = settings panel
       (slug, visibility, in-nav toggle, SEO meta).
     - Drag to reorder pages in the rail.
  3. **Menus as a first-class concept** (~2 days)
     - New `OrgMenu` model — array of `{label, target}` items where
       `target` is `{type:"page", id}` or `{type:"url", href}` or
       `{type:"builtin", key}` (calendar, photos, etc. for units that
       still want those at the top).
     - Defaults: a starter menu derived from the page list. Admin can
       diverge from there.
     - Render this in `server/template/site.html` instead of the
       current hardcoded link list.
  4. **Live preview pane** (~3 days)
     - Right-side iframe pointed at `/admin/preview/<page-id>` that
       renders the public page from a draft snapshot.
     - Editor debounces save-to-draft on every keystroke (500ms);
       iframe re-renders the changed block via postMessage.
     - "Publish" button promotes draft → live. Adds a `Page.draftBlocks`
       column to keep public render unaffected during editing.
  5. **Curated block templates** (~1 week, ongoing)
     - Don't ask the scoutmaster to design a hero. Give them 4 hero
       variants (image-bg-overlay, split-photo-text, video-bg, plain-
       headline). Same for about, gallery, contact, CTA blocks.
     - "+ Add block" opens a chooser showing a thumbnail of each
       variant. Pick → drops in a fully-styled block ready to fill in.
  6. **Smart defaults / starter site** (~2 days)
     - When a new org signs up, seed a Troop 567-shaped site:
       homepage with hero + about + events + gallery + contact;
       starter pages "Forms & Documents", "Our Leaders" prefilled
       with placeholder text the admin replaces.
     - The first 60 seconds in admin should be "wow, this already
       looks like a real site," not "stare at empty fields."
- **Total**: ~3-4 weeks of focused FE work, in roughly that order.
  Each step ships independently and improves the product before the
  next one starts. Step 1 alone makes block editing feel modern.
- **Reprioritization** (Jon, session 2026-05-03): "We can just have
  some default templates, and then they can go nuts." This shifts
  the weight away from editor sophistication toward **template
  curation**. A scoutmaster who picks "Outdoor Adventure Troop"
  template and gets a beautiful site in 30 seconds is the goal —
  the editor is the escape hatch for the 20% who want to customize
  beyond the defaults.
  - **Revised priority order**:
    1. **Template library** (~1 week, design-heavy not code-heavy):
       3-5 starter templates ("Adventure Troop", "Family Pack",
       "Service-focused Troop", "Girl Scout Troop", "Crew/Venturing").
       Each is a fully-designed homepage + 2-3 starter pages with
       placeholder photos, copy, and structure. Stored as JSON in
       `prisma/seed.js` or a `lib/templates/` module.
    2. **Template picker on signup** — first-run UX: pick a template
       → instantiated for your org → land in admin already populated.
       (~1 day after templates exist.)
    3. **Tiptap as the in-block editor** (per original plan #1).
       Lighter scope now — just rich text editing within the
       pre-shaped template blocks, not freeform composition.
    4. **GrapesJS as the structural editor** (optional, for power
       users who want to add/remove blocks beyond what the template
       includes). Could be deferred indefinitely if templates are
       good enough that 90% of admins never need it.
    5. Menus + unified pages list (per #2/#3 above) still apply.
  - **Implication**: the "really nice" investment is mostly in
    *design + content writing for templates*, not in editor code.
    Could be done with a part-time designer in 2-3 weeks of design
    + 1 week of code wiring, no FE epic required.
- **Live data blocks** (Jon, session 2026-05-03): "Can we add our own
  feeds in here, a photo feed, a calendar." Yes — and these are the
  highest-value block type because the content stays current
  automatically. Admin places once; new events/photos surface in
  perpetuity without re-editing the page.
  - **Catalog of live blocks to ship in the palette:**
    - **Upcoming events** — pulls from `Event` table for `req.org.id`,
      filtered by future startsAt + recurrence, configurable limit
      (3/5/10) and layout (compact list / cards / monthly grid).
    - **Photo feed** — pulls from `Photo` table joined to `Album`,
      configurable to "latest album" or "all public photos" or
      "specific album by slug." Layout variants: masonry, carousel,
      hero-collage, single feature.
    - **Latest posts** — pulls from `Post` table, configurable count
      and category filter. Supports both compact (title + date) and
      excerpt (title + preview + cover image) layouts.
    - **Announcements** — same shape as posts but pinned/unexpired
      filter applied. Useful for the homepage hero strip.
    - **Calendar embed** — full FullCalendar grid scoped to org, or
      an "upcoming month" mini-calendar variant. Same data as the
      upcoming-events block but visualized differently.
    - **Member directory** — gated (members-only visibility) list of
      adults / leaders. Useful as a "Meet our leaders" section. Auto-
      respects `Member.directoryVisibility` per row.
    - **Forms list** — pulls from `Form` table, filtered to public
      visibility. Useful for the "Forms & Documents" page.
    - **Contact card** — pulls from `Org` (charter, council, district,
      meeting day/time, scoutmaster name, contact email).
    - **Trip plan** — pulls a specific upcoming trip with its meals/
      gear/sign-up slots. Useful for "Sign up for the spring camporee"
      hero on the homepage during sign-up windows.
    - **Sign-up CTA** — pulls a specific event RSVP form for inline
      signup without leaving the page.
  - **Implementation pattern** (whichever editor we pick):
    - Each live block is a node type with a small config object:
      `{type: "events", config: {limit: 5, layout: "cards"}}`.
    - In the editor canvas, render a styled placeholder with a few
      sample rows fetched from the current org's data so the admin
      sees what it'll look like.
    - On server render (`server/render.js`), walk the block tree;
      for each `type: "events"` (etc.), call the corresponding
      renderer function that queries the DB and returns HTML.
    - Renderer functions go in `lib/blocks/` — one per block type,
      each takes `(orgId, config)` and returns `{ html, deps }` where
      `deps` is a list of CSS classes / scripts the block needs.
  - **Why this is essentially free given the existing data layer**:
    every one of these queries already exists somewhere in the
    codebase — render.js, admin.js, or api.js — they just need to
    be extracted into reusable block renderers.
  - **Bonus**: third-party feed embeds (YouTube channel, Instagram
    feed, Facebook events, ical URL) as a separate "Embed" block
    family. Less essential than native feeds but covers the troop
    that already has a Facebook page they don't want to abandon.
- **Don't do**: Squarespace-style "drag pixels anywhere" canvas. Keep
  the design constrained — that's how it stays nice without a
  designer in the loop.
- **Library / integration choices** (already discussed):
  - **Tiptap** for editor (Level 1 from the build-vs-buy convo —
    embedded library, not a headless CMS, not a full page builder).
  - **Don't** pull in Strapi/Directus/Sanity (Level 3) — wrong shape,
    fights multi-tenancy, replaces things we already do well.
  - **Don't** pull in GrapesJS/Webstudio (Level 2) — gives up design
    discipline, harder to wire live data blocks.
- **Live preview**: cheap pattern first (editor styled to match
  output), full iframe pattern (#4 above) once the rest is in place.

### Site editor model is wrong shape for "scoutmaster designs a great homepage"
- **Goal**: a non-designer scoutmaster sits down once and produces a
  site like Troop 567 New Hope — a hero photo + a few prose sections
  + a small custom nav (Photo Gallery, Forms & Documents, Our Adult
  Leaders, Resource Links), each leading to an authored content page.
- **What we have today is the right ingredients in the wrong shape:**
  - Homepage editor at `/admin/content` (long scrolling form, hero/
    about/join/contact text + custom blocks + section order + theme
    + logo all stacked vertically).
  - Custom pages at `/admin/pages` (separate screen, one-by-one).
  - Built-in features (calendar/posts/chat/photos/forms/directory)
    are *forced top-level nav items*, not optional blocks.
  - Nav is auto-derived: hardcoded built-ins + custom-page `showInNav`
    toggle. No unified "what's in my site, what's in my nav" surface.
- **What a scoutmaster actually needs (Squarespace/Wix model):**
  - One unified site-editor view: list every page in the site
    (homepage + custom pages) with a block-based editor for each.
  - Nav = "which pages are in the nav" with drag-reorder. Built-ins
    are *optional blocks you drop into pages*, not nav fixtures.
  - Defaults that produce a Troop 567-shaped site out of the box:
    homepage with hero + about + events block + photo block + contact;
    a couple of starter custom pages (Forms, Leaders) prefilled with
    placeholder content the admin replaces.
- **Why this is bigger than "add navVisibility":** the data layer
  *can* support this (`Page.customBlocks`, `CustomPage`, etc. are
  flexible enough), but the admin UX assumes "you edit *the* homepage
  + you edit *separate* pages on a different screen + the nav happens
  to you." A real site editor inverts this: pages are first-class
  citizens of equal weight, the nav is a thin projection of them, and
  features are blocks not destinations.
- **Effort**:
  - **Small step**: the original "hide standard nav items" idea
    (`Page.navVisibility` JSON map + checkboxes) — 30 min, gets the
    Troop 567 shape on the surface but doesn't fix the model.
  - **Medium step**: add `Page.navOrder` and let admins reorder the
    full nav (built-ins + custom pages mixed) — half day.
  - **Real fix**: redesign `/admin/site` as a unified page-list +
    block-editor, demote built-ins from nav fixtures to blocks,
    seed sensible defaults. Multi-day FE work but matches the
    page-builder.html prototype's intent.
- **Real-world reference**: Troop 567 New Hope's existing site has a
  4-item nav — *Photo Gallery · Forms & Documents · Our Adult Leaders ·
  Resource Links*. **Each is a content page the admin authored**, not
  a link to a built-in feature. Their calendar/gallery/etc. are
  embedded as content blocks inside those pages (or not surfaced).
- **Comparable model worth copying**: WordPress Gutenberg + the
  Appearance → Menus screen + the Pages list. Three primitives that
  cleanly compose:
  - **Pages list** — every page in the site (incl. the homepage),
    same shape, same block editor.
  - **Block editor** — drag-and-drop blocks with a small fixed
    palette (text, image, gallery, embed, button, columns, "live"
    blocks like upcoming-events / photo-album / form-list / chat-link).
  - **Menus** — pick which pages are in the nav, in what order, with
    optional rename. Decoupled from page existence (you can have a
    page that isn't in the nav, and a nav item that links elsewhere).
  - That's the trio we'd port. We already have pages and blocks; the
    "menus" piece + the unified editor surface are what's missing.
- The 8 standard top-nav items on the public unit site are hardcoded
  in `server/template/site.html:37-48`: About, Calendar, Posts, Chat,
  Photos, Forms, Directory, Contact. Plus auto-injected custom pages
  at `{{NAV_CUSTOM}}` and Sign in/out at `{{NAV_AUTH}}`.
- A unit that doesn't use Chat, doesn't expose a public Directory, or
  doesn't accept Forms still sees those links — they go to empty/
  permission-denied pages. There's no admin control to hide them.
- **Real-world reference**: Troop 567 New Hope's existing site has a
  4-item nav — *Photo Gallery · Forms & Documents · Our Adult Leaders ·
  Resource Links*. **Each of those is a content page the admin
  authored, not a link to a built-in feature.** Their nav is pure
  custom-page list; the calendar/gallery/forms primitives live
  *inside* those pages (or aren't surfaced at all).
- That's a deeper shift than "hide some standard items." The current
  model is *standard built-ins + appended custom pages*; the unit
  model in the wild is *just custom pages, period* — and the built-in
  features (calendar, posts, chat, photo gallery) are either embedded
  as blocks into a page or surfaced as in-page CTAs. We're forcing
  the wrong shape.
- **The pattern already exists in the codebase, just not extended:**
  - `CustomPage.showInNav` (schema.prisma:926) — admin toggles whether
    a custom page appears in the nav. Wired in `server/render.js:2760`
    to filter pages before injecting into `{{NAV_CUSTOM}}`.
  - `Page.sectionVisibility` JSON map (used at admin.js:230 and the
    section-order admin) — admin toggles which homepage sections show.
- **Simplest extension** (mirrors `sectionVisibility`): add
  `Page.navVisibility Json?` — map of nav-key → boolean (default true).
  Render the standard `<a>` tags conditionally based on the map.
  Admin UI: a small "Top nav" panel under Site → Section order with
  one checkbox per standard item. Reorder/rename are bigger asks but
  follow the same shape (`navOrder`, `navLabels`).
- Effort: ~30 min for hide-only, ~2 hr for hide+reorder+rename with
  a clean drag UI mirroring the section planner.
- Worth pairing with a "starter nav presets" idea: when a new unit is
  created, default to a 4-item nav (e.g. Calendar / Photos / Forms /
  Contact) and let admins add/remove from there. That matches the
  Troop 567 pattern without forcing every unit to manually trim.

### ~~Email broadcast post-send page is uninformative~~
- ~~After sending a broadcast at `/admin/email`, the success page shows
  only the headline "Sent", the counts ("Email: 4 · SMS: 0"), and two
  buttons.~~
- **Fixed (session 2026-05-03)**: post-send page now shows audience
  label, channel breakdown, full subject + body, expandable recipient
  list (name / email-or-phone / channel tag), and an expandable error
  panel only when there were failures. Send another / View history
  buttons preserved.

### Site builder redesign — functional CMS is shipped, visual reskin is not
- **Correction to earlier entry.** The CMS itself *is* implemented and
  live at `/admin/content` — not just text fields. Below the hero/
  about form there are working sections for:
  - **Custom blocks** (`server/admin.js:1511-1522`) — Squarespace-style
    drop-in text / image / CTA cards. Stored in `Page.customBlocks`
    JSON column. Migration: `prisma/migrations/20260502000000_page_custom_blocks`.
  - **Section order & visibility** (`server/admin.js:1524-1584`) —
    drag-and-drop reordering of homepage sections + per-section show
    /hide. Stored in `Page.sectionOrder` + `Page.sectionVisibility`.
    Migration: `20260501050000_page_cms_extensions`.
  - **Testimonials**, **Theme** (color pickers), **Logo** upload all
    further down on the same page.
- What's *not* done: the visual reskin into the 4-step wizard layout
  shown in the `admin/page-builder.html` prototype (left rail of steps,
  centered card, live preview pane, AI-assist copy hints). Today
  everything is one long vertical-scroll form with section headings.
- Decision needed: invest in the wizard chrome (significant FE work +
  state across steps + draft/publish split + live preview) vs. polish
  the existing scrolling form (cheap, keeps current data model intact).
- Either way, the data layer is fine — no schema changes needed.
- Ref: long discussion in session 2026-05-03.

### My DMs page has no way to actually send a DM
- `/admin/dm/sent` (admin.js:4933) shows an empty state with the copy
  *"Send your first DM from Members or Leads"* — but Members lands you
  on a 200+ row roster with no visible DM action. Real path is
  Roster → click person → Edit → Message tab. Three clicks deep, no
  signposting.
- Fix: add an inline composer (To: autocomplete + body + send) at the
  top of the My DMs view. Re-uses existing
  `POST /admin/members/:id/message` (admin.js:4863).

### Girl Scout demo tenant has no demo content
- `gstroop100.scoutingcompass.com` renders the unit-page template with
  *"Nothing on the calendar yet"* / *"No albums yet"* / no announcements.
- `prisma/seed.js` only seeds 6 levels + 7 girls + 5 demo logins for
  the GS unit; the BSA Troop and Pack get the full content treatment.
- Fix: give gstroop100 the same fake events/posts/albums in the seed
  so visitors see what a populated GS site looks like.

---

## P2 — small but visible

### Calendar admin: subscribe-URL box is misplaced and uses old palette
- `/admin/events` (or wherever the calendar admin renders). The
  subscribe-URL callout (cream/yellow box with "https://troop100.…/calendar.ics"
  + Copy button) sits between the "Members can subscribe…" heading
  and the FullCalendar grid.
- Two issues:
  - **Position**: it should live at the bottom of the page (or under
    the calendar grid), not above it. The grid is the primary content;
    the subscribe URL is a secondary action.
  - **Color**: the cream/yellow accent + tan border are from the old
    palette and clash with the rest of the admin (dark green primary,
    gold accent, neutral surfaces). Should use the current token set
    (`--surface`, `--ink`, `--accent`).

### "Choose Files" sits inline with descriptive label text (album upload)
- `/admin/albums/<id>/photos` — the "Choose Files" native button is
  rendered immediately after the inline label *"Choose images (JPEG,
  PNG, WebP, HEIC; up to 10 MB each, 20 at a time)"* on the same line,
  followed by the chosen filename. Visually cramped — looks like the
  filename is part of the label.
- Source: `server/admin.js:2265-2267` — the `<label>` wraps the
  descriptive text + the `<input type="file">` on one line.
- Fix: separate the label text and the input onto two lines. Either
  put the input in its own `<div>` below the label text, or apply
  `display:block` to the input and add margin-top.

### Custom pages "Create" button cramped against Visibility dropdown
- `/admin/pages` (admin.js:7551). The button sat directly under the
  Visibility row with no spacing.
- ~~Fixed: added margin-bottom on the row + margin-top on button +
  align-items:flex-end so the checkbox label aligns with the select.~~
  Deployed in session 2026-05-03 (verify on next page reload).

---

## P3 — under the hood, no user-visible symptom yet

### `pg-boss is not a constructor` on boot
- Logged at `fly logs -a compass-staging`:
  `{"level":"warn","ns":"http","msg":"jobs runtime failed to start; falling back to in-process","err":"PgBoss is not a constructor"}`
- Falls back to in-process so user-facing flows work. But the queue
  isn't running — anything that *relies* on background processing
  (retries, scheduled email send, future DM-reminder cron once it
  gets enqueued) silently runs in the request thread or not at all.
- Likely cause: `lib/jobs.js` import shape vs. the `pg-boss` package's
  default-vs-named export. Worth a 10-minute look.

### e2e static-asset test only checks HTTP 200, not content
- `scripts/e2e-demo.test.mjs:81` walks every root `*.html / *.css / *.js`
  and asserts `status === 200`. It would *not* catch the regression
  we just fixed (commit 396f78a routing tenant `/styles.css` to apex
  marketing CSS — wrong file, still 200).
- Fix: add a per-host content assertion. e.g. fetch
  `troop100.localhost:5050/styles.css`, assert presence of `.topbar`
  rules; fetch `localhost:5050/styles.css`, assert *absence*.

### CLAUDE.md trap #2 is now stale
- The "single-host customDomain hack" entry (admin SSO bypass + the
  customDomain'd-apex pattern) was the workaround for not having
  wildcard DNS on `*.compass-staging.fly.dev`. We now have
  `*.scoutingcompass.com` so the hack is no longer needed in
  staging. The text should be marked historical or trimmed, with a
  pointer to the proper subdomain setup in `TESTING.md`.

### CLAUDE.md open-follow-ups list is partially stale
- "Persistent uploads on Fly" (trap #9 / open follow-up) is now done
  via the `compass_uploads` volume mounted at `/data` (`fly.toml:28-30`,
  `UPLOAD_ROOT=/data/uploads`). Update the doc to reflect that, and
  note the single-machine constraint (volumes don't span machines —
  scaling past 1 needs per-machine volumes or object storage).

---

## How to add a bug

Stick a bullet under the right severity bucket with:
1. **What's wrong** — one line, what the user actually sees
2. **Where in code** — file path + line number if known
3. **Repro / context** — steps, URL, screenshot path if helpful
4. **Suggested fix** — only if obvious; otherwise leave blank

Don't worry about formatting consistency. Optimization is a later pass.

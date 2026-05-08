# Handoff: Compass — Scout Host CMS

## Overview

Compass is a CMS and unit-management tool for Scouts BSA troops, packs, crews, and ships. This bundle contains a hi‑fi clickable HTML prototype covering the major admin surfaces:

- **Site editor** — the public-facing troop website (hero + content blocks), with both a *Simple* form-driven mode and an *Advanced* canvas/inspector mode
- **Pages** — a list of public pages with status, slug, last-updated, view counts, in-nav toggle
- **Media** — upload + album library (grid view)
- **Calendar → Events** — list and modern month-grid views, color-coded event types, event drawer
- **Calendar → Locations** — card grid + table of recurring event locations (meeting hall, campgrounds, etc.) with drawer
- **Roster** — Scouts, Adults, Merit Badge Counselors, Patrols, Pending invites — sortable/filterable data grid + member drawer with advancement, parents, medical, training, and a "link existing adult" picker on new-scout registration so siblings share the same parent record
- **Security** — admin permissions
- **Settings** — brand, theme, navigation
- **Publish modal** — diff of pending changes

The shell models the real Compass admin chrome: a public-site bar on top (showing the troop's actual public nav), a Compass admin bar below it (Overview, Calendar, Roster, Messages, Photos, Forms, Money on the left; Site, Pages, Security, Domain on the right), and an action bar (breadcrumbs + Preview + Publish) only on edit screens.

## About the Design Files

**The files in this bundle are design references created in HTML** — a clickable prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the target codebase's existing environment** (most likely React + a real CSS framework or component library, or whatever else the team uses) following its established patterns. The HTML uses inline Babel-transpiled JSX with global `window` exports across files purely so the prototype runs in a single static page; the real implementation should use proper module imports, a build pipeline, and real state management (React Query, Zustand, Redux Toolkit, etc.).

If no environment exists yet, React + Vite + TypeScript + Tailwind (or CSS Modules) is a sensible default for this product.

## Fidelity

**Hi‑fi.** Colors, typography, spacing, component styles, micro-interactions, and copy are all final. Recreate pixel-fidelity using the codebase's component primitives (e.g. shadcn/ui `Table`, `Dialog`, `Tabs`, `Drawer`, `Select`, etc.). The visual identity is editorial/serif-led, not the typical "SaaS dashboard" aesthetic — preserve the serif headings, italic eyebrows, dashed dividers, generous whitespace, and the particular muted color palette.

## Visual Language

The aesthetic is **editorial admin** — closer to a magazine CMS than a generic dashboard. Key choices:

- **Source Serif 4** for all headings, eyebrows, italic labels, member names, and most data-grid cells
- **Inter Tight** for UI chrome, buttons, form inputs
- **JetBrains Mono** for IDs, slugs, dates, phone numbers, and any technical/identifier value
- **Italic serif eyebrows** — `§ Roster`, `§ Site`, `§ Calendar` mark each page header
- **Dashed dividers** (`1px dashed var(--line)`) instead of solid rules for KV pairs, list rows, advancement requirements
- **Warm off-white background** (`#f6f5f1`), white cards, subtle taupe lines (`#e6e3da`)
- **Single deep-navy accent** (`#1d3a8a`) — used sparingly for primary buttons, active tabs, accent strips

## Design Tokens

```css
/* Surfaces */
--bg:        #f6f5f1;   /* page background — warm off-white */
--bg-2:      #efece4;   /* recessed/inset background */
--surface:   #ffffff;   /* cards, drawers, modals */

/* Ink */
--ink:       #14171c;   /* primary text */
--ink-2:     #2a2f38;   /* secondary text */
--muted:     #6b7280;   /* tertiary text */
--muted-2:   #9aa1ad;   /* disabled / placeholder */

/* Lines */
--line:      #e6e3da;   /* default border */
--line-2:    #d8d2c2;   /* stronger border */

/* Accent */
--accent:        #1d3a8a;   /* deep navy */
--accent-soft:   #e6ecff;   /* tinted background */

/* Status */
--ok:    #15803d;
--warn:  #92400e;
--err:   #b91c1c;

/* Type */
--serif: 'Source Serif 4', Georgia, serif;
--sans:  'Inter Tight', system-ui, sans-serif;
--mono:  'JetBrains Mono', ui-monospace, monospace;
```

### Rank colors (advancement)

```
scout:      #f5f3ee bg / #6b6760 text  / #e8e3d6 border
tenderfoot: #fef3c7 bg / #92400e text  / #fde68a border
second:     #dbeafe bg / #1e40af text  / #bfdbfe border
first:      #d1fae5 bg / #065f46 text  / #a7f3d0 border
star:       #fef3c7 bg / #854d0e text  / #facc15 border
life:       #fee2e2 bg / #991b1b text  / #fecaca border
eagle:      #fef9c3 bg / #713f12 text  / #ca8a04 border (bolder, non-italic)
```

### Patrol colors

Eagle `#7a1e1e`, Hawk `#1d3a8a`, Wolf `#15803d`, Otter `#0e7490`, Bear `#92400e`.

### Spacing

Standard padding rhythm — 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 40px. Page-level horizontal padding is `28px`. Card body padding is `14px`. Drawer hero padding is `20px 24px`.

### Border radius

`3px` for tags/pills, `6px` for cards/inputs/parent-cards, `10px` for major surfaces (page-level cards, modal bodies), `50%` for avatars.

## Information Architecture

```
Compass admin
├── Overview                                  (dashboard — out of scope for prototype)
├── Calendar
│   ├── Events       (list / month grid)
│   └── Locations    (cards / table)
├── Roster
│   ├── Scouts
│   ├── Adult members
│   ├── Merit badge counselors
│   ├── Patrols
│   └── Pending
├── Messages                                  (placeholder)
├── Photos                                    (placeholder)
├── Forms                                     (placeholder)
├── Money                                     (placeholder)
│
└── Right side of admin bar:
    ├── Site         (Simple / Advanced editor of public site)
    ├── Pages        (custom pages)
    ├── Security     (permissions)
    └── Domain       (DNS / vanity URL)
```

## Screens / Views

### 1. Site editor — Simple mode

**Purpose**: non-technical leaders edit hero + page blocks via forms with a live preview.

**Layout**: 50/50 split — left is form editor, right is live preview rendered in a phone/tablet/desktop frame switcher. Top action bar has crumbs + Preview / Publish.

**Form blocks**: Hero (headline, subhead) + a sequence of Block cards (text, image, events, photos, posts, CTA, contact, FAQ, divider). Each block is a collapsible card with edit fields, drag handle, up/down/delete. Bottom strip has `+ add block` row of typed buttons.

### 2. Site editor — Advanced mode

**Purpose**: power users build pages on a canvas with inline editing.

**Layout**: 3-column — left palette (Blocks + Layers panel + Theme), center canvas (the live page, frame-aware width), right inspector. Click a block to select; selected block gets an accent outline + label badge + drag handle. `contentEditable` headlines/subheads on the hero edit inline.

**Inspector** is grouped: Content fields (vary by block type), Layout (padding, width, background), Visibility (devices, audience).

### 3. Pages list

Compass-style card with table inside: Name, Slug (mono, gray), Status pill (live/draft/private — color-coded dot), Updated (relative), 30d views, In-nav (check or em-dash), edit button.

### 4. Media library

Toolbar with `All / Photos / Documents / Videos` segmented control, Upload / New album buttons. Dashed drop zone above a 6-column thumbnail grid. Each thumbnail has overlay caption (mono filename, 10.5px white-on-gradient).

### 5. Calendar → Events

Two view tabs:
- **List view** — sortable data grid (date, title, type with color chip, location, sign-up status, attendance count)
- **Month view** — modern month grid with colored event chips by event-type color, hovering shows quick details, click opens drawer

Event drawer: tabs for Details, Sign-ups, Location (with embedded location picker that links to the Locations admin), Attendance, Notifications.

### 6. Calendar → Locations

Card grid (default) with photo, name, type chip (Meeting hall / Campground / Service site / Local attraction / High adventure), distance, address, "used in N events" stat. Toggle to table view. Drawer has photo, description, web site, phone, address, find-on-map, distance, tags.

Locations integrate with the Event drawer's location picker — typing in the picker filters by name + type, and a "Create new location…" deep-link opens the location drawer prefilled with the search term.

### 7. Roster

Five tabs above a stats strip: **Scouts / Adult members / Merit badge counselors / Patrols / Pending**.

**Stats strip** — 5 tiles: Active scouts, Adult members (with trained / not-trained breakdown, warns if any not trained), MB counselors (in-troop + external), Patrols, Pending (highlighted if > 0).

**Scouts grid** — sortable columns: Name (avatar + age/joined sub), Rank (color-coded pill), Toward next (progress bar + %), Patrol (with patrol-color dot), Position, MBs (count, mono), Last seen.

**Adults grid** — Name + role sub, Leadership role (italic serif), YPT (✓ + expiry date OR red "Not trained"), Scout(s), MB counselor (chips of badges they counsel, "+N" overflow), BSA ID (mono), Contact.

**Counselors grid** — combines in-troop counselors (`SAMPLE_ADULTS.filter(a => a.mb)`) with external counselors. Type column distinguishes In-troop (accent) vs External (warning amber). Counsels column shows badge chips.

**Patrols grid** — card grid with patrol color block, leader name, member avatar stack (initials, overlapping circles), member count, Edit button.

**Pending grid** — table with audience chip, requested role, requested by, invited date, Approve / Decline.

All data grids share `<DataGrid>` (in `data-grid.jsx`) with: search, sort, multi-column filters, bulk action bar that appears when rows are selected, CSV export. Use **TanStack Table v8** for the real implementation — the prototype's `DataGrid` is a hand-rolled stand-in.

### 8. Member drawer

`min(820px, 96vw)` wide modal with:

**Hero** — large 64px avatar + serif name + italic-serif sub line ("Life · Eagle Patrol · age 16 · joined 2021 · Senior Patrol Leader") + Email / Edit profile / more buttons.

**Tabs** depend on member type:
- Scout → Profile, **Advancement** (default), Parents & guardians, Medical & forms, Activity log
- Adult → Profile, Roles & training, Counselor badges (if MB), Children in troop, Activity
- External counselor → similar to adult but no Roles tab

**Advancement tab** — current rank + "working toward [next]" header with Sign off / IA 2.0 sync buttons. Requirements list (status pill, name, progress + %). Merit badges cluster (Eagle-required ones get gold border).

**Parents & guardians** — list of parent cards. Each card has avatar, name + role tag + "linked to roster" pill, contact line. `+ Add guardian` button.

**Medical & forms** — KV grid: Annual health forms A/B (✓ on file, expires), C (warn if Philmont needed), insurance, allergies, dietary, emergency contact. Download forms / Request update buttons.

**Roles & training** (adult) — Compass roles tag cluster, Training KV: YPT, position-specific, IOLS, CPR/First Aid.

**Counselor badges** — chip cluster with X to remove, + Add badge. KV: council approval, "show contact info to scouts" toggle, expertise.

**Children in troop** — list of linked scouts (uses `parents.some(p => p.name.includes(adult.last))` heuristic in the prototype; real implementation needs a proper join via parent IDs).

### 9. New scout modal — parent linking

Critical UX: when registering a new scout, leaders can **link an existing adult** (sibling's parent) instead of duplicating their record. Picker is a card-list of adults with avatar, role, "parent of X". Linked parents show a `✓ linked from roster` chip and have name/email/phone disabled. Adding a "new" record offers a checkbox to also create an Adult Member record (committee, parent of scout) — most parents end up in both lists.

### 10. Publish modal

Lists changes since last publish in a card. Notify-committee-chair checkbox. Schedule / Publish now buttons.

## Interactions & Behavior

- **Drawers and modals** — click outside to close, X button in head, Esc to close (real impl)
- **Tabs in drawers** — horizontal scroll on overflow, accent-color underline + ink-black label on active
- **Sort** — click column header, arrow indicates direction
- **Filter** — per-column dropdowns (chip-shaped)
- **Bulk select** — checkbox in first column, header shows count + bulk action bar
- **Expandable rows** — Simple editor blocks, FAQ items
- **Inline editing** — `contentEditable` on hero in advanced mode; field forms in simple mode
- **Toast** — bottom-center for "Saved", "Block deleted", etc.
- **Frame switcher** — desktop / tablet / mobile sets canvas max-width

## State Management

For the real app, recommended structure:

```
- Auth & current unit (Zustand or React Context)
- Server state (TanStack Query): pages, blocks, locations, events, roster, adv records
- Local UI state (component-level): selected block, open drawer, filter values, modal open
- Form state (React Hook Form + Zod): all create/edit forms
- Persist state (localStorage): last viewed tab, frame size, density preference
```

Auto-save the page editor on blur with optimistic updates; show "Saved 14s ago" indicator.

## Components to map onto a real UI library

| Prototype | shadcn/ui | Headless UI | Other |
|-----------|-----------|-------------|-------|
| `<DataGrid>` | TanStack Table v8 + `Table` | TanStack Table | AG Grid Community |
| `Modal` / drawer | `Dialog` / `Sheet` | `Dialog` | Radix Dialog |
| `Tabs` | `Tabs` | `Tab` | Radix Tabs |
| `seg` segmented control | `ToggleGroup` | — | Radix ToggleGroup |
| `select` | `Select` | `Listbox` | Radix Select |
| `Toast` | `Sonner` | — | react-hot-toast |
| `tweaks-panel` | — | — | (prototype-only — drop) |

## Assets

- **Photos** are unsplash.com URLs (placeholder). Replace with the troop's media library uploads — store in S3/R2 + CDN.
- **Icons** are inline SVGs in `icons.jsx`. Replace with Lucide React (most match 1:1: home, users, calendar, image, trash, etc.)
- **Logos** — placeholder gradient circles. Real impl: troop logo upload + scout-rank patches sprite.

## Files

```
Scout Host CMS.html         — entry point, lists every script tag
styles.css                   — base tokens + most component styles
data-grid.css                — table / sort / filter / bulk styles
roster.css                   — roster-specific (rank pills, MB chips, KV, drawer hero)

app.jsx                      — root App, primary/admin tab routing, all top-level state
icons.jsx                    — Icon component, SVG sprite
shell.jsx                    — Sidebar + Topbar (legacy; current shell is in app.jsx now)
preview.jsx                  — PublicPreview component (live preview pane)
simple-editor.jsx            — Simple page editor (form-based)
advanced-editor.jsx          — Advanced page editor (palette + canvas + inspector)
other-screens.jsx            — Pages list, Media library, Site settings, Publish modal
locations.jsx                — Locations admin (cards, drawer)
events.jsx                   — Events admin (list, month grid, drawer, event types)
security.jsx                 — Security/permissions
setup.jsx                    — onboarding setup flow
data-grid.jsx                — generic sortable/filterable data grid (replace with TanStack Table)
roster.jsx                   — Roster shell, tabs, stats strip, sample data exports
roster-grids.jsx             — Scouts / Adults / Counselors / Patrols / Pending grids
roster-drawer.jsx            — Member drawer with all tabs + Invite modal + New Scout modal
tweaks-panel.jsx             — prototype-only settings panel (do not ship)
```

## Notes for the implementer

- The prototype uses globally-scoped components via `window.X = X` because Babel scripts don't share scope. The real codebase should use proper ES modules.
- Each `useState` import in JSX files is renamed (`useStateR`, `useStateD`) to avoid the global scope collision — this is purely a prototype hack; in modules just import normally.
- All sample data (`SAMPLE_SCOUTS`, `SAMPLE_ADULTS`, `EXTERNAL_COUNSELORS`, `PATROLS`, `PENDING`, `SAMPLE_LOCATIONS`, `SAMPLE_EVENTS`) is in the corresponding `*.jsx` files — useful as seed data for backend fixtures or storybook stories.
- The "link existing adult to new scout" flow is the most product-distinctive interaction in the prototype. Make sure the real impl preserves the same affordance.
- BSA Internet Advancement 2.0 sync, YPT expiry tracking, and council ID lookup are all stubbed — they'll need real integrations.
- The visual aesthetic (serif headers, italic eyebrows, dashed dividers, warm off-white) is **deliberate and brand-defining**. Don't replace with a generic Tailwind dashboard look.

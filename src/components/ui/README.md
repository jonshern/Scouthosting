# `src/components/ui` — shared design atoms

Small set of presentational primitives extracted from
`design-handoff/atoms.jsx` and the marketing site. Roadmap features
(parent portal, audit log viewer, equipment ledger, reports) build on
these so we have one design vocabulary.

## When to use

| Need | Atom |
|---|---|
| Page section title with eyebrow | `<SectionHeader eyebrow="..." title="..." />` |
| Card surface | `<Card>` (+ `<CardHeader>`) |
| Stat block | `<Stat label value sub tone>` inside `<StatRow>` |
| Button | `<Button variant="primary\|secondary\|ghost\|danger">` |
| Inline link styled as a button | `<ButtonLink href="..." variant>` |
| Status / tag chip | `<Pill tone="accent\|success\|danger\|amber\|teal">` |
| Compass mark / wordmark | `<Mark>` / `<Wordmark>` |

## When NOT to use

- One-off marketing layouts already on the page — leave them be. These
  atoms are for new admin / app surfaces.
- Don't extend the API speculatively. Add a variant only when a real
  caller needs it.

## Tokens

All atoms read from the Tailwind palette in `tailwind.config.ts`
(`ink`, `sky`, `accent`, `surface`, `surface-alt`, `line`, `success`,
`danger`, `amber`, `teal`, `plum`). No inline hex literals.

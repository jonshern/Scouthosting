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

All atoms read the suite's Modern Clean tokens from
`src/styles/tokens.ts` through the Tailwind palette (`bg`, `surface`,
`sunk`, `ink`, `ink-2`, `muted`, `line`, `divider`, `control`, `accent`,
`done`, `attention`, `danger`) or the matching CSS variables
(`var(--accent)`). No inline hex literals.

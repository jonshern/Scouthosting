-- PR-C0 foundation: Channel gains the columns it needs to absorb the
-- Subgroup model in a follow-up migration.
--
--   purpose       — human-readable description, replaces
--                   Subgroup.description on broadcast channels and is
--                   generally useful elsewhere.
--   autoAddRules  — JSON shape {patrols?, skills?, interests?, trainings?}
--                   driving the reconciler's auto-add behavior. null
--                   means "manual membership only" (every existing
--                   Channel today).
--
-- Both columns are nullable and additive. No data is migrated yet —
-- PR-C1 wires the reconciler to read autoAddRules and runs a one-time
-- backfill from existing Subgroup rows.

ALTER TABLE "Channel"
  ADD COLUMN "purpose"      TEXT,
  ADD COLUMN "autoAddRules" JSONB;

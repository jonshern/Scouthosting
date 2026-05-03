-- Final step of the Subgroup → Channel unification. By the time this
-- migration runs, the operator should have already executed
-- `scripts/backfill-channels-from-subgroups.js` against the database
-- so every Subgroup row has a corresponding Channel(kind="broadcast").
-- Without that, the data in Subgroup is lost on DROP.
--
-- Reverse path (rare): restore from backup; PR-C0 → PR-C3 are the
-- forward path that lets the new model be re-populated.

DROP TABLE "Subgroup";

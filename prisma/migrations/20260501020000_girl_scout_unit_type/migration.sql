-- Add GirlScoutTroop to the UnitType enum.
-- Girl Scouts of the USA is a separate organisation from Scouts BSA;
-- their troops use a different program with age-graded "levels"
-- (Daisy / Brownie / Junior / Cadette / Senior / Ambassador) instead
-- of free-form patrols. The lib/orgRoles.js module + the admin form
-- plumbing are the runtime side of this; this migration just lets the
-- enum hold the new value.

ALTER TYPE "UnitType" ADD VALUE 'GirlScoutTroop';

-- Default the Enhanced messaging add-on to ON for every existing
-- org. Leaders can disable from /admin/billing if they're doing a
-- gradual rollout. New orgs get the same default via provisionOrg.
--
-- Idempotent: only touches rows that don't already have "messaging"
-- in their addOns array.

UPDATE "Org"
   SET "addOns" = COALESCE("addOns", '[]'::jsonb) || '["messaging"]'::jsonb
 WHERE NOT (COALESCE("addOns", '[]'::jsonb) @> '["messaging"]'::jsonb);

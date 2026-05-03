-- Provisioning template. A named set of seed data the "new org" form
-- can clone from, editable from /__super/templates. Replaces the
-- hardcoded SUBGROUP_VOCAB / SUBGROUP_PRESETS in lib/orgRoles.js.
--
-- Built-in rows for Cub Scout Pack + Girl Scout Troop are inserted
-- below; the existing built-in tables in lib/orgRoles.js stay as the
-- runtime fallback when the OrgTemplate row is absent.

CREATE TABLE "OrgTemplate" (
  "id"              TEXT PRIMARY KEY,
  "name"            TEXT NOT NULL UNIQUE,
  "unitType"        "UnitType" NOT NULL,
  "vocab"           JSONB NOT NULL,
  "subgroupPresets" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "positionList"    JSONB,
  "customPagesSeed" JSONB,
  "isBuiltIn"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);

CREATE INDEX "OrgTemplate_unitType_idx" ON "OrgTemplate"("unitType");

-- Seed the canonical built-ins. Idempotent if re-run via the manual
-- migrate-deploy path: ON CONFLICT DO NOTHING on the unique name.
-- Mirrors SUBGROUP_VOCAB[Pack] and SUBGROUP_PRESETS[Pack] from
-- lib/orgRoles.js exactly.

INSERT INTO "OrgTemplate" ("id", "name", "unitType", "vocab", "subgroupPresets", "isBuiltIn", "updatedAt")
VALUES
  (
    'tmpl_pack_default',
    'Cub Scout Pack',
    'Pack',
    '{"singular":"den","plural":"dens","heading":"Dens"}'::jsonb,
    '[
      {"key":"lion","label":"Lion","grade":"K"},
      {"key":"tiger","label":"Tiger","grade":"1st"},
      {"key":"wolf","label":"Wolf","grade":"2nd"},
      {"key":"bear","label":"Bear","grade":"3rd"},
      {"key":"webelos","label":"Webelos","grade":"4th"},
      {"key":"arrow-of-light","label":"Arrow of Light","grade":"5th"}
    ]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'tmpl_gs_troop_default',
    'Girl Scout Troop',
    'GirlScoutTroop',
    '{"singular":"level","plural":"levels","heading":"Levels"}'::jsonb,
    '[
      {"key":"daisy","label":"Daisy","grade":"K-1"},
      {"key":"brownie","label":"Brownie","grade":"2-3"},
      {"key":"junior","label":"Junior","grade":"4-5"},
      {"key":"cadette","label":"Cadette","grade":"6-8"},
      {"key":"senior","label":"Senior","grade":"9-10"},
      {"key":"ambassador","label":"Ambassador","grade":"11-12"}
    ]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'tmpl_troop_default',
    'Scouts BSA Troop',
    'Troop',
    '{"singular":"patrol","plural":"patrols","heading":"Patrols"}'::jsonb,
    '[]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'tmpl_crew_default',
    'Venturing Crew',
    'Crew',
    '{"singular":"crew sub-group","plural":"crew sub-groups","heading":"Sub-groups"}'::jsonb,
    '[]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'tmpl_ship_default',
    'Sea Scout Ship',
    'Ship',
    '{"singular":"watch","plural":"watches","heading":"Watches"}'::jsonb,
    '[]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'tmpl_post_default',
    'Exploring Post',
    'Post',
    '{"singular":"post group","plural":"post groups","heading":"Groups"}'::jsonb,
    '[]'::jsonb,
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("name") DO NOTHING;

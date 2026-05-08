-- First-class Locations + Patrols per design_handoff_compass_cms.
-- Locations get a back-link from Event.locationId; the existing
-- Event.location + Event.locationAddress free-form columns stay so
-- back-compat / ICS feeds keep working.

ALTER TABLE "Event"
  ADD COLUMN "locationId" text;

CREATE INDEX "Event_org_locationId_idx" ON "Event"("orgId", "locationId");

CREATE TABLE "Location" (
  "id"            text PRIMARY KEY NOT NULL,
  "orgId"         text NOT NULL,
  "name"          text NOT NULL,
  "type"          text NOT NULL DEFAULT 'Meeting',
  "address"       text,
  "description"   text,
  "phone"         text,
  "website"       text,
  "lat"           text,
  "lng"           text,
  "distanceMiles" double precision,
  "imageUrl"      text,
  "tags"          text[] NOT NULL DEFAULT ARRAY[]::text[],
  "archived"      boolean NOT NULL DEFAULT false,
  "sortOrder"     integer NOT NULL DEFAULT 0,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamp(3) NOT NULL,
  CONSTRAINT "Location_org_fk" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Location_org_name_key"   ON "Location"("orgId", "name");
CREATE INDEX        "Location_org_archived_idx" ON "Location"("orgId", "archived");
CREATE INDEX        "Location_org_type_idx"     ON "Location"("orgId", "type");

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_location_fk" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL;

CREATE TABLE "Patrol" (
  "id"             text PRIMARY KEY NOT NULL,
  "orgId"          text NOT NULL,
  "name"           text NOT NULL,
  "color"          text NOT NULL DEFAULT '#1d3a8a',
  "leaderMemberId" text,
  "description"    text,
  "archived"       boolean NOT NULL DEFAULT false,
  "sortOrder"      integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamp(3) NOT NULL,
  CONSTRAINT "Patrol_org_fk"    FOREIGN KEY ("orgId")          REFERENCES "Org"("id")    ON DELETE CASCADE,
  CONSTRAINT "Patrol_leader_fk" FOREIGN KEY ("leaderMemberId") REFERENCES "Member"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "Patrol_org_name_key"     ON "Patrol"("orgId", "name");
CREATE INDEX        "Patrol_org_archived_idx" ON "Patrol"("orgId", "archived");

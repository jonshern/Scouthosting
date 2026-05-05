-- Org-level à-la-carte add-ons orthogonal to the plan tier. Empty /
-- null = base plan only; add-ons enable specific feature bundles
-- (e.g. "messaging" → DMs + broadcast email + broadcast SMS +
-- channels + newsletters + chat).

ALTER TABLE "Org"
  ADD COLUMN "addOns" JSONB;

-- Annual health form dates on the roster (expand-only: two nullable columns).
ALTER TABLE "Member" ADD COLUMN "healthFormOn" DATE;
ALTER TABLE "Member" ADD COLUMN "healthExamOn" DATE;

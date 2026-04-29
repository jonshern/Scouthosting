-- CreateTable
CREATE TABLE "CarRide" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverEmail" TEXT,
    "driverPhone" TEXT,
    "vehicleNote" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "departureTime" TIMESTAMP(3),
    "departureLocation" TEXT,
    "returnTime" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarRide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarRideRider" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "isYouth" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarRideRider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarRide_orgId_eventId_idx" ON "CarRide"("orgId", "eventId");

-- CreateIndex
CREATE INDEX "CarRideRider_orgId_rideId_idx" ON "CarRideRider"("orgId", "rideId");

-- AddForeignKey
ALTER TABLE "CarRide" ADD CONSTRAINT "CarRide_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRide" ADD CONSTRAINT "CarRide_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRideRider" ADD CONSTRAINT "CarRideRider_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarRideRider" ADD CONSTRAINT "CarRideRider_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "CarRide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehiclePosition" (
    "vehicleId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehiclePosition_pkey" PRIMARY KEY ("vehicleId")
);

-- CreateIndex
CREATE INDEX "Trip_driverId_endedAt_idx" ON "Trip"("driverId", "endedAt");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehiclePosition" ADD CONSTRAINT "VehiclePosition_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

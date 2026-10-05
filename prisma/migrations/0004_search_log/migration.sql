-- CreateTable
CREATE TABLE "SearchLog" (
    "id" SERIAL NOT NULL,
    "fromPlaceId" TEXT NOT NULL,
    "toPlaceId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "options" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- Additive: a small, never-reused number per vehicle for the binary position sync.
-- SERIAL fills the existing rows.
ALTER TABLE "Vehicle" ADD COLUMN "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_seq_key" ON "Vehicle"("seq");

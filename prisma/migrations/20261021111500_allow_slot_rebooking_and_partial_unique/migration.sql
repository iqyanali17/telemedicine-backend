-- DropIndex
DROP INDEX IF EXISTS "consultations_slotId_key";

-- CreateIndex
CREATE INDEX "consultations_slotId_idx" ON "consultations"("slotId");

-- CreatePartialUniqueIndex
-- Enforce that an availability slot can only have at most one active (non-cancelled) consultation at any time
CREATE UNIQUE INDEX "consultations_active_slotId_key" ON "consultations"("slotId") WHERE "status" != 'CANCELLED';

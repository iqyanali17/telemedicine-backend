-- AlterTable
ALTER TABLE "payments" ADD COLUMN "refundRef" TEXT,
ADD COLUMN "refundReason" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "payments_refundRef_key" ON "payments"("refundRef");

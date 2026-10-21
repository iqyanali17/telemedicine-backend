-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- AlterTable users: add lastTotpCounter
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastTotpCounter" BIGINT;

-- AlterTable notifications: add durable queueing fields
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "notifications" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndexes on notifications
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_idempotencyKey_key" ON "notifications"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "notifications_status_nextRetryAt_idx" ON "notifications"("status", "nextRetryAt");

-- CreateTable refund_operations
CREATE TABLE IF NOT EXISTS "refund_operations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "refundRef" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes on refund_operations
CREATE UNIQUE INDEX IF NOT EXISTS "refund_operations_idempotencyKey_key" ON "refund_operations"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "refund_operations_paymentId_idx" ON "refund_operations"("paymentId");
CREATE INDEX IF NOT EXISTS "refund_operations_status_idx" ON "refund_operations"("status");
CREATE INDEX IF NOT EXISTS "refund_operations_consultationId_idx" ON "refund_operations"("consultationId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'refund_operations_paymentId_fkey'
    ) THEN
        ALTER TABLE "refund_operations" ADD CONSTRAINT "refund_operations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

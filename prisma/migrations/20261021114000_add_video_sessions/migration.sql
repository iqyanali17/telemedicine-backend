-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('INITIATED', 'ACTIVE', 'COMPLETED', 'TERMINATED');

-- CreateTable
CREATE TABLE "video_sessions" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MOCK_WEBRTC',
    "status" "SessionStatus" NOT NULL DEFAULT 'INITIATED',
    "roomUrl" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_sessions_consultationId_key" ON "video_sessions"("consultationId");

-- CreateIndex
CREATE UNIQUE INDEX "video_sessions_roomId_key" ON "video_sessions"("roomId");

-- CreateIndex
CREATE INDEX "video_sessions_roomId_idx" ON "video_sessions"("roomId");

-- CreateIndex
CREATE INDEX "video_sessions_status_idx" ON "video_sessions"("status");

-- AddForeignKey
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

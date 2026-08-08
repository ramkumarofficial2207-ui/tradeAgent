-- Persist scanner lifecycle, progress, failures, and the last successful result.
-- This is additive and does not modify existing trading or user data.
CREATE TABLE "ScanJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mode" TEXT NOT NULL DEFAULT 'swing',
    "trigger" TEXT NOT NULL,
    "requestedBy" UUID,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'Queued',
    "message" TEXT,
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "processedStocks" INTEGER NOT NULL DEFAULT 0,
    "totalStocks" INTEGER NOT NULL DEFAULT 0,
    "setupsFound" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScanJob_mode_status_idx" ON "ScanJob"("mode", "status");
CREATE INDEX "ScanJob_mode_completedAt_idx" ON "ScanJob"("mode", "completedAt");
CREATE INDEX "ScanJob_createdAt_idx" ON "ScanJob"("createdAt");

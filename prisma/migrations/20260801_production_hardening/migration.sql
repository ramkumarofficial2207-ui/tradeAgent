-- Complete the PostgreSQL schema introduced after the original baseline.

-- Deliberately discard legacy plaintext broker secrets. Future credential writes
-- must encrypt before storing values in the ciphertext-only columns.
ALTER TABLE "BrokerConfig"
DROP COLUMN "apiKey",
DROP COLUMN "apiSecret",
DROP COLUMN "accessToken",
ADD COLUMN "apiKeyCiphertext" TEXT,
ADD COLUMN "apiSecretCiphertext" TEXT,
ADD COLUMN "accessTokenCiphertext" TEXT;

-- Plaintext credentials cannot be safely migrated into ciphertext in SQL.
-- Invalidate existing broker sessions and require users to reconnect through
-- the encrypted credential flow before live execution can ever be enabled.
DELETE FROM "BrokerConfig";
ALTER TABLE "BrokerConfig"
ALTER COLUMN "apiKeyCiphertext" SET NOT NULL,
ALTER COLUMN "apiSecretCiphertext" SET NOT NULL;

ALTER TABLE "User"
ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN "subscriptionExpiry" TIMESTAMP(3),
ADD COLUMN "telegramChatId" TEXT,
ADD COLUMN "notifyBuySignals" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tradingCapital" DOUBLE PRECISION NOT NULL DEFAULT 500000,
ADD COLUMN "maxRiskPct" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
ADD COLUMN "maxPositions" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "maxSectorConc" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "HistoricalSetup"
ADD COLUMN "aiLogic" TEXT;

CREATE TABLE "InstitutionalFlowSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tradingDate" TIMESTAMP(3) NOT NULL,
    "fiiBuy" DOUBLE PRECISION NOT NULL,
    "fiiSell" DOUBLE PRECISION NOT NULL,
    "fiiNet" DOUBLE PRECISION NOT NULL,
    "diiBuy" DOUBLE PRECISION NOT NULL,
    "diiSell" DOUBLE PRECISION NOT NULL,
    "diiNet" DOUBLE PRECISION NOT NULL,
    "totalNet" DOUBLE PRECISION NOT NULL,
    "marketBias" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'NSE',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstitutionalFlowSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstitutionalDeal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "symbol" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "dealType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstitutionalDeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstitutionalConfluence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "symbol" TEXT NOT NULL,
    "companyName" TEXT,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "netFiiBuyCr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netDiiBuyCr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "technicalPattern" TEXT,
    "confluenceScore" INTEGER NOT NULL DEFAULT 0,
    "isSuperSignal" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstitutionalConfluence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "providerOrderId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "planId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "paymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstitutionalFlowSnapshot_tradingDate_key" ON "InstitutionalFlowSnapshot"("tradingDate");
CREATE INDEX "InstitutionalFlowSnapshot_tradingDate_idx" ON "InstitutionalFlowSnapshot"("tradingDate");
CREATE INDEX "InstitutionalDeal_symbol_tradeDate_idx" ON "InstitutionalDeal"("symbol", "tradeDate");
CREATE INDEX "InstitutionalDeal_entityType_tradeDate_idx" ON "InstitutionalDeal"("entityType", "tradeDate");
CREATE INDEX "InstitutionalDeal_dealType_idx" ON "InstitutionalDeal"("dealType");
CREATE UNIQUE INDEX "InstitutionalConfluence_symbol_key" ON "InstitutionalConfluence"("symbol");
CREATE INDEX "InstitutionalConfluence_confluenceScore_idx" ON "InstitutionalConfluence"("confluenceScore");
CREATE INDEX "InstitutionalConfluence_isSuperSignal_idx" ON "InstitutionalConfluence"("isSuperSignal");
CREATE UNIQUE INDEX "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");
CREATE UNIQUE INDEX "PaymentOrder_paymentId_key" ON "PaymentOrder"("paymentId");
CREATE INDEX "PaymentOrder_userId_status_idx" ON "PaymentOrder"("userId", "status");

ALTER TABLE "PaymentOrder"
ADD CONSTRAINT "PaymentOrder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

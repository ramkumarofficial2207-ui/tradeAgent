-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "BrokerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "totalCapital" DOUBLE PRECISION NOT NULL DEFAULT 1000000,
    "riskPctLarge" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "riskPctSmall" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 5,
    "maxSectorConc" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PortfolioConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "ticker" TEXT NOT NULL,
    "companyName" TEXT,
    "sector" TEXT,
    "capCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "setupType" TEXT NOT NULL DEFAULT 'Manual',
    "regimeAtEntry" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitDate" TIMESTAMP(3),
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stopLossInit" DOUBLE PRECISION NOT NULL,
    "stopLossTrail" DOUBLE PRECISION,
    "target1" DOUBLE PRECISION NOT NULL,
    "target2" DOUBLE PRECISION,
    "exitPrice" DOUBLE PRECISION,
    "exitReason" TEXT,
    "currentPrice" DOUBLE PRECISION,
    "pnlRs" DOUBLE PRECISION,
    "pnlPct" DOUBLE PRECISION,
    "rMultiple" DOUBLE PRECISION,
    "initialRiskRs" DOUBLE PRECISION,
    "capitalDeployed" DOUBLE PRECISION,
    "daysHeld" INTEGER,
    "notes" TEXT,
    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenerPreset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScreenerPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "ticker" TEXT NOT NULL,
    "sector" TEXT,
    "signal" TEXT,
    "ltp" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "targetPct" DOUBLE PRECISION,
    "slPct" DOUBLE PRECISION,
    "riskReward" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "setupType" TEXT,
    "buyZone" DOUBLE PRECISION,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalSetup" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticker" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "timeframe" TEXT,
    "aiSignal" TEXT NOT NULL DEFAULT 'WATCH',
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "resultPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "HistoricalSetup_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "BrokerConfig_userId_key" ON "BrokerConfig"("userId");
CREATE UNIQUE INDEX "WatchlistItem_userId_ticker_key" ON "WatchlistItem"("userId", "ticker");
CREATE INDEX "WatchlistItem_userId_idx" ON "WatchlistItem"("userId");
CREATE INDEX "Trade_status_idx" ON "Trade"("status");
CREATE INDEX "Trade_ticker_idx" ON "Trade"("ticker");
CREATE INDEX "Trade_entryDate_idx" ON "Trade"("entryDate");
CREATE INDEX "HistoricalSetup_status_idx" ON "HistoricalSetup"("status");
CREATE INDEX "HistoricalSetup_ticker_idx" ON "HistoricalSetup"("ticker");

-- Foreign keys
ALTER TABLE "BrokerConfig" ADD CONSTRAINT "BrokerConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScreenerPreset" ADD CONSTRAINT "ScreenerPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrokerConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "BrokerConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortfolioConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "totalCapital" REAL NOT NULL DEFAULT 1000000,
    "riskPctLarge" REAL NOT NULL DEFAULT 1.0,
    "riskPctSmall" REAL NOT NULL DEFAULT 0.75,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 5,
    "maxSectorConc" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "companyName" TEXT,
    "sector" TEXT,
    "capCategory" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "setupType" TEXT NOT NULL DEFAULT 'Manual',
    "regimeAtEntry" TEXT,
    "confidenceScore" REAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitDate" DATETIME,
    "entryPrice" REAL NOT NULL,
    "quantity" INTEGER NOT NULL,
    "stopLossInit" REAL NOT NULL,
    "stopLossTrail" REAL,
    "target1" REAL NOT NULL,
    "target2" REAL,
    "exitPrice" REAL,
    "exitReason" TEXT,
    "currentPrice" REAL,
    "pnlRs" REAL,
    "pnlPct" REAL,
    "rMultiple" REAL,
    "initialRiskRs" REAL,
    "capitalDeployed" REAL,
    "daysHeld" INTEGER,
    "notes" TEXT,
    CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScreenerPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ScreenerPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerConfig_userId_key" ON "BrokerConfig"("userId");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_ticker_idx" ON "Trade"("ticker");

-- CreateIndex
CREATE INDEX "Trade_entryDate_idx" ON "Trade"("entryDate");

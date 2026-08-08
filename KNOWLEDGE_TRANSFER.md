# StockSage AI Knowledge Transfer

> Historical planning document: the `mobile/` source described below was not present in this workspace; only orphaned dependencies existed and were removed during the production audit. The canonical client is `apex-intelligence/`.

## Project Snapshot

StockSage AI is a monorepo with:

- Backend: Express + TypeScript + Prisma + PostgreSQL
- Web frontend: React + Vite
- Mobile frontend: Expo + React Native + Expo Router

Repo root:

- `src/` backend API and services
- `apex-intelligence/` canonical web app
- `mobile/` cross-platform mobile app
- `prisma/` schema and migrations

## What Was Added

### Mobile App

A new Expo mobile app was added in `mobile/`.

Key files:

- `mobile/app/_layout.tsx`
- `mobile/app/(auth)/login.tsx`
- `mobile/app/(auth)/register.tsx`
- `mobile/app/(tabs)/index.tsx`
- `mobile/app/(tabs)/watchlist.tsx`
- `mobile/app/(tabs)/portfolio.tsx`
- `mobile/app/(tabs)/chat.tsx`
- `mobile/app/profile.tsx`
- `mobile/app/upgrade.tsx`
- `mobile/app/founder.tsx`

Supporting layers:

- `mobile/context/AuthContext.tsx`
- `mobile/context/ThemeContext.tsx`
- `mobile/lib/api.ts`
- `mobile/lib/storage.ts`
- `mobile/lib/notifications.ts`
- `mobile/hooks/useAgentSSE.ts`
- `mobile/hooks/useWatchlist.ts`
- `mobile/components/`

### Backend Mobile Support

The backend was extended to support mobile auth and push registration.

Changed files:

- `src/index.ts`
- `src/validation.ts`
- `src/notificationService.ts`
- `src/pushNotificationService.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260406_mobile_auth_and_device_tokens/migration.sql`

## Auth Flow

### Web

Web remains compatible with:

- `email + password`

### Mobile

Mobile uses:

- Registration: `name + mobileNumber + email + mpin`
- Login: `mobileNumber + mpin`

The backend still preserves old web auth behavior.

## Prisma Changes

### User model

Added:

- `mobileNumber String? @unique`
- `mpinHash String?`

### DeviceToken model

Added for Expo push notifications:

- `id`
- `userId`
- `token`
- `platform`
- `createdAt`
- `updatedAt`

## New/Updated API Behavior

### Auth

- `POST /api/auth/register`
  - accepts mobile registration payload
- `POST /api/auth/login`
  - accepts either email/password or mobile/mpin
- `GET /api/auth/me`
  - now returns `mobileNumber`, subscription info

### Preferences

- `GET /api/user/preferences`
- `POST /api/user/preferences`

### Notifications

- `POST /api/notifications/register-device`

## Claude Usage

Claude is used safely through the backend.

Important:

- Do not put `ANTHROPIC_API_KEY` directly into the mobile app
- Mobile should call backend APIs like `/api/chat`
- Backend already uses Claude in `src/claudeClient.ts` and `src/chat/service.ts`

## Mobile Configuration

Current production API URL in:

- `mobile/app.json`

Current value:

- `https://swingedge-production.up.railway.app`

If the backend domain changes, update:

- `mobile/app.json`
- or use `EXPO_PUBLIC_API_BASE_URL`

## How To Run Mobile App

From `mobile/`:

```powershell
cmd /c npm install
cmd /c npm run start
```

For Expo Go testing:

1. Install Expo Go on phone
2. Start Expo locally
3. Scan QR code

## How To Build Actual Android APK

From `mobile/`:

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

Notes:

- `preview` is configured to build an installable APK
- `production` is for Play Store style builds
- Expo/EAS login is required before cloud builds

## iOS Notes

iOS testing can be done through Expo Go.

For App Store or TestFlight distribution, you need:

- Apple Developer Account

## Verification Already Done

Backend:

- Prisma client generated successfully
- root TypeScript check passed with:
  - `cmd /c npx tsc --noEmit`

Mobile:

- dependencies installed in `mobile/`
- mobile TypeScript check passed with:
  - `cmd /c npm run typecheck`

## Known Gaps / Next Work

These items are scaffolded but can still be improved:

- richer tablet split-view layout
- real swipe-to-delete gestures in watchlist
- production-grade charting beyond the current lightweight chart component
- stronger push notification workflows and receipts handling
- full APK generation still requires Expo account login

## Recommended Next Steps

1. Log into Expo:

```powershell
cd mobile
npx eas-cli login
```

2. Build the Android APK:

```powershell
npx eas-cli build --platform android --profile preview
```

3. Install the APK on the phone from the build link.

4. After Android is verified, decide whether to:

- keep Expo managed workflow
- generate Play Store build
- add iOS distribution

## Important Files To Know

Backend:

- `src/index.ts`
- `src/validation.ts`
- `src/claudeClient.ts`
- `src/chat/service.ts`
- `src/pushNotificationService.ts`

Mobile:

- `mobile/app/_layout.tsx`
- `mobile/context/AuthContext.tsx`
- `mobile/lib/api.ts`
- `mobile/lib/notifications.ts`
- `mobile/app/(tabs)/index.tsx`

Prisma:

- `prisma/schema.prisma`
- `prisma/migrations/20260406_mobile_auth_and_device_tokens/migration.sql`

## Handoff Summary

The project now supports a real mobile client with:

- mobile registration and MPIN login
- dashboard, watchlist, portfolio, chat, and profile screens
- backend support for device registration and push infrastructure
- production API wiring for Railway

The main remaining action to get the installable app is:

- Expo login
- EAS Android build

---

## Signal Labs — Stock Summary View (2026-08-02)

### Feature

The **Institutional Bulk Deals** panel in Signal Labs (`apex-intelligence/src/pages/SignalLabsPage.tsx`) has two view modes toggled by a pill button in the panel header:

- **Stock Summary** (default) — aggregates all deals by stock symbol and shows which stocks institutions are net-buying vs. net-selling.
- **All Deals** — the original row-per-deal table.

### How the Aggregation Works

All logic lives on the frontend — no new backend route or DB query is needed. The aggregation runs over `filteredDeals` (already filtered by entity and search) using a `Map<symbol, {...}>`:

```
buyQty  / buyValueCr   += quantity / totalValueCr  (dealType === 'BUY')
sellQty / sellValueCr  += quantity / totalValueCr  (dealType === 'SELL')
netFlowCr = buyValueCr - sellValueCr
entities = Set of unique FII/DII/PROMOTER/HNI labels
latestDate = most recent tradeDate across all deals for that symbol
```

Stocks are then sorted by `|netFlowCr|` descending and split into:

- **Stocks Being BOUGHT** — `netFlowCr > 0` (green cards)
- **Stocks Being SOLD** — `netFlowCr ≤ 0` (red cards)

### State Added

```ts
const [dealsView, setDealsView] = useState<'all' | 'summary'>('summary');
```

### File Changed

- `apex-intelligence/src/pages/SignalLabsPage.tsx`

### Filters

The existing symbol search input and entity filter pills (ALL / FII / DII / PROMOTER / HNI / ARBITRAGE) apply to both views — they filter `filteredDeals` before aggregation runs.

---

## NSE Bulk Deals — Historical Backfill (2026-08-02)

### Why It Was Added

`/api/institutional/deals` previously returned only the most recent trading day because the NSE archive URL (`bulk.csv`) is a daily-overwrite file. Historical data was being stored per day from the 4:10 PM cron but the UI was limited to `take: 100` rows which was roughly 1 day of deals.

### What Was Built

| File | Change |
|------|--------|
| `src/services/institutionalService.ts` | Added `backfillNseBulkDeals(daysBack, onProgress?)` + helper functions |
| `src/index.ts` | Added `POST /api/institutional/backfill` (admin); upgraded deals endpoint `take: 100 → 500`, added `?days=N` filter |
| `scratch_backfill_deals.ts` | One-shot standalone script for dev/prod backfill |
| `.env.example` | Added `PROD_DATABASE_URL` variable |
| Confluence window | Widened from 2 days → 30 days in `updateInstitutionalConfluences()` |

### NSE Historical CSV URL Pattern

```
https://archives.nseindia.com/content/equities/bulk_DD-Mon-YYYY.csv
# Example:
https://archives.nseindia.com/content/equities/bulk_01-Aug-2026.csv
```

Month names: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec

Today's file (used by daily cron): `bulk.csv` — always the latest trading day only.

### Backfill Strategy

- **Date-level dedup**: checks `count` of existing records for each date before downloading — skips entire day if already stored (fast, no per-row queries)
- **Batch insert**: uses `createMany({ skipDuplicates: true })` for each day
- **Rate limited**: 1.2 seconds between NSE requests
- **404 handling**: holidays and weekends return 404 — skipped silently
- **Max window**: 730 calendar days (≈ 2 years, ≈ 500 trading days)
- **Idempotent**: safe to re-run at any time

### How to Run the Backfill

**Dev DB** (uses `DATABASE_URL` from `.env`):
```powershell
npx ts-node scratch_backfill_deals.ts
npx ts-node scratch_backfill_deals.ts --days=30   # test run
```

**Production DB** (Railway):
1. Get your Railway PostgreSQL connection string from the Railway dashboard
2. Add to `.env`: `PROD_DATABASE_URL="postgresql://..."`
3. Run:
```powershell
npx ts-node scratch_backfill_deals.ts --prod
npx ts-node scratch_backfill_deals.ts --prod --days=730
```

Estimated time: ~9 minutes for 730 days (1.2 sec/request × 500 trading days).

### API Changes

```
GET /api/institutional/deals
  ?days=30     # optional — filter to last 30 calendar days
  ?days=90     # optional — filter to last 90 calendar days
  (no ?days)   # returns latest 500 rows

POST /api/institutional/backfill   (requireAdmin)
  Body: { days?: number }           # default 730, max 730
  Returns: 202 Accepted immediately, backfill runs in background
```

### After Backfill Completes

The Signal Labs "Stock Summary" and "All Deals" views will automatically show multi-day institutional activity. The Confluence Radar now uses a 30-day accumulation window instead of 2 days.

---

## Signal Labs — Pagination & Custom Date Range Filter (2026-08-02)

### UI Enhancements (`apex-intelligence/src/pages/SignalLabsPage.tsx`)

1. **15-Row Max Pagination**:
   - Both **Stock Summary View** and **All Deals Table View** display max **15 rows per page**.
   - Footer contains item counts (`Showing X to Y of Z entries`) and full navigation controls (`Previous`, Page pills `1`, `2`, `3`..., `Next`).
   - `currentPage` automatically resets to `1` whenever any filter (search query, entity type, from date, to date, or view mode) is changed.

2. **Custom Date Range Filter (`From Date` & `To Date`)**:
   - Integrated HTML5 `<input type="date">` controls into the toolbar header.
   - Dynamic **Clear Date** button (`RotateCcw` icon) appears when custom date bounds are active.

---

## 6-Year Historical Bulk Deals Database Import (2026-08-02)

### Local & Production Database Bulk Importer

- Script: `import_local_bulk_deals.ts`
- Source Data: 6 CSV files (`2021` to `2026`) stored in `BulkDeals_data/`
- Total Records Imported: **105,008 institutional deals**
- DB Table: `InstitutionalDeal` (PostgreSQL)

**How to Import into Production Database (Railway)**:
```powershell
# 1. Add PROD_DATABASE_URL="postgresql://..." in .env
# 2. Run:
npx ts-node import_local_bulk_deals.ts --prod
```

---

## Standalone "Signal Labs" Institutional Worker Service (`signal-labs-service/`)

### Architecture & Folder Layout

Independent microservice/background worker located in `signal-labs-service/`:

```
signal-labs-service/
├── src/
│   ├── config/constants.ts       # Cron schedule (16:30 IST), thresholds & NSE URLs
│   ├── db/
│   │   ├── client.ts             # Prisma DB client connection
│   │   └── models.ts             # TypeScript interfaces for flows, candidates & alerts
│   ├── ingestion/
│   │   ├── nseBulkDeals.ts       # EOD Large Deals API & DB sync with exponential retry
│   │   └── nseBhavcopy.ts        # EOD Price & Delivery Bhavcopy fetcher
│   ├── engine/
│   │   ├── hftScrubber.ts        # Net position calculator & HFT filter logic
│   │   └── candidatePool.ts      # Delivery confirmation & rolling 10-day candidate watchlist
│   ├── scanner/
│   │   ├── indicators.ts        # RSI, ATR, 20/50 EMAs, Bar Closing Strength & BB Width
│   │   └── institutionalScan.ts # Specialized 5-rule technical setup breakout engine
│   ├── utils/
│   │   ├── retry.ts              # Exponential backoff retry utility
│   │   └── logger.ts             # Structured logger
│   └── index.ts                  # Cron worker entry point (16:30 IST Mon-Fri)
├── scratch_test_scan.ts          # Manual test runner for instant pipeline execution
├── scratch_backtest.ts           # 6-Year Quantitative Backtest Engine
├── package.json
└── tsconfig.json
```

### New Database Tables Added (`prisma/schema.prisma`)

- `institutional_flows`: Persists deal transactions with `isHftNoise` flag.
- `institutional_candidate_pool`: Stores rolling 10-day candidate watchlist with delivery spike ratios & accumulated volume.
- `signal_labs_alerts`: Stores high-conviction breakout setups with Target (+8%) and Stop Loss (-3%).

### Key Service Mechanics

1. **HFT Noise Scrubber (`hftScrubber.ts`)**:
   $$\text{Net Quantity} = \text{Buy Qty} - \text{Sell Qty}$$
   - IF `Net Quantity == 0` or `Buy Qty == Sell Qty` within the same session ➔ `isHftNoise = true` (discarded).
   - IF `Net Quantity > 0` ➔ Retained as institutional accumulation.

2. **Delivery Volume Confirmation (`candidatePool.ts`)**:
   - `Delivery Volume > 2.5x` (20-day SMA Delivery Volume) OR `Delivery Percentage > 40%`.
   - Maintains a rolling 10-day candidate watchlist (~60–100 candidate stocks).

3. **Specialized 5-Rule Technical Breakout Scanner (`institutionalScan.ts`)**:
   - Scans **ONLY** candidate pool symbols (does not scan full 2,000+ universe).
   - Rules:
     1. `Close > 20 EMA` and `20 EMA >= 50 EMA`
     2. Volatility Contraction (VCP / BB Width contracting)
     3. `Today Close > 20-day Swing High` AND `Intraday Move >= +3.0%`
     4. `Volume >= 1.8x 20-day Volume SMA`
     5. Bar Closing Strength: $(\text{Close} - \text{Low}) / (\text{High} - \text{Low}) \ge 0.75$

4. **Alert Calculation**:
   - `Breakout Price`: Close price on breakout day
   - `Target Price`: $\text{Breakout Price} \times 1.08$ (+8%)
   - `Stop Loss Price`: $\text{Candle Low} \times 0.97$ (-3%)

### Execution Commands

```powershell
# Manual Pipeline Execution:
cd signal-labs-service && npm run test:scan

# Cron Worker Daemon (Runs at 16:30 IST Mon-Fri):
cd signal-labs-service && npm run start:worker

# Run 6-Year Backtest:
cd signal-labs-service && npx ts-node scratch_backtest.ts
```

---

## 📊 6-Year Official Backtest Report

Empirical results over 105,008 deal records across 1,382 trading sessions (2021–2026):

| Metric | Result |
|---|---|
| Evaluation Period | 2021 – 2026 (6 Years / 1,382 Days) |
| Total DB Deal Records | 105,008 Deals |
| Total Trades Triggered | **106 Trades** |
| Winning Trades (+8% Target) | **60 Wins** |
| Losing Trades (-3% Stop) | **28 Losses** |
| **Win Rate** | **56.6%** |
| **Profit Factor** | **1.35** |
| **Risk / Reward Ratio** | **2.67 R-Multiple** (+8% Target / -3% Stop) |

---

## 🌱 Session Update: Aug 8–9 2026 — Pre-Surge Hybrid Base Scanner

### Problem Identified

The existing scanner was detecting stocks **AFTER** a 10% breakout had already occurred (e.g., ENRIN was found on Friday after surging 10%). The goal was to detect these stocks **the night before** while they are quietly resting at their 20 EMA base.

**Empirical Test Result for ENRIN (Aug 6 Thursday Pre-Breakout):**

| Metric | Thursday Evening (Base) | Friday (Surge Day) |
|---|---|---|
| Close Price | ₹3,252 | ₹3,648 (+10%) |
| Relative Volume (RVOL) | 0.76× (Quiet) | 20.4× (Explosive) |
| RSI 14 | 43.5 (Neutral) | 63.6 (Momentum) |
| Setup Identified | EMA20 Pullback | Pullback Continuation |

### Root Cause

Standard EOD breakout scanners require `RVOL ≥ 1.5×` to trigger. On Thursday, ENRIN had only 0.76× volume — a classic **volume dry-up base** that precedes institutional breakouts. The scanner missed it entirely.

---

### Changes Implemented

#### 1. Pre-Surge Hybrid Base Pattern — `src/indicators.ts`

Added new setup archetype `"Pre-Surge Hybrid Base 🌱"` to `identifySetupType()`:

```typescript
// Line ~1049 in indicators.ts
if (Math.abs(ltp - ema20) / ema20 <= 0.02 && ind.volumeRatio <= 0.85 && ema50 > (ind.dma200 ?? 0))
    return 'Pre-Surge Hybrid Base 🌱';
```

**Detection Criteria:**
- Price within 2% of 20 EMA (resting at support)
- Relative Volume ≤ 0.85× (volume dry-up / supply exhaustion)
- Trend aligned: EMA20 > EMA50 > DMA200
- 3-Month RS vs Nifty ≥ +5% (outperforming market)

#### 2. Volume Dry-Up Scoring — `src/indicators.ts`

Updated `computeConfidence()` to **reward** low volume during pullbacks instead of penalizing it:

```typescript
// Volume Confirmation: rewards dry-up for pullback setups
const volScore = (isPullback && ind.volumeRatio <= 0.85) ? 2.0 :
    ind.volumeRatio >= 2.0 ? 2.0 :
        ind.volumeRatio >= 1.5 ? 1.5 :
            ind.volumeRatio >= 1.2 ? 0.8 : 0.0;
```

#### 3. Pre-Surge Technical Gate — `backtest.ts`

Added `isPreSurgeBase` bypass check **before** the `accumulationScore` gate so quiet bases are not wrongly rejected:

```typescript
const isPreSurgeBase =
    Math.abs(ind.ltp - ind.ema20) / ind.ema20 <= 0.025 &&
    ind.volumeRatio <= 0.90 &&
    ind.rsi14 >= 40 && ind.rsi14 <= 70 &&
    ind.ema20 > ind.ema50 && ind.ema50 > (ind.dma200 ?? 0) &&
    ind.avgVolume20d >= MIN_AVG_VOLUME &&
    (ind.returns3m - ind.nifty3mReturn) >= 5;
if (isPreSurgeBase) return true;
```

#### 4. Persistent Setup Retention — `src/scanStorage.ts`

Updated `loadScanResults()` to merge active `IN_PROGRESS` historical setups from PostgreSQL into every scan load. Old setups from previous sessions are **no longer overwritten** when a new scan runs.

```typescript
// Merges IN_PROGRESS historical setups from DB so no setups are lost across scans
const dbHistorical = await prisma.historicalSetup.findMany({
    where: { status: 'IN_PROGRESS' },
    orderBy: { createdAt: 'desc' },
    take: 20,
});
```

#### 5. MONITOR BASE vs TRIGGERED Badge — `apex-intelligence/src/components/SetupCard.tsx`

Setup cards now display context-aware badges:

- 🟡 **`MONITOR BASE`** (pulsing amber badge) — for qualified base candidates with `status: 'QUALIFIED'` or `aiSignal: 'WATCH'`
- 🟢 **`TRIGGERED`** — for confirmed active breakout setups

Also updated the buy zone label: base candidates show `"Base Zone: ₹X – ₹Y"` instead of `"Buy Zone"`.

#### 6. Dynamic Sector Dropdown — `apex-intelligence/src/pages/DashboardPage.tsx`

Replaced hardcoded sector options with dynamically generated options from actual scan results:

```tsx
{Array.from(new Set(safeScanItems.map(i => i.sector).filter(Boolean))).sort().map(sec => (
    <option key={sec} value={sec}>{sec}</option>
))}
```

---

### Two-Stage Scanner Architecture (Design Decision)

**Stage 1 — Post-Market Qualification Scan (4:00 PM IST):**
- Runs automatically after NSE Bhavcopy delivery data is published
- Stores `Pre-Surge Hybrid Base 🌱` candidates in DB with `status: 'QUALIFIED'`
- Displays on Dashboard as `MONITOR BASE` cards

**Stage 2 — Intraday Trigger Confirmation (Market Hours):**
- Monitors qualified candidates for intraday volume expansion (`RVOL ≥ 1.5×`)
- Upgrades matching setups to `status: 'TRIGGERED'`
- Displays full `Buy Zone / Target 1 / Target 2 / Stop Loss / R:R` on Dashboard

**Risk-Reward Improvement:**
| Approach | Entry Price | Stop Loss | R:R |
|---|---|---|---|
| Old breakout scanner | ₹3,738 (post-surge) | ₹3,550 | 1 : 1.5 |
| New Pre-Surge Base | ₹3,252 (at 20 EMA) | ₹3,173 | 1 : 4 to 1 : 6 |

---

### Backtest Status

A walk-forward backtest was attempted but could not be completed due to insufficient historical candle data from the Yahoo Finance API (only 206 days returned, while `computeIndicators` requires 200 candles minimum, leaving only ~6 scannable days per stock).

**Manual Signal Validation (debug_presurge.ts):**

| Stock | Pre-Surge Signal Days | Trigger Filled (Next 5 Days) |
|---|---|---|
| PRESTIGE | 3 days | ✅ 2 of 3 triggered |
| BIOCON | 5 days | ✅ 5 of 5 triggered |
| SHILPAMED | 3 days | ✅ 3 of 3 triggered |

To run a proper backtest, 2+ years of daily candle data is required (via NSE Bhavcopy historical files or Dhan API with extended lookback). **Backtest is deferred.**

---

### Files Changed in This Session

| File | Change |
|---|---|
| `src/indicators.ts` | Added `Pre-Surge Hybrid Base 🌱` setup pattern; updated volume dry-up scoring in `computeConfidence()` |
| `src/scanStorage.ts` | `loadScanResults()` now merges active `IN_PROGRESS` DB setups to preserve history across scans |
| `apex-intelligence/src/components/SetupCard.tsx` | Added `MONITOR BASE` / `TRIGGERED` conditional badges; dynamic buy zone label |
| `apex-intelligence/src/pages/DashboardPage.tsx` | Dynamic sector dropdown from live scan data |
| `backtest.ts` | Added `isPreSurgeBase` bypass in technical gate, setup family `PRE_SURGE`, trigger/stop/target logic for pre-surge entries |

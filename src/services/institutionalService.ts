import axios from 'axios';
import { parse as parseCsv } from 'csv-parse/sync';
import prisma from '../prismaClient';

export interface ParsedDeal {
  tradeDate: Date;
  symbol: string;
  companyName: string;
  clientName: string;
  dealType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValueCr: number;
  remarks: string;
  entityType: 'FII' | 'DII' | 'PROMOTER' | 'HNI' | 'ARBITRAGE' | 'OTHER';
}

function parseTradeDate(value: string): Date | null {
  const raw = value.trim();
  const nseDate = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (nseDate) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(nseDate[2].toLowerCase());
    if (month >= 0) return new Date(Date.UTC(Number(nseDate[3]), month, Number(nseDate[1])));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Parse quoted CSV fields correctly; institution names can contain commas. */
export function parseNseBulkDealsCsv(csvText: string): ParsedDeal[] {
  const rows = parseCsv(csvText, {
    bom: true,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as string[][];

  return rows.slice(1).flatMap((parts): ParsedDeal[] => {
    if (parts.length < 7) return [];
    const [dateStr, symbolRaw, companyNameRaw, clientNameRaw, dealTypeRaw, quantityRaw, priceRaw, remarksRaw = ''] = parts;
    const symbol = String(symbolRaw || '').trim().toUpperCase();
    const companyName = String(companyNameRaw || '').trim();
    const clientName = String(clientNameRaw || '').trim();
    const quantity = Number.parseInt(String(quantityRaw || '').replace(/,/g, ''), 10);
    const price = Number.parseFloat(String(priceRaw || '').replace(/,/g, ''));
    const tradeDate = parseTradeDate(String(dateStr || ''));

    if (!tradeDate || !symbol || !clientName || !Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price <= 0) {
      return [];
    }

    const dealType: 'BUY' | 'SELL' = String(dealTypeRaw || '').toUpperCase().startsWith('SELL') ? 'SELL' : 'BUY';
    return [{
      tradeDate,
      symbol,
      companyName,
      clientName,
      dealType,
      quantity,
      price: Math.round(price * 100) / 100,
      totalValueCr: Math.round(((quantity * price) / 10_000_000) * 100) / 100,
      remarks: String(remarksRaw || '').trim(),
      entityType: classifyEntity(clientName),
    }];
  });
}

/**
 * RegEx Classifier for Client / Institution Names
 */
export function classifyEntity(clientName: string): 'FII' | 'DII' | 'PROMOTER' | 'HNI' | 'ARBITRAGE' | 'OTHER' {
  const name = clientName.toUpperCase();

  // Arbitrage / HFT desks
  if (/ARBITRAGE|QUANT|TOWER|JANE STREET|OPTIVER|GRAVITON|JUMP TRADING|ALGO/i.test(name)) {
    return 'ARBITRAGE';
  }

  // Domestic Mutual Funds & Insurers (DII)
  if (/MUTUAL FUND| MF |HDFC|SBI|ICICI|NIPPON|KOTAK|AXIS|BIRLA|UTI|DSP|TATA|MOTILAL|MIRAE|SUNDARAM|CANARA|BANDHAN|EDELWEISS|LIC|LIFE INSURANCE|INSURANCE/i.test(name)) {
    return 'DII';
  }

  // Foreign Institutional Investors (FII / FPI)
  if (/MORGAN STANLEY|GOLDMAN|SOCIETE GENERALE|CITIGROUP|BOFA|MERRILL|NORGES|NOMURA|UBS|CREDIT SUISSE|VANGUARD|BLACKROCK|FIDELITY|SINGAPORE|GIC|CPPIB|ABU DHABI|HSBC|MARSHALL WACE|BADAWI|FPI|FOREIGN|MAURITIUS|CAYMAN/i.test(name)) {
    return 'FII';
  }

  // Promoters & Insiders
  if (/PROMOTER|TRUST|HOLDINGS PVT|LIMITED PARTNERSHIP|FOUNDER|MANAGEMENT|DIRECTOR/i.test(name)) {
    return 'PROMOTER';
  }

  // High Net-Worth Individuals / Capital Firms
  if (/CAPITAL|VENTURES|INVESTMENTS|FINANCE|PARTNERS|SECURITIES|BROKING|TRADING/i.test(name)) {
    return 'HNI';
  }

  return 'OTHER';
}

/**
 * Fetch and Parse NSE Daily Bulk Deals CSV archive
 */
export async function syncNseDailyBulkDeals(): Promise<{ success: boolean; count: number; date?: string; message?: string }> {
  try {
    console.log('[Institutional Engine] Fetching NSE daily bulk deals archive...');
    const url = 'https://archives.nseindia.com/content/equities/bulk.csv';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      timeout: 10000,
    });

    if (response.status !== 200 || !response.data) {
      throw new Error(`Invalid response from NSE Archive: HTTP ${response.status}`);
    }

    const rawDeals = parseNseBulkDealsCsv(String(response.data));

    if (rawDeals.length === 0) {
      return { success: true, count: 0, message: 'Parsed 0 valid deals.' };
    }

    // Persist into the configured database via Prisma.
    let insertedCount = 0;
    const latestTradeDate = rawDeals[0].tradeDate;

    for (const deal of rawDeals) {
      // Avoid duplicate insert by checking symbol + client + qty + price + dealType
      const existing = await prisma.institutionalDeal.findFirst({
        where: {
          symbol: deal.symbol,
          clientName: deal.clientName,
          quantity: deal.quantity,
          dealType: deal.dealType,
          tradeDate: deal.tradeDate,
        },
      });

      if (!existing) {
        await prisma.institutionalDeal.create({
          data: {
            symbol: deal.symbol,
            companyName: deal.companyName,
            clientName: deal.clientName,
            entityType: deal.entityType,
            dealType: deal.dealType,
            quantity: deal.quantity,
            price: deal.price,
            totalValue: deal.totalValueCr,
            remarks: deal.remarks,
            tradeDate: deal.tradeDate,
          },
        });
        insertedCount++;
      }
    }

    // Recalculate Confluence Signals
    await updateInstitutionalConfluences(latestTradeDate);

    console.log(`[Institutional Engine] Successfully synced ${insertedCount} new deals for ${latestTradeDate.toISOString().split('T')[0]}`);
    return {
      success: true,
      count: insertedCount,
      date: latestTradeDate.toISOString().split('T')[0],
      message: `Synced ${insertedCount} deals successfully.`,
    };
  } catch (error: any) {
    console.error('[Institutional Engine] Error syncing bulk deals:', error.message);
    return { success: false, count: 0, message: error.message };
  }
}

// ─── HISTORICAL BACKFILL ────────────────────────────────────────────────────

const NSE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a Date as the NSE archive filename suffix: DD-Mon-YYYY */
function toNseDateSuffix(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mon = NSE_MONTHS[date.getUTCMonth()];
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

/** Generate all Mon–Fri UTC dates going back daysBack calendar days from today. */
function getTradingDays(daysBack: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  // Start from yesterday to avoid a partial current-day file
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days; // newest first
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface BackfillResult {
  success: boolean;
  daysProcessed: number;
  daysSkipped: number;   // already in DB
  daysEmpty: number;     // 404 / no data (holidays)
  daysErrored: number;
  totalInserted: number;
  message: string;
}

/**
 * One-time (or idempotent) historical backfill.
 * Downloads bulk_DD-Mon-YYYY.csv from NSE archives for every Mon-Fri
 * going back `daysBack` calendar days. Already-stored dates are skipped.
 *
 * Safe to re-run — per-date dedup prevents double inserts.
 * Rate-limited to 1 request per 1.2 seconds to avoid NSE rate limiting.
 */
export async function backfillNseBulkDeals(
  daysBack = 730,
  onProgress?: (msg: string) => void,
): Promise<BackfillResult> {
  const log = (msg: string) => {
    console.log(msg);
    onProgress?.(msg);
  };

  const tradingDays = getTradingDays(Math.min(daysBack, 730));
  log(`[Backfill] Starting backfill for ${tradingDays.length} potential trading days (${daysBack} calendar days back)`);

  let daysProcessed = 0;
  let daysSkipped = 0;
  let daysEmpty = 0;
  let daysErrored = 0;
  let totalInserted = 0;

  for (const date of tradingDays) {
    const suffix = toNseDateSuffix(date);

    // ── 1. Check if we already have data for this date ──────────────────────
    const existingCount = await prisma.institutionalDeal.count({
      where: { tradeDate: date },
    });

    if (existingCount > 0) {
      daysSkipped++;
      continue;
    }

    // ── 2. Download from NSE archives ────────────────────────────────────────
    const url = `https://archives.nseindia.com/content/equities/bulk_${suffix}.csv`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/csv,*/*',
          'Referer': 'https://www.nseindia.com/',
        },
        timeout: 15000,
        validateStatus: (s) => s < 500,
      });

      // 404 = holiday / non-trading day — skip silently
      if (response.status === 404 || !response.data) {
        daysEmpty++;
        await sleep(400);
        continue;
      }

      if (response.status !== 200) {
        log(`[Backfill] ${suffix} — HTTP ${response.status}, skipping`);
        daysErrored++;
        await sleep(800);
        continue;
      }

      // ── 3. Parse ────────────────────────────────────────────────────────────
      const rawDeals = parseNseBulkDealsCsv(String(response.data));

      if (rawDeals.length === 0) {
        daysEmpty++;
        await sleep(400);
        continue;
      }

      // ── 4. Batch insert (all deals for this date) ───────────────────────────
      const result = await prisma.institutionalDeal.createMany({
        data: rawDeals.map(deal => ({
          symbol: deal.symbol,
          companyName: deal.companyName,
          clientName: deal.clientName,
          entityType: deal.entityType,
          dealType: deal.dealType,
          quantity: deal.quantity,
          price: deal.price,
          totalValue: deal.totalValueCr,
          remarks: deal.remarks,
          tradeDate: deal.tradeDate,
        })),
        skipDuplicates: true,
      });

      totalInserted += result.count;
      daysProcessed++;
      log(`[Backfill] ${suffix} — inserted ${result.count} deals (${rawDeals.length} parsed)`);

    } catch (err: any) {
      if (err?.response?.status === 404 || err?.code === 'ERR_BAD_REQUEST') {
        daysEmpty++;
      } else {
        log(`[Backfill] ${suffix} — error: ${err?.message ?? err}`);
        daysErrored++;
      }
    }

    // ── Rate limit: 1.2 sec between requests ──────────────────────────────────
    await sleep(1200);
  }

  // ── 5. Recompute confluence signals with the full new dataset ───────────────
  if (totalInserted > 0) {
    log('[Backfill] Recomputing confluence signals...');
    await updateInstitutionalConfluences(new Date());
  }

  const message =
    `Backfill complete. Processed: ${daysProcessed}, Skipped (already stored): ${daysSkipped}, ` +
    `Empty/holidays: ${daysEmpty}, Errors: ${daysErrored}, Total rows inserted: ${totalInserted}`;

  log(`[Backfill] ${message}`);
  return { success: true, daysProcessed, daysSkipped, daysEmpty, daysErrored, totalInserted, message };
}


/**
 * Compute Confluence Signals combining institutional buying and technical parameters
 */
export async function updateInstitutionalConfluences(tradeDate: Date) {
  try {
    const deals = await prisma.institutionalDeal.findMany({
      where: {
        tradeDate: {
          gte: new Date(tradeDate.getTime() - 24 * 60 * 60 * 1000 * 30), // Last 30 days
        },
      },
    });

    // Group net FII and DII buying by symbol
    const symbolMap: Record<string, { companyName: string; fiiBuy: number; diiBuy: number }> = {};

    for (const deal of deals) {
      if (!symbolMap[deal.symbol]) {
        symbolMap[deal.symbol] = { companyName: deal.companyName, fiiBuy: 0, diiBuy: 0 };
      }

      const val = deal.dealType === 'BUY' ? deal.totalValue : -deal.totalValue;

      if (deal.entityType === 'FII') {
        symbolMap[deal.symbol].fiiBuy += val;
      } else if (deal.entityType === 'DII') {
        symbolMap[deal.symbol].diiBuy += val;
      }
    }

    // Upsert Confluence Scores
    for (const [symbol, data] of Object.entries(symbolMap)) {
      const netInstitutionalCr = data.fiiBuy + data.diiBuy;

      if (netInstitutionalCr <= 0) continue; // Only positive accumulation

      // Calculate score based on buying magnitude & multi-fund alignment
      let score = 50; // Base score for institutional buying
      if (netInstitutionalCr >= 5) score += 15;
      if (netInstitutionalCr >= 20) score += 15;
      if (data.fiiBuy > 0 && data.diiBuy > 0) score += 10; // Both FII & DII bought!

      const isSuperSignal = score >= 75 || netInstitutionalCr >= 10;

      await prisma.institutionalConfluence.upsert({
        where: { symbol },
        update: {
          netFiiBuyCr: Math.round(data.fiiBuy * 100) / 100,
          netDiiBuyCr: Math.round(data.diiBuy * 100) / 100,
          confluenceScore: Math.min(100, score),
          isSuperSignal,
          technicalPattern: 'INSTITUTIONAL_ACCUMULATION',
          tradeDate,
        },
        create: {
          symbol,
          companyName: data.companyName,
          netFiiBuyCr: Math.round(data.fiiBuy * 100) / 100,
          netDiiBuyCr: Math.round(data.diiBuy * 100) / 100,
          technicalPattern: 'INSTITUTIONAL_ACCUMULATION',
          confluenceScore: Math.min(100, score),
          isSuperSignal,
          tradeDate,
        },
      });
    }
  } catch (err: any) {
    console.error('[Institutional Engine] Error updating confluences:', err.message);
  }
}

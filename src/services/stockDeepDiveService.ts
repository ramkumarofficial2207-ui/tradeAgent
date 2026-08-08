import { fetchStockReport, StockReport } from '../fundamentalService';
import { getLiveQuoteSnapshots } from '../dataService';
import prisma from '../prismaClient';

export interface AiFundamentalAudit {
  score: number | null;
  grade: 'SAFE' | 'MODERATE' | 'HIGH_RISK' | 'UNAVAILABLE';
  badgeLabel: string;
  badgeColor: string;
  pros: string[];
  cons: string[];
  verdict: string;
}

export interface StockDeepDiveResponse {
  symbol: string;
  companyName: string;
  sector: string;
  price: {
    current: number;
    dayChange: number;
    dayChangePct: number;
    high52w: number | null;
    low52w: number | null;
    volumeRatio: number | null;
  };
  fundamentals: {
    peRatio: number | null;
    pbRatio: number | null;
    rocePct: number | null;
    roePct: number | null;
    debtToEquity: number | null;
    marketCapCr: number | null;
    promoterHoldingPct: number | null;
    fiiHoldingPct: number | null;
    diiHoldingPct: number | null;
  };
  technicals: {
    rsi14: number | null;
    ema20: number | null;
    ema50: number | null;
    dma200: number | null;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE';
  };
  institutionalDeals: Array<{
    id: string;
    clientName: string;
    entityType: string;
    dealType: string;
    quantity: number;
    price: number;
    totalValueCr: number;
    tradeDate: string;
  }>;
  aiAudit: AiFundamentalAudit;
}

/**
 * Compute AI Fundamental Audit Verdict (0-100 Score + Safety Grade)
 */
function auditFundamentals(report: StockReport | null): AiFundamentalAudit {
  if (!report) {
    return {
      score: null,
      grade: 'UNAVAILABLE',
      badgeLabel: 'Fundamental Data Unavailable',
      badgeColor: '#6B7280',
      pros: [],
      cons: ['No verified fundamental snapshot was returned.'],
      verdict: 'No fundamental verdict can be produced without sourced data.',
    };
  }

  let score = 70; // Base score
  const pros: string[] = [];
  const cons: string[] = [];

  // ROCE audit
  if (report.roce !== null) {
    if (report.roce >= 20) {
      score += 10;
      pros.push(`High Capital Efficiency: ROCE is ${report.roce}% (Above 20% benchmark).`);
    } else if (report.roce < 10) {
      score -= 10;
      cons.push(`Low Capital Return: ROCE is ${report.roce}% (Below 10% target).`);
    }
  }

  // Debt-to-Equity audit
  if (report.debtToEquity !== null) {
    if (report.debtToEquity <= 0.5) {
      score += 10;
      pros.push(`Strong Balance Sheet: Low Debt-to-Equity (${report.debtToEquity}).`);
    } else if (report.debtToEquity > 1.5) {
      score -= 15;
      cons.push(`High Financial Leverage: Debt-to-Equity is ${report.debtToEquity}.`);
    }
  }

  // Valuation audit (P/E)
  if (report.peRatio !== null && report.industryPe !== null) {
    if (report.peRatio < report.industryPe) {
      score += 5;
      pros.push(`Attractive Valuation: P/E (${report.peRatio.toFixed(1)}) trades below Industry average (${report.industryPe.toFixed(1)}).`);
    } else if (report.peRatio > report.industryPe * 1.8) {
      cons.push(`Valuation Premium: P/E (${report.peRatio.toFixed(1)}) is significantly above industry average.`);
    }
  }

  // Promoter Holding audit
  if (report.promoterHolding !== null) {
    if (report.promoterHolding >= 50) {
      score += 5;
      pros.push(`High Insiders Stake: Promoter holding is ${report.promoterHolding}%.`);
    } else if (report.promoterHolding < 25) {
      cons.push(`Low Promoter Ownership: Insiders hold only ${report.promoterHolding}%.`);
    }
  }

  // Bound score 0 - 100
  score = Math.max(10, Math.min(99, score));

  let grade: 'SAFE' | 'MODERATE' | 'HIGH_RISK' = 'MODERATE';
  let badgeLabel = '🟡 Moderate Quality';
  let badgeColor = '#F59E0B';

  if (score >= 75) {
    grade = 'SAFE';
    badgeLabel = '🟢 High Fundamental Safety';
    badgeColor = '#10B981';
  } else if (score < 50) {
    grade = 'HIGH_RISK';
    badgeLabel = '🔴 Fundamental Risk Warning';
    badgeColor = '#EF4444';
  }

  if (pros.length === 0) pros.push('No positive rule was confirmed by the available fields.');
  if (cons.length === 0) cons.push('No risk rule was confirmed by the available fields.');

  const verdict = grade === 'SAFE'
    ? 'Solid balance sheet with strong capital returns. Technical setups carry high institutional backing.'
    : grade === 'MODERATE'
    ? 'Fair fundamental quality. Trade with strict stop-loss adherence.'
    : 'Financial leverage or valuation warning flagged. Recommend smaller position sizing.';

  return {
    score,
    grade,
    badgeLabel,
    badgeColor,
    pros,
    cons,
    verdict,
  };
}

/**
 * 360° Stock Intelligence Master Aggregator (Zero Data Loss Protocol)
 */
export async function getStockDeepDive(symbolStr: string): Promise<StockDeepDiveResponse> {
  const symbol = symbolStr.toUpperCase().trim();

  // 1. Fetch Fundamentals via Screener / NSE Data Service (with zero-data-loss try/catch)
  let report: StockReport | null = null;
  try {
    report = await fetchStockReport(symbol);
  } catch (err: any) {
    console.warn(`[StockDeepDive] Fundamental fetch warning for ${symbol}:`, err.message);
  }

  // 2. Fetch Institutional Bulk Deals for this symbol from SQLite DB
  let dbDeals: any[] = [];
  try {
    dbDeals = await prisma.institutionalDeal.findMany({
      where: { symbol },
      orderBy: { tradeDate: 'desc' },
      take: 20,
    });
  } catch (err: any) {
    console.warn(`[StockDeepDive] DB deal fetch error for ${symbol}:`, err.message);
  }

  // 3. Fetch Technicals / Live Price
  let currentPrice = report?.currentPrice || 0;
  let dayChange = report?.dayChange || 0;
  let dayChangePct = report?.dayChangePct || 0;
  const high52w = report?.high52w ?? null;
  const low52w = report?.low52w ?? null;
  const rsi14 = report?.rsi14 ?? null;
  const ema20 = report?.ema20 ?? null;
  const ema50 = report?.ema50 ?? null;
  const dma200 = report?.dma200 ?? null;
  const volumeRatio = report?.volumeRatio ?? null;

  // Fallback to Live Market API if price is zero
  if (currentPrice === 0) {
    try {
      const quotes = await getLiveQuoteSnapshots([symbol]);
      if (quotes.length > 0) {
        currentPrice = quotes[0].price;
        dayChangePct = quotes[0].changePct;
      }
    } catch { }
  }

  const trend: StockDeepDiveResponse['technicals']['trend'] = currentPrice <= 0 || ema50 == null || dma200 == null
    ? 'UNAVAILABLE'
    : currentPrice >= ema50
      ? 'BULLISH'
      : currentPrice < dma200
        ? 'BEARISH'
        : 'NEUTRAL';

  // 4. Compute AI Fundamental Audit Verdict
  const aiAudit = auditFundamentals(report);

  return {
    symbol,
    companyName: report?.companyName || symbol,
    sector: report?.sector || 'Unavailable',
    price: {
      current: Math.round(currentPrice * 100) / 100,
      dayChange: Math.round(dayChange * 100) / 100,
      dayChangePct: Math.round(dayChangePct * 100) / 100,
      high52w: high52w == null ? null : Math.round(high52w * 100) / 100,
      low52w: low52w == null ? null : Math.round(low52w * 100) / 100,
      volumeRatio: volumeRatio == null ? null : Math.round(volumeRatio * 100) / 100,
    },
    fundamentals: {
      peRatio: report?.peRatio ?? null,
      pbRatio: report?.pbRatio ?? null,
      rocePct: report?.roce ?? null,
      roePct: report?.roe ?? null,
      debtToEquity: report?.debtToEquity ?? null,
      marketCapCr: report?.marketCapCr ?? null,
      promoterHoldingPct: report?.promoterHolding ?? null,
      fiiHoldingPct: null,
      diiHoldingPct: null,
    },
    technicals: {
      rsi14: rsi14 ? Math.round(rsi14 * 10) / 10 : null,
      ema20: ema20 ? Math.round(ema20 * 10) / 10 : null,
      ema50: ema50 ? Math.round(ema50 * 10) / 10 : null,
      dma200: dma200 ? Math.round(dma200 * 10) / 10 : null,
      trend,
    },
    institutionalDeals: dbDeals.map(d => ({
      id: d.id,
      clientName: d.clientName,
      entityType: d.entityType,
      dealType: d.dealType,
      quantity: d.quantity,
      price: d.price,
      totalValueCr: d.totalValue,
      tradeDate: d.tradeDate.toISOString().split('T')[0],
    })),
    aiAudit,
  };
}

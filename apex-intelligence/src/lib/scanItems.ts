import { CapCategory, ScanItem, ScanSetupStatus, SignalType } from '../types';

type RawScanSetup = Record<string, unknown>;

function numberOr(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function signalOr(value: unknown): SignalType | undefined {
  return value === 'BUY' || value === 'LIGHT BUY' || value === 'WATCH' || value === 'REJECT'
    ? value
    : undefined;
}

function statusOr(raw: RawScanSetup, aiSignal?: SignalType): ScanSetupStatus {
  if (raw.status === 'TRIGGERED' || raw.status === 'QUALIFIED' || raw.status === 'WATCHLIST') {
    return raw.status;
  }
  if (raw.isTriggered === true) return 'TRIGGERED';
  return aiSignal === 'WATCH' ? 'QUALIFIED' : 'WATCHLIST';
}

function capCategory(raw: RawScanSetup): CapCategory {
  if (raw.capCategory === 'LARGE' || raw.capCategory === 'MID' || raw.capCategory === 'SMALL') {
    return raw.capCategory;
  }
  const marketCapCr = optionalNumber(raw.marketCapCr);
  if (marketCapCr === undefined) return 'UNKNOWN';
  if (marketCapCr >= 20_000) return 'LARGE';
  if (marketCapCr >= 5_000) return 'MID';
  return 'SMALL';
}

function reasons(raw: RawScanSetup): string[] {
  if (Array.isArray(raw.aiReasons)) {
    const values = raw.aiReasons.filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0);
    if (values.length) return values;
  }

  return [raw.aiLogic, raw.catalyst, raw.newsSummary]
    .filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0);
}

/**
 * Converts the backend TradeSetup contract into the stable presentation model
 * used by all dashboard cards and trade modals.
 */
export function normalizeScanItems(value: unknown): ScanItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is RawScanSetup => Boolean(entry && typeof entry === 'object'))
    .map((raw, index) => {
      const ticker = String(raw.ticker || '').trim().toUpperCase();
      const ltp = numberOr(raw.ltp);
      const grounding = raw.marketGrounding && typeof raw.marketGrounding === 'object'
        ? raw.marketGrounding as RawScanSetup
        : {};
      const buyZone = numberOr(raw.buyZone, ltp);
      const target1 = numberOr(raw.target ?? raw.target1, ltp);
      const target2 = optionalNumber(raw.target2);
      const stopLoss = numberOr(raw.stopLoss, ltp);
      const aiSignal = signalOr(raw.aiSignal);

      return {
        id: String(raw.id || `${ticker || 'setup'}-${index}`),
        ticker,
        companyName: String(raw.companyName || ticker),
        sector: String(raw.sector || 'Diversified'),
        capCategory: capCategory(raw),
        setupType: String(raw.setupType || 'Market setup'),
        confidenceScore: numberOr(raw.confidenceScore),
        aiSignal,
        status: statusOr(raw, aiSignal),
        newsRisk: Boolean(raw.newsRisk),
        earningsRisk: Boolean(raw.earningsRisk),
        ltp,
        changePct: numberOr(raw.changePct ?? grounding.gapPct),
        buyZoneMin: buyZone,
        buyZoneMax: numberOr(raw.buyZoneMax, buyZone),
        target1,
        target1Pct: numberOr(raw.target1Pct ?? raw.targetPct),
        target2,
        target2Pct: optionalNumber(raw.target2Pct),
        stopLoss,
        stopLossPct: numberOr(raw.stopLossPct ?? raw.slPct),
        riskReward: numberOr(raw.riskReward),
        dma200: numberOr(raw.dma200 ?? grounding.dma200),
        ema50: numberOr(raw.ema50 ?? grounding.ema50),
        ema20: numberOr(raw.ema20 ?? grounding.ema20),
        rsi14: numberOr(raw.rsi14 ?? grounding.rsi14),
        adx14: numberOr(raw.adx14),
        volumeRatio: numberOr(raw.volumeRatio ?? grounding.volumeRatio),
        pctFrom52wHigh: numberOr(raw.pctFrom52wHigh),
        ichimokuBullish: Boolean(raw.ichimokuBullish),
        supertrendBullish: Boolean(raw.supertrendBullish),
        isSqueeze: Boolean(raw.isSqueeze),
        sparkline: Array.isArray(raw.sparkline)
          ? raw.sparkline.map(value => numberOr(value)).filter(value => value > 0)
          : [],
        aiReasons: reasons(raw),
      };
    })
    .filter(item => item.ticker.length > 0 && item.ltp > 0);
}

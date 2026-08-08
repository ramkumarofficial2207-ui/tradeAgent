import type { ScanItem } from '../types';

export interface BulkDealItem {
  id: string;
  symbol: string;
  clientName: string;
  entity: 'FII' | 'DII' | 'PROMOTER' | 'HNI' | 'ARBITRAGE' | 'OTHER';
  dealType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValueCr: number;
  tradeDate: string;
  exchange: 'NSE' | 'BSE';
}

export interface ConfluenceSignal {
  symbol: string;
  companyName: string;
  confluenceScore: number;
  fiiNetInflowCr: number;
  diiNetInflowCr: number;
  totalInflowCr: number;
  setupType: string;
  signalType: 'SUPER_BUY' | 'ACCUMULATION' | 'CONFLUENCE_HIGH';
  ltp: number;
  changePct: number;
  sector: string;
  institutionalTradeDate: string;
  scannerTimestamp: string;
  scannerConfidence: number;
  scannerSignal: string;
}

export interface InstitutionalConfluenceRecord {
  symbol?: string;
  ticker?: string;
  companyName?: string | null;
  confluenceScore?: number | string | null;
  netFiiBuyCr?: number | string | null;
  netDiiBuyCr?: number | string | null;
  tradeDate?: string | null;
}

export interface DailyFlow {
  date: string;
  fiiNetCr: number;
  diiNetCr: number;
  totalNetCr: number;
}

export interface MarketRegimeData {
  regime: 'BULLISH' | 'NEUTRAL' | 'RISK_OFF' | 'UNAVAILABLE';
  positionSizingMultiplier: string;
  dmaCrossPct: number | null;
  detail: string;
  niftyValue: number;
  bankNiftyValue: number;
  sensexValue: number;
  activeSignalsCount: number;
  vixValue: number;
  lastUpdated: string;
  scanTimestamp: string;
  scanIsStale: boolean;
  marketIsOpen: boolean;
  marketLabel: string;
  nextMarketEvent: string;
  indexSource: string;
}

export const INITIAL_BULK_DEALS: BulkDealItem[] = [];
export const INITIAL_CONFLUENCE_SIGNALS: ConfluenceSignal[] = [];
export const INITIAL_DAILY_FLOWS: DailyFlow[] = [];
export const INITIAL_REGIME_DATA: MarketRegimeData = {
  regime: 'UNAVAILABLE',
  positionSizingMultiplier: 'Unavailable',
  dmaCrossPct: null,
  detail: 'No completed market scan is available.',
  niftyValue: 0,
  bankNiftyValue: 0,
  sensexValue: 0,
  activeSignalsCount: 0,
  vixValue: 0,
  lastUpdated: '',
  scanTimestamp: '',
  scanIsStale: true,
  marketIsOpen: false,
  marketLabel: 'Unavailable',
  nextMarketEvent: '',
  indexSource: 'unavailable',
};

const asNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const timestampIsFresh = (value: string | null | undefined, nowMs: number, maxAgeMs: number): boolean => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= nowMs && nowMs - timestamp <= maxAgeMs;
};

/**
 * A stock-level candidate must have both a recent positive institutional
 * accumulation record and a recent scanner BUY/LIGHT BUY setup. Macro FII/DII
 * totals are deliberately not used to infer which individual stocks were
 * purchased.
 */
export function buildQualifiedConfluenceSignals(
  records: InstitutionalConfluenceRecord[],
  scanItems: ScanItem[],
  scanTimestamp: string | null | undefined,
  nowMs = Date.now(),
): ConfluenceSignal[] {
  const scanIsFresh = timestampIsFresh(scanTimestamp, nowMs, 96 * 60 * 60 * 1000);
  if (!scanIsFresh) return [];

  const scansByTicker = new Map(
    scanItems
      .filter((item) => {
        const signal = String(item.aiSignal || '').toUpperCase();
        return (signal === 'BUY' || signal === 'LIGHT BUY') && asNumber(item.confidenceScore) >= 7;
      })
      .map((item) => [String(item.ticker || '').toUpperCase(), item]),
  );

  return records
    .filter((record) => timestampIsFresh(record.tradeDate, nowMs, 10 * 24 * 60 * 60 * 1000))
    .map((record): ConfluenceSignal | null => {
      const symbol = String(record.symbol || record.ticker || '').toUpperCase();
      const scan = scansByTicker.get(symbol);
      const fiiNetInflowCr = asNumber(record.netFiiBuyCr);
      const diiNetInflowCr = asNumber(record.netDiiBuyCr);
      const totalInflowCr = fiiNetInflowCr + diiNetInflowCr;
      if (!scan || totalInflowCr <= 0) return null;

      const institutionalScore = Math.max(0, Math.min(100, asNumber(record.confluenceScore)));
      const scannerScore = Math.max(0, Math.min(100, asNumber(scan.confidenceScore) * 10));
      const combinedScore = Math.round((institutionalScore + scannerScore) / 2);

      return {
        symbol,
        companyName: record.companyName || scan.companyName || symbol,
        confluenceScore: combinedScore,
        fiiNetInflowCr,
        diiNetInflowCr,
        totalInflowCr,
        setupType: scan.setupType || 'Qualified scanner setup',
        signalType: combinedScore >= 75 ? 'SUPER_BUY' : 'CONFLUENCE_HIGH',
        ltp: asNumber(scan.ltp),
        changePct: asNumber(scan.changePct),
        sector: scan.sector || 'Unavailable',
        institutionalTradeDate: String(record.tradeDate || ''),
        scannerTimestamp: String(scanTimestamp || ''),
        scannerConfidence: asNumber(scan.confidenceScore),
        scannerSignal: String(scan.aiSignal || ''),
      };
    })
    .filter((signal): signal is ConfluenceSignal => Boolean(signal))
    .sort((a, b) => b.confluenceScore - a.confluenceScore || b.totalInflowCr - a.totalInflowCr);
}


import { describe, expect, it } from 'vitest';
import {
  buildQualifiedConfluenceSignals,
  InstitutionalConfluenceRecord,
} from '../apex-intelligence/src/data/institutionalData';
import type { ScanItem } from '../apex-intelligence/src/types';
import { parseNseBulkDealsCsv } from '../src/services/institutionalService';

function scannerSetup(overrides: Partial<ScanItem> = {}): ScanItem {
  return {
    id: 'scan-1',
    ticker: 'RELIANCE',
    companyName: 'Reliance Industries',
    sector: 'Energy',
    capCategory: 'LARGE',
    setupType: 'Breakout',
    confidenceScore: 8,
    aiSignal: 'BUY',
    ltp: 1500,
    changePct: 1.2,
    buyZoneMin: 1490,
    buyZoneMax: 1510,
    target1: 1600,
    target1Pct: 6.67,
    stopLoss: 1450,
    stopLossPct: 3.33,
    riskReward: 2,
    dma200: 1300,
    ema50: 1450,
    ema20: 1480,
    rsi14: 62,
    adx14: 25,
    volumeRatio: 1.8,
    pctFrom52wHigh: -3,
    ichimokuBullish: true,
    supertrendBullish: true,
    isSqueeze: false,
    sparkline: [],
    aiReasons: [],
    ...overrides,
  };
}

describe('Signal Labs institutional candidate rules', () => {
  const now = Date.parse('2026-08-03T10:00:00+05:30');
  const recentRecord: InstitutionalConfluenceRecord = {
    symbol: 'RELIANCE',
    companyName: 'Reliance Industries',
    confluenceScore: 80,
    netFiiBuyCr: 12,
    netDiiBuyCr: 3,
    tradeDate: '2026-07-31T00:00:00.000Z',
  };

  it('shows a candidate only when recent institutional accumulation matches a qualified scanner buy', () => {
    const result = buildQualifiedConfluenceSignals(
      [recentRecord],
      [scannerSetup()],
      '2026-08-03T09:45:00+05:30',
      now,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      symbol: 'RELIANCE',
      totalInflowCr: 15,
      setupType: 'Breakout',
      scannerConfidence: 8,
    });
  });

  it('does not turn WATCH setups, unmatched symbols, negative flow, or stale scans into candidates', () => {
    expect(buildQualifiedConfluenceSignals(
      [recentRecord],
      [scannerSetup({ aiSignal: 'WATCH' })],
      '2026-08-03T09:45:00+05:30',
      now,
    )).toEqual([]);

    expect(buildQualifiedConfluenceSignals(
      [{ ...recentRecord, symbol: 'TCS' }],
      [scannerSetup()],
      '2026-08-03T09:45:00+05:30',
      now,
    )).toEqual([]);

    expect(buildQualifiedConfluenceSignals(
      [{ ...recentRecord, netFiiBuyCr: -10, netDiiBuyCr: 1 }],
      [scannerSetup()],
      '2026-08-03T09:45:00+05:30',
      now,
    )).toEqual([]);

    expect(buildQualifiedConfluenceSignals(
      [recentRecord],
      [scannerSetup()],
      '2026-07-25T09:45:00+05:30',
      now,
    )).toEqual([]);
  });
});

describe('NSE bulk-deal CSV parser', () => {
  it('keeps quoted commas inside names and parses formatted numbers safely', () => {
    const csv = [
      'Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price,Remarks',
      '31-JUL-2026,RELIANCE,"Reliance Industries, Limited","Morgan Stanley Asia, Fund",BUY,"1,000","1,234.50",BULK',
    ].join('\n');

    const deals = parseNseBulkDealsCsv(csv);

    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      symbol: 'RELIANCE',
      companyName: 'Reliance Industries, Limited',
      clientName: 'Morgan Stanley Asia, Fund',
      dealType: 'BUY',
      quantity: 1000,
      price: 1234.5,
      totalValueCr: 0.12,
      entityType: 'FII',
    });
    expect(deals[0].tradeDate.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('rejects malformed rows instead of storing misleading zero-value deals', () => {
    const csv = [
      'Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price,Remarks',
      'BAD-DATE,ABC,ABC Ltd,Unknown Client,BUY,not-a-number,100,BULK',
    ].join('\n');

    expect(parseNseBulkDealsCsv(csv)).toEqual([]);
  });
});

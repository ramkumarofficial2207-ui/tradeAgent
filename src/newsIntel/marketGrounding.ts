import { NSE_UNIVERSE, SECTOR_MAP, fetchHistoricalData } from '../dataService';
import { StockReport } from '../fundamentalService';
import {
    MarketGroundingContext,
    MarketStatus,
    ScanResult,
    ScannerSetupContext,
    SectorBreadthSnapshot,
    StockIndicators,
    TradeSetup,
} from '../types';

function round(value: number | null | undefined, digits = 2): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return +value.toFixed(digits);
}

function buildScannerSetupContext(setup: TradeSetup | null): ScannerSetupContext | null {
    if (!setup) return null;
    return {
        setupType: setup.setupType,
        confidenceScore: setup.confidenceScore,
        aiSignal: setup.aiSignal ?? null,
        riskReward: setup.riskReward,
        targetPct: setup.targetPct,
        slPct: setup.slPct,
    };
}

export function buildSectorBreadthMap(
    qualified: StockIndicators[],
    setups: TradeSetup[] = []
): Record<string, SectorBreadthSnapshot> {
    const sectorQualified = new Map<string, StockIndicators[]>();
    const sectorSetups = new Map<string, TradeSetup[]>();

    for (const indicator of qualified) {
        const sector = SECTOR_MAP[indicator.ticker] ?? 'Diversified';
        const list = sectorQualified.get(sector) ?? [];
        list.push(indicator);
        sectorQualified.set(sector, list);
    }

    for (const setup of setups) {
        const sector = setup.sector || 'Diversified';
        const list = sectorSetups.get(sector) ?? [];
        list.push(setup);
        sectorSetups.set(sector, list);
    }

    const sectors = new Set<string>([
        ...Array.from(sectorQualified.keys()),
        ...Array.from(sectorSetups.keys()),
    ]);

    const out: Record<string, SectorBreadthSnapshot> = {};

    for (const sector of sectors) {
        const qualifiedList = sectorQualified.get(sector) ?? [];
        const setupsList = sectorSetups.get(sector) ?? [];
        const advancingCount = qualifiedList.filter(indicator =>
            indicator.returns10d > 0 || indicator.ltp > indicator.ema20
        ).length;
        const advancingRatio = qualifiedList.length ? advancingCount / qualifiedList.length : 0;
        const setupDensity = qualifiedList.length
            ? Math.min(1, setupsList.length / qualifiedList.length)
            : Math.min(1, setupsList.length / 3);
        const breadthScore = round((advancingRatio * 0.7) + (setupDensity * 0.3), 2) ?? 0;

        out[sector] = {
            sector,
            qualifiedCount: qualifiedList.length,
            setupCount: setupsList.length,
            advancingRatio: round(advancingRatio, 2) ?? 0,
            breadthScore,
        };
    }

    return out;
}

function deriveRegime(marketStatus?: MarketStatus | null): string | null {
    return marketStatus?.regime ?? null;
}

export function buildMarketGroundingFromIndicator(
    indicator: StockIndicators,
    setup: TradeSetup | null,
    marketStatus?: MarketStatus | null,
    sectorBreadth?: SectorBreadthSnapshot | null
): MarketGroundingContext {
    const latest = indicator.candles[indicator.candles.length - 1];
    const previous = indicator.candles[indicator.candles.length - 2];
    const gapPct = latest && previous?.close
        ? round(((latest.open - previous.close) / previous.close) * 100)
        : null;

    return {
        price: round(indicator.ltp),
        gapPct,
        dayHigh: round(latest?.high),
        dayLow: round(latest?.low),
        volumeRatio: round(indicator.volumeRatio),
        rsi14: round(indicator.rsi14, 1),
        ema20: round(indicator.ema20),
        ema50: round(indicator.ema50),
        dma200: round(indicator.dma200),
        scannerSetup: buildScannerSetupContext(setup),
        regime: deriveRegime(marketStatus),
        sectorBreadth: sectorBreadth ?? null,
        confirmationStatus: 'UNAVAILABLE',
        confirmationScore: null,
        confirmationNotes: [],
    };
}

export async function buildMarketGroundingFromReport(
    report: StockReport | null,
    setup: TradeSetup | null,
    marketStatus?: MarketStatus | null,
    sectorBreadth?: SectorBreadthSnapshot | null
): Promise<MarketGroundingContext | null> {
    if (!report && !setup) return null;

    const ticker = report?.ticker ?? setup?.ticker;
    let gapPct: number | null = null;
    let dayHigh: number | null = null;
    let dayLow: number | null = null;

    if (ticker) {
        try {
            const yahoo = NSE_UNIVERSE[ticker] ?? `${ticker}.NS`;
            const candles = await fetchHistoricalData(yahoo, 5);
            const latest = candles[candles.length - 1];
            const previous = candles[candles.length - 2];
            gapPct = latest && previous?.close
                ? round(((latest.open - previous.close) / previous.close) * 100)
                : null;
            dayHigh = round(latest?.high);
            dayLow = round(latest?.low);
        } catch {
            gapPct = null;
        }
    }

    return {
        price: round(report?.currentPrice ?? setup?.ltp),
        gapPct,
        dayHigh: dayHigh ?? round(setup?.buyZone ?? report?.currentPrice),
        dayLow: dayLow ?? round(setup?.stopLoss),
        volumeRatio: round(report?.volumeRatio),
        rsi14: round(report?.rsi14, 1),
        ema20: round(report?.ema20),
        ema50: round(report?.ema50),
        dma200: round(report?.dma200),
        scannerSetup: buildScannerSetupContext(setup),
        regime: deriveRegime(marketStatus),
        sectorBreadth: sectorBreadth ?? null,
        confirmationStatus: 'UNAVAILABLE',
        confirmationScore: null,
        confirmationNotes: [],
    };
}

export function getSectorBreadthForTicker(
    ticker: string,
    scan: ScanResult | null
): SectorBreadthSnapshot | null {
    if (!scan?.sectorBreadth) return null;
    const sector = SECTOR_MAP[ticker] ?? scan.setups.find(item => item.ticker === ticker)?.sector;
    if (!sector) return null;
    return scan.sectorBreadth[sector] ?? null;
}

import fs from 'fs';
import path from 'path';
import prisma from './prismaClient';
import { trackHistoricalSetup } from './edgeAnalyticsService';
import { ScanResult } from './types';

type ScanMode = 'swing' | 'intraday';

const DATA_DIR = path.join(__dirname, '..', 'data');
const SWING_CACHE_FILE = path.join(DATA_DIR, 'last_scan.json');
const INTRADAY_CACHE_FILE = path.join(DATA_DIR, 'last_intraday_scan.json');

function getCacheFilePath(mode: ScanMode): string {
    return mode === 'intraday' ? INTRADAY_CACHE_FILE : SWING_CACHE_FILE;
}

export async function saveScanResults(scanResult: ScanResult, mode: ScanMode = 'swing'): Promise<void> {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const filePath = getCacheFilePath(mode);
        fs.writeFileSync(filePath, JSON.stringify(scanResult, null, 2), 'utf-8');
        console.log(`[Storage] Saved scan result cache to ${filePath}`);

        // Persist individual setups into PostgreSQL for performance tracking.
        if (scanResult.setups && scanResult.setups.length > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let savedCount = 0;
            for (const s of scanResult.setups) {
                // Upsert setups with valid signals into HistoricalSetup table
                const exists = await prisma.historicalSetup.findFirst({
                    where: {
                        ticker: s.ticker,
                        status: 'IN_PROGRESS',
                        createdAt: { gte: today },
                    },
                });

                if (!exists) {
                    const created = await prisma.historicalSetup.create({
                        data: {
                            ticker: s.ticker,
                            setupType: s.setupType || 'Breakout',
                            timeframe: s.timeframe || '1D',
                            aiSignal: s.aiSignal || 'WATCH',
                            confidenceScore: s.confidenceScore || 5.0,
                            entryPrice: s.buyZone || s.ltp,
                            targetPrice: s.target || s.ltp * 1.1,
                            stopLoss: s.stopLoss || s.ltp * 0.95,
                            aiLogic: s.aiLogic || s.catalyst || '',
                            status: 'IN_PROGRESS',
                        },
                    });

                    // Track in performance engine
                    await trackHistoricalSetup(created.id, s, scanResult.marketStatus?.regime || 'NEUTRAL').catch(err => {
                        console.error(`[Storage] Failed to track historical setup for ${s.ticker}:`, err?.message);
                    });

                    savedCount++;
                }
            }
            console.log(`[Storage] Successfully persisted ${savedCount} new setups to PostgreSQL.`);
        }
    } catch (err: any) {
        console.error('[Storage] Error saving scan results:', err?.message || err);
    }
}

export async function loadScanResults(mode: ScanMode = 'swing'): Promise<ScanResult | null> {
    let baseResult: ScanResult | null = null;
    try {
        const completed = await prisma.scanJob.findFirst({
            where: { mode, status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            select: { result: true },
        });
        const data = completed?.result as unknown as ScanResult | null;
        if (data && Array.isArray(data.setups)) {
            baseResult = data;
        }
    } catch (err: any) {
        console.warn('[Storage] Durable scan lookup unavailable:', err?.message || err);
    }

    if (!baseResult) {
        try {
            const filePath = getCacheFilePath(mode);
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8');
                const data: ScanResult = JSON.parse(raw);
                if (data && data.setups && Array.isArray(data.setups)) {
                    baseResult = data;
                }
            }
        } catch (err: any) {
            console.warn(`[Storage] Failed to read JSON scan cache:`, err?.message || err);
        }
    }

    if (!baseResult) return null;

    // Merge active IN_PROGRESS historical setups from PostgreSQL so old setups are retained across scans
    try {
        const dbHistorical = await prisma.historicalSetup.findMany({
            where: { status: 'IN_PROGRESS' },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        if (dbHistorical.length > 0) {
            const existingTickers = new Set(baseResult.setups.map(s => s.ticker));
            const extraSetups = dbHistorical
                .filter(h => !existingTickers.has(h.ticker))
                .map(h => ({
                    ticker: h.ticker,
                    sector: 'Historical Watch',
                    setupType: h.setupType,
                    ltp: h.entryPrice,
                    buyZone: h.entryPrice,
                    target: h.targetPrice,
                    stopLoss: h.stopLoss,
                    confidenceScore: h.confidenceScore,
                    aiSignal: h.aiSignal || 'WATCH',
                    status: 'QUALIFIED',
                    catalyst: h.aiLogic || 'Active in-progress setup from previous scan session.',
                }));

            if (extraSetups.length > 0) {
                baseResult.setups = [...baseResult.setups, ...extraSetups as any];
            }
        }
    } catch (dbErr) {
        // Fallback silently if historical table is temporarily unavailable
    }

    return baseResult;
}

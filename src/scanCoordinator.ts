import { Prisma, ScanJob } from '@prisma/client';
import {
    addThinkingStep,
    clearThinkingSteps,
    incrementTasksCompleted,
    publishScanStatus,
    pushEvent,
    setAgentState,
    setLastScan,
    setMonitoredStocks,
    updateThinkingStep,
} from './agentEvents';
import { getTradingApiFromEnv } from './dataService';
import { syncScanToGlobalTrackRecord } from './globalAgent';
import { buildSectorBreadthMap } from './newsIntel/marketGrounding';
import prisma from './prismaClient';
import { loadScanResults, saveScanResults } from './scanStorage';
import {
    buildTradeSetups,
    finalizeSwingDiagnostics,
    runIntradayScanner,
    runScanner,
    ScannerProgress,
} from './scanner';
import { ScanResult } from './types';

export type ScanMode = 'swing' | 'intraday';
export type ScanTrigger = 'manual' | 'scheduled' | 'closing';
export type PublicScanStatus = Pick<
    ScanJob,
    | 'id'
    | 'mode'
    | 'trigger'
    | 'status'
    | 'stage'
    | 'message'
    | 'progressPct'
    | 'processedStocks'
    | 'totalStocks'
    | 'setupsFound'
    | 'error'
    | 'startedAt'
    | 'heartbeatAt'
    | 'deadlineAt'
    | 'completedAt'
    | 'durationMs'
    | 'createdAt'
    | 'updatedAt'
>;

interface StartScanInput {
    mode?: ScanMode;
    trigger: ScanTrigger;
    requestedBy?: string;
}

interface StartScanResult {
    started: boolean;
    job: PublicScanStatus;
}

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING'] as const;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const STALE_HEARTBEAT_MS = 90 * 1000;

const scanCache: Record<ScanMode, ScanResult | null> = {
    swing: null,
    intraday: null,
};

const activeRuns = new Map<ScanMode, Promise<void>>();

function envInt(name: string, fallback: number, min: number, max: number): number {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function timeoutMs(): number {
    return envInt('SCAN_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 60_000, 30 * 60 * 1000);
}

function publicError(error: unknown): string {
    if (error instanceof Error && error.name === 'AbortError') {
        return 'The scan exceeded its configured time limit.';
    }
    return 'The scan could not be completed. The last successful setups remain available.';
}

function toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function toPublicScanStatus(job: ScanJob): PublicScanStatus {
    return {
        id: job.id,
        mode: job.mode,
        trigger: job.trigger,
        status: job.status,
        stage: job.stage,
        message: job.message,
        progressPct: job.progressPct,
        processedStocks: job.processedStocks,
        totalStocks: job.totalStocks,
        setupsFound: job.setupsFound,
        error: job.error,
        startedAt: job.startedAt,
        heartbeatAt: job.heartbeatAt,
        deadlineAt: job.deadlineAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}

export function getCachedScan(mode: ScanMode = 'swing'): ScanResult | null {
    return scanCache[mode];
}

export function setCachedScan(mode: ScanMode, scan: ScanResult): void {
    scanCache[mode] = scan;
}

export function getLatestAvailableScan(): ScanResult | null {
    const swing = scanCache.swing;
    const intraday = scanCache.intraday;
    if (!swing) return intraday;
    if (!intraday) return swing;
    return new Date(intraday.timestamp || 0).getTime() > new Date(swing.timestamp || 0).getTime()
        ? intraday
        : swing;
}

async function markStaleJobs(mode?: ScanMode): Promise<void> {
    const staleBefore = new Date(Date.now() - STALE_HEARTBEAT_MS);
    await prisma.scanJob.updateMany({
        where: {
            ...(mode ? { mode } : {}),
            status: { in: [...ACTIVE_STATUSES] },
            OR: [
                { heartbeatAt: { lt: staleBefore } },
                { heartbeatAt: null, createdAt: { lt: staleBefore } },
            ],
        },
        data: {
            status: 'TIMED_OUT',
            stage: 'Interrupted',
            message: 'The worker stopped reporting progress.',
            error: 'The scan worker stopped or restarted before completion.',
            completedAt: new Date(),
        },
    });
}

export async function initializeScanCoordinator(): Promise<void> {
    await markStaleJobs();
    const [swing, intraday] = await Promise.all([
        loadScanResults('swing'),
        loadScanResults('intraday'),
    ]);
    scanCache.swing = swing;
    scanCache.intraday = intraday;
    if (swing) console.log(`[ScanCoordinator] Restored ${swing.setups.length} swing setups from durable storage.`);
    if (intraday) console.log(`[ScanCoordinator] Restored ${intraday.setups.length} intraday setups from durable storage.`);
}

async function findActiveJob(mode: ScanMode): Promise<ScanJob | null> {
    await markStaleJobs(mode);
    return prisma.scanJob.findFirst({
        where: { mode, status: { in: [...ACTIVE_STATUSES] } },
        orderBy: { createdAt: 'desc' },
    });
}

export async function getScanStatus(mode: ScanMode = 'swing') {
    const [active, latest] = await Promise.all([
        findActiveJob(mode),
        prisma.scanJob.findFirst({ where: { mode }, orderBy: { createdAt: 'desc' } }),
    ]);
    const cached = getCachedScan(mode);
    return {
        active: active ? toPublicScanStatus(active) : null,
        latest: latest ? toPublicScanStatus(latest) : null,
        lastSuccessfulScanAt: cached?.timestamp ?? null,
        autoScanEnabled: process.env.ENABLE_AUTO_SCAN === 'true',
        paperAutomationEnabled: process.env.ENABLE_AUTOMATION === 'true',
    };
}

async function runJob(job: ScanJob, mode: ScanMode, trigger: ScanTrigger): Promise<void> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const limitMs = timeoutMs();
    const timeout = setTimeout(() => controller.abort(), limitMs);
    let lastPersistedAt = 0;
    let persistedProgress: Promise<unknown> = Promise.resolve();

    const reportProgress = (update: ScannerProgress) => {
        const progressPct = Math.max(0, Math.min(99, Math.round(update.progressPct)));
        const publicUpdate = {
            id: job.id,
            mode,
            trigger,
            status: 'RUNNING',
            ...update,
            progressPct,
            heartbeatAt: new Date().toISOString(),
        };
        publishScanStatus(publicUpdate);

        const now = Date.now();
        const shouldPersist = now - lastPersistedAt >= 1_000 || progressPct >= 99;
        if (!shouldPersist) return;
        lastPersistedAt = now;
        persistedProgress = persistedProgress
            .then(() => prisma.scanJob.update({
                where: { id: job.id },
                data: {
                    stage: update.stage,
                    message: update.message,
                    progressPct,
                    processedStocks: update.processedStocks ?? 0,
                    totalStocks: update.totalStocks ?? 0,
                    setupsFound: update.setupsFound ?? 0,
                    heartbeatAt: new Date(),
                },
            }))
            .catch(error => console.warn('[ScanCoordinator] Progress persistence failed:', error?.message || error));
    };

    try {
        await prisma.scanJob.update({
            where: { id: job.id },
            data: {
                status: 'RUNNING',
                stage: 'Initializing scanner',
                message: 'Preparing the market-data pipeline.',
                startedAt: new Date(startedAt),
                heartbeatAt: new Date(),
                deadlineAt: new Date(startedAt + limitMs),
            },
        });

        clearThinkingSteps();
        setAgentState('SCANNING', trigger === 'manual' ? 'Running requested market scan' : 'Running scheduled market scan');
        pushEvent('SCAN_START', 'info', trigger === 'manual' ? 'Manual Scan Started' : 'Auto Scan Started',
            `Running a ${mode} scan with a ${Math.round(limitMs / 60_000)} minute deadline.`,
            { data: { scanId: job.id, mode, trigger } });

        const marketStep = addThinkingStep('Fetching and validating market data', 'running');
        const trading = getTradingApiFromEnv();
        let qualified: any[] = [];
        let marketStatus: any;
        let setups: any[] = [];
        let diagnostics: any;

        if (mode === 'intraday') {
            const result = await runIntradayScanner(trading.api, {
                signal: controller.signal,
                onProgress: reportProgress,
            });
            qualified = result.qualified;
            marketStatus = result.marketStatus;
            setups = result.setups;
            diagnostics = result.diagnostics;
        } else {
            const result = await runScanner(trading.api, {
                signal: controller.signal,
                onProgress: reportProgress,
            });
            qualified = result.qualified;
            marketStatus = result.marketStatus;
            diagnostics = result.diagnostics;
            updateThinkingStep(marketStep, 'done', `${qualified.length} candidates qualified`);
            const setupStep = addThinkingStep('Validating trade-ready setups', 'running');
            setups = await buildTradeSetups(qualified, marketStatus, {
                signal: controller.signal,
                onProgress: reportProgress,
            });
            diagnostics = await finalizeSwingDiagnostics(diagnostics, qualified, setups);
            updateThinkingStep(setupStep, 'done', `${setups.length} setups identified`);
        }

        if (controller.signal.aborted) {
            const timeoutError = new Error('Scan deadline exceeded.');
            timeoutError.name = 'AbortError';
            throw timeoutError;
        }

        reportProgress({
            stage: 'Persisting results',
            message: `Saving ${setups.length} setup${setups.length === 1 ? '' : 's'} safely.`,
            progressPct: 96,
            processedStocks: qualified.length,
            totalStocks: diagnostics?.universeCount ?? qualified.length,
            setupsFound: setups.length,
        });

        const scanPayload: ScanResult = {
            timestamp: new Date().toISOString(),
            marketStatus,
            setups,
            sectorBreadth: buildSectorBreadthMap(qualified, setups),
            diagnostics,
        };

        setCachedScan(mode, scanPayload);
        await saveScanResults(scanPayload, mode);

        // Only scheduled scans create autonomous paper positions. A user pressing
        // the manual scan button remains an analysis-only action.
        if (trigger !== 'manual' && process.env.ENABLE_AUTOMATION === 'true') {
            await syncScanToGlobalTrackRecord(setups).catch(error => {
                console.error('[ScanCoordinator] Paper-trade handoff failed:', error?.message || error);
            });
        }

        await persistedProgress;
        const completedAt = new Date();
        const completed = await prisma.scanJob.update({
            where: { id: job.id },
            data: {
                status: 'COMPLETED',
                stage: 'Completed',
                message: setups.length
                    ? `${setups.length} setup${setups.length === 1 ? '' : 's'} ready.`
                    : 'Scan completed successfully with no qualifying setups.',
                progressPct: 100,
                setupsFound: setups.length,
                result: toJson(scanPayload),
                heartbeatAt: completedAt,
                completedAt,
                durationMs: completedAt.getTime() - startedAt,
                error: null,
            },
        });

        setAgentState('IDLE');
        incrementTasksCompleted();
        setLastScan(scanPayload.timestamp);
        setMonitoredStocks(setups.length);
        publishScanStatus(toPublicScanStatus(completed));
        const buyCount = setups.filter(setup => setup.aiSignal === 'BUY' || setup.mlAction === 'BUY').length;
        pushEvent('SCAN_COMPLETE', 'success', `Scan Complete - ${setups.length} Setups Found`,
            `${buyCount} BUY signals. Regime: ${marketStatus?.regime || 'NEUTRAL'}.`,
            { data: { scanId: job.id, total: setups.length, buyCount, trigger } });
    } catch (error: any) {
        const timedOut = controller.signal.aborted || error?.name === 'AbortError';
        const completedAt = new Date();
        const message = publicError(timedOut ? Object.assign(new Error(), { name: 'AbortError' }) : error);
        console.error(`[ScanCoordinator] ${timedOut ? 'Timed out' : 'Failed'} scan ${job.id}:`, error?.message || error);
        await persistedProgress;
        const failed = await prisma.scanJob.update({
            where: { id: job.id },
            data: {
                status: timedOut ? 'TIMED_OUT' : 'FAILED',
                stage: timedOut ? 'Timed out' : 'Failed',
                message,
                error: message,
                heartbeatAt: completedAt,
                completedAt,
                durationMs: completedAt.getTime() - startedAt,
            },
        }).catch(() => null);
        setAgentState('IDLE');
        if (failed) publishScanStatus(toPublicScanStatus(failed));
        pushEvent('SCAN_FAILED', timedOut ? 'warning' : 'critical', timedOut ? 'Scan Timed Out' : 'Scan Failed', message,
            { data: { scanId: job.id, mode, trigger } });
    } finally {
        clearTimeout(timeout);
    }
}

export async function startMarketScan(input: StartScanInput): Promise<StartScanResult> {
    const mode = input.mode ?? 'swing';
    const localRun = activeRuns.get(mode);
    if (localRun) {
        const existing = await findActiveJob(mode);
        if (existing) return { started: false, job: toPublicScanStatus(existing) };
    }

    const active = await findActiveJob(mode);
    if (active) return { started: false, job: toPublicScanStatus(active) };

    const created = await prisma.scanJob.create({
        data: {
            mode,
            trigger: input.trigger,
            requestedBy: input.requestedBy,
            status: 'QUEUED',
            stage: 'Queued',
            message: input.trigger === 'manual' ? 'Manual scan queued.' : 'Scheduled scan queued.',
            heartbeatAt: new Date(),
            deadlineAt: new Date(Date.now() + timeoutMs()),
        },
    });

    const execution = Promise.resolve()
        .then(() => runJob(created, mode, input.trigger))
        .finally(() => activeRuns.delete(mode));
    activeRuns.set(mode, execution);
    void execution;

    publishScanStatus(toPublicScanStatus(created));
    return { started: true, job: toPublicScanStatus(created) };
}

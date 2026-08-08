import cron from 'node-cron';
import { pushEvent } from './agentEvents';
import type { ScanTrigger } from './scanCoordinator';

const NSE_TIMEZONE = 'Asia/Kolkata';

export interface ScheduledScanResult {
    started: boolean;
    job: { id: string; status: string };
}

export type ScheduledScanStarter = (trigger: ScanTrigger) => Promise<ScheduledScanResult>;

function istDateKey(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: NSE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function configuredNseHolidays(): Set<string> {
    return new Set(
        (process.env.NSE_MARKET_HOLIDAYS ?? '')
            .split(',')
            .map(value => value.trim())
            .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    );
}

export function isConfiguredNseHoliday(date = new Date()): boolean {
    return configuredNseHolidays().has(istDateKey(date));
}

async function triggerScheduledScan(startScan: ScheduledScanStarter, trigger: ScanTrigger): Promise<void> {
    if (isConfiguredNseHoliday()) {
        console.log(`[AutoScanner] Skipped ${trigger} scan on configured NSE holiday.`);
        return;
    }

    try {
        const result = await startScan(trigger);
        if (result.started) {
            console.log(`[AutoScanner] ${trigger} scan ${result.job.id} queued.`);
        } else {
            console.log(`[AutoScanner] ${trigger} scan skipped; ${result.job.id} is already active.`);
        }
    } catch (error: any) {
        console.error(`[AutoScanner] Unable to queue ${trigger} scan:`, error?.message || error);
        pushEvent('SCAN_FAILED', 'critical', 'Auto Scan Could Not Start',
            'The scheduler could not queue the market scan. Existing setups remain available.');
    }
}

/**
 * Registers one scheduler per API instance. Railway currently runs one API
 * replica; durable ScanJob overlap checks prevent a second scan if a replica
 * or manual request races the scheduler.
 */
export function initAutoScanner(startScan: ScheduledScanStarter): void {
    if (process.env.ENABLE_AUTO_SCAN !== 'true') {
        console.log('[AutoScanner] Scheduled scanning is disabled.');
        return;
    }

    // Every 30 minutes, anchored to the 9:15 NSE open: 09:15, 09:45,
    // 10:15 ... 14:45, 15:15. The final 15:35 run captures the close.
    cron.schedule('15,45 9-14 * * 1-5', () => triggerScheduledScan(startScan, 'scheduled'), {
        timezone: NSE_TIMEZONE,
    });
    cron.schedule('15 15 * * 1-5', () => triggerScheduledScan(startScan, 'scheduled'), {
        timezone: NSE_TIMEZONE,
    });
    cron.schedule('35 15 * * 1-5', () => triggerScheduledScan(startScan, 'closing'), {
        timezone: NSE_TIMEZONE,
    });

    console.log('[AutoScanner] Scheduled scans active for NSE market hours in Asia/Kolkata.');
    pushEvent('SYSTEM', 'success', 'Auto Scanner Enabled',
        'Scheduled scans will run every 30 minutes during NSE market hours, plus a closing scan.');
}

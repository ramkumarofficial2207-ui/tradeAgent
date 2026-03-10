import cron from 'node-cron';
import axios from 'axios';
import { pushEvent } from './agentEvents';
import prisma from './prismaClient';
import { fetchHistoricalData } from './dataService';

/**
 * Initializes the fully autonomous scanning chron job.
 * Runs every 30 minutes during NSE market hours (9:15 AM - 3:30 PM, Mon-Fri).
 */
export function initAutoScanner() {
    console.log('[AutoScanner] 🤖 Initializing Level 1000 Autonomous Agent...');

    // Main EOD/30-min Deep Scan
    cron.schedule('0,30 9-15 * * 1-5', async () => {
        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const h = istTime.getHours();
        const m = istTime.getMinutes();

        // Strict market hours check (9:15 AM - 3:30 PM)
        if (h === 9 && m < 15) return; // Before 9:15
        if (h === 15 && m > 30) return; // After 3:30

        console.log(`[AutoScanner] 🕒 Triggering autonomous background scan at ${istTime.toLocaleTimeString('en-IN')}`);

        try {
            pushEvent('SYSTEM', 'info', 'Autonomous Scan Started', 'The agent is running a scheduled background analysis.');

            axios.get('http://localhost:3000/api/scan', { timeout: 300000 })
                .then(res => {
                    if (res.data.success) {
                        console.log(`[AutoScanner] ✅ Background scan complete. Found ${res.data.data.setups?.length || 0} setups.`);
                    }
                })
                .catch(err => {
                    console.error('[AutoScanner] ❌ Background scan failure:', err.message);
                });

        } catch (error: any) {
            console.error('[AutoScanner] Cron trigger failed:', error.message);
        }
    });

    // ── Phase 2: Intraday Squawk Box (Live Polling every 5 mins) ──
    cron.schedule('*/5 9-15 * * 1-5', async () => {
        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const h = istTime.getHours();
        const m = istTime.getMinutes();
        if ((h === 9 && m < 15) || (h === 15 && m > 30)) return;

        try {
            // Find all active watchlist items with a buyZone set
            const watchItems = await prisma.watchlistItem.findMany({
                where: { buyZone: { not: null } }
            });

            if (!watchItems.length) return;

            let crossCount = 0;
            // Iterate the watchlist and check current levels
            for (const item of watchItems) {
                if (!item.buyZone) continue;
                const tickerQuery = item.ticker.endsWith('.NS') ? item.ticker : `${item.ticker}.NS`;
                const candles = await fetchHistoricalData(tickerQuery, 2);
                if (candles.length === 0) continue;

                const latest = candles[candles.length - 1];

                // If price crossed buy zone Today
                if (latest.close > item.buyZone || latest.high > item.buyZone) {
                    // Alert if price is within 5% of the buy limit so we don't alert on old massively extended runners
                    if (latest.close < (item.buyZone * 1.05)) {
                        pushEvent('SYSTEM', 'success', `⚡ SQUAWK: ${item.ticker} BREAKOUT`,
                            `Live Price ₹${latest.close} crossed setup pivot ₹${item.buyZone}. Active Trade Triggered.`);
                        crossCount++;
                    }
                }
            }
            if (crossCount > 0) {
                console.log(`[Intraday Squawk] Alerted on ${crossCount} live crossovers.`);
            }
        } catch (e: any) {
            console.error('[Intraday Squawk] Error:', e.message);
        }
    });

    console.log('[AutoScanner] ✓ Chron triggers registered.');
}

import cron from 'node-cron';
import axios from 'axios';
import { pushEvent } from './agentEvents';

/**
 * Initializes the fully autonomous scanning chron job.
 * Runs every 30 minutes during NSE market hours (9:15 AM - 3:30 PM, Mon-Fri).
 */
export function initAutoScanner() {
    console.log('[AutoScanner] 🤖 Initializing Level 1000 Autonomous Agent...');

    // Schedule:
    // Every 30 minutes: '0,30'
    // Hours 9 to 15: '9-15'
    // Days 1-5 (Mon-Fri): '1-5'
    // We will constrain roughly to market hours (9:15 to 15:30) inside the job itself.

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

            // Hit the existing scan endpoint (which inherently logs to database thanks to previous tracker updates)
            // Ensure no timeout issues by allowing it to run entirely in background
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

    console.log('[AutoScanner] ✓ Chron trigger registered.');
}

import axios from 'axios';

export interface EarningsRiskResult {
    blocked: boolean;
    reason: string;
    nextEarningsDate?: Date;
    daysUntilEarnings?: number;
}

/**
 * Checks if a company is scheduled to report earnings within the next N days.
 * Used as a fundamental guardrail to prevent swing trading right before earnings volatility.
 */
export async function validateEarningsRisk(ticker: string, safeWindowDays: number = 4): Promise<EarningsRiskResult> {
    try {
        const yahooSymbol = ticker.endsWith('.NS') ? ticker : `${ticker}.NS`;

        // Use the v10 Yahoo Finance API for precise calendar events
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}?modules=calendarEvents`;

        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            },
            timeout: 8000
        });

        const events = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;

        if (!events || !events.earningsDate || events.earningsDate.length === 0) {
            // No earnings information available, assume safe
            return { blocked: false, reason: 'No upcoming earnings data found.' };
        }

        // earningsDate array usually contains a [start, end] epoch timestamp pair. We take the earliest.
        const nextEarningsEpochSeconds = events.earningsDate[0].raw;

        if (!nextEarningsEpochSeconds) {
            return { blocked: false, reason: 'Earnings date missing.' };
        }

        const nextEarningsDate = new Date(nextEarningsEpochSeconds * 1000);
        const now = new Date();

        // Calculate days difference
        const diffTime = nextEarningsDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // If earnings are in the past, or far in the future, it is safe
        if (diffDays < 0 || diffDays > safeWindowDays) {
            return {
                blocked: false,
                reason: `Next earnings is safely in ${diffDays} days (${nextEarningsDate.toDateString()}).`,
                nextEarningsDate,
                daysUntilEarnings: diffDays
            };
        }

        // If earnings are within the safe window (e.g., next 4 days), BLOCK the setup
        return {
            blocked: true,
            reason: `CRITICAL RISK: Earnings report scheduled in ${diffDays} days (${nextEarningsDate.toDateString()}). Swing trading disabled to prevent gap risk.`,
            nextEarningsDate,
            daysUntilEarnings: diffDays
        };

    } catch (e: any) {
        console.warn(`[Earnings Guardrail] Failed to fetch earnings for ${ticker}: ${e.message}`);
        // Default to not blocking if the API fails, to prevent shutting down the scanner entirely
        return { blocked: false, reason: 'Failed to verify earnings date via Yahoo.' };
    }
}

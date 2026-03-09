import { claudeAsk } from './claudeClient';
import { groqAsk } from './groqClient';

export interface AIAssessment {
    ticker: string;
    momentum_score: number;
    signal: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    logic: string;
    target_range: string;
    stop_loss: string;
}

const SYSTEM_PROMPT = `You are a Professional Momentum Trading Analyst specializing in the Indian NSE market.
Your goal is to identify "High Velocity" stocks capable of 5-15% short-term swing moves.

Analysis rules (Newgen-style breakout):
1. VOLUME SHOCK: ≥1.5x average volume required. <1.2x → automatic REJECT unless day just started.
2. PRICE VELOCITY: Price must be pinned near the day high. >1.5% below day high = wick rejection → reject.
3. MOMENTUM ZONE: RSI 55–75 preferred. RSI >78 = overbought → downgrade.
4. ROOM TO RUN: Distance to next major resistance.
5. RUBBER BAND: >25% above 200-DMA = dangerous extension → downgrade to WATCH or REJECT.
6. NEWS CONTEXT (CRITICAL): Read the provided headlines. If you detect severe regulatory action, SEC probes, fraud, severe analyst downgrades, or immediate earnings risk, you MUST override technicals and issue an REJECT signal with the reasoning.

Constraints:
- Already up >10% today → flag "High Risk/Late Entry", downgrade to WATCH
- distFromDma200Pct >25% → downgrade
- Negative Regulatory/Earnings News → REJECT

- The stock's exact timeframe is given to you based on technicals. Adjust your targets and stop losses accordingly.

- The stock's exact timeframe is given to you based on technicals. Adjust your targets and stop losses accordingly.

Signal Definitions:
- BUY: A completely perfect setup (A+ grade). High conviction. 
- LIGHT BUY: A slightly imperfect setup (e.g., market is weak, slightly extended, or lower volume) but still tradable.
- WATCH: Setup needs confirmation or is waiting for a catalyst/breakout.
- REJECT: Poor technicals, heavy resistance, or low conviction. Do not trade.

Return ONLY a valid JSON array (no markdown fences, no explanation) with this exact shape per stock:
[{"ticker":"...","momentum_score":7,"signal":"BUY","logic":"1-sentence reason","target_range":"₹X – ₹Y","stop_loss":"₹Z"}]`;

export async function analyzeStocksWithAI(stocks: any[]): Promise<Map<string, AIAssessment>> {
    const results = new Map<string, AIAssessment>();

    if (!stocks.length) return results;

    // Fallback factory
    const fallback = (ticker: string, reason: string): AIAssessment => ({
        ticker,
        momentum_score: 5,
        signal: 'WATCH',
        logic: reason,
        target_range: 'N/A',
        stop_loss: 'N/A',
    });

    // Check if Anthropic key is available
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeKey || claudeKey === 'paste_your_anthropic_key_here') {
        console.warn('[AI Advisor] ANTHROPIC_API_KEY not set — using WATCH fallback for all stocks.');
        for (const s of stocks) {
            const t = s.ticker ?? s.Ticker;
            results.set(t, fallback(t, 'AI Advisor requires ANTHROPIC_API_KEY for Claude integration.'));
        }
        return results;
    }

    // Build compact stock input
    const stockData = stocks.map(s => JSON.stringify({
        ticker: s.ticker ?? s.Ticker,
        price: +(s.close ?? s.ltp ?? 0).toFixed(2),
        dayHigh: +(s.high ?? 0).toFixed(2),
        dayChangePct: +(s.dayChangePct ?? 0).toFixed(2),
        rsi14: s.rsi14 != null ? +s.rsi14.toFixed(1) : null,
        distFromDma200Pct: s.distFromDma200Pct != null ? +s.distFromDma200Pct.toFixed(1) : null,
        volumeRatio: s.volumeRatio != null ? +s.volumeRatio.toFixed(2) : null,
        marketCapCr: s.mcap ?? null,
        sector: s.sector ?? 'Unknown',
        timeframe: s.timeframe ?? 'Swing',
        newsHeadlines: s.headlines ? s.headlines.slice(0, 3) : [],
    })).join('\n');

    try {
        let raw = '';
        try {
            raw = await claudeAsk(
                SYSTEM_PROMPT,
                `Analyse these ${stocks.length} stocks:\n${stockData}`,
                { maxTokens: 1200, temperature: 0.2 }
            );
        } catch (claudeErr: any) {
            console.warn('[AI Advisor] Claude failed (likely credits or 400). Falling back to Groq...');
            raw = await groqAsk(
                SYSTEM_PROMPT,
                `Analyse these ${stocks.length} stocks:\n${stockData}`,
                { maxTokens: 1200, temperature: 0.2 }
            );
        }

        // Strip any accidental markdown fences
        const clean = raw.replace(/```json|```/g, '').trim();
        const jsonMatch = clean.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in response');

        const parsed: AIAssessment[] = JSON.parse(jsonMatch[0]);
        for (const item of parsed) {
            if (item.ticker) results.set(item.ticker, item);
        }

        console.log(`[AI Advisor] Claude analysed ${parsed.length}/${stocks.length} stocks ✓`);
    } catch (err: any) {
        console.error('[AI Advisor] Claude error:', err.message);
        const reason = err.message?.includes('ANTHROPIC_API_KEY')
            ? err.message
            : `AI unavailable (${err.message?.slice(0, 80)}). Review manually.`;
        for (const s of stocks) {
            const t = s.ticker ?? s.Ticker;
            if (!results.has(t)) results.set(t, fallback(t, reason));
        }
    }

    return results;
}

import { claudeAsk } from './claudeClient';
import { groqAsk } from './groqClient';
import { geminiAsk } from './geminiClient';
import prisma from './prismaClient';

export interface AIAssessment {
    ticker: string;
    momentum_score: number;
    signal: 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    logic: string;
    target_range: string;
    stop_loss: string;
    // Phase 1: Execution Trigger Zones
    trigger_price?: number;
    trigger_volume_ratio?: number;
    // Phase 4: Devil's Advocate
    bear_case?: string;
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
7. OPTIONS FLOW (If available): Look at PCR and Derivative Status. PCR > 1.0 with 'Long Buildup' is hyper-bullish. 'Short Buildup' or PCR < 0.6 is a massive wall of call sellers → REJECT.

8. EXECUTION TRIGGER (NEW): You must define a precise 'trigger_price' (usually 0.1% above day high or pivot) and a 'trigger_volume_ratio' (minimum volume intensity required during the breakout).

Constraints:
- Already up >10% today → flag "High Risk/Late Entry", downgrade to WATCH
- distFromDma200Pct >25% → downgrade
- Negative Regulatory/Earnings News → REJECT

Signal Definitions:
- BUY: A completely perfect setup (A+ grade). High conviction. 
- LIGHT BUY: A slightly imperfect setup (e.g., market is weak, slightly extended, or lower volume) but still tradable.
- WATCH: Setup needs confirmation or is waiting for a catalyst/breakout.
- REJECT: Poor technicals, heavy resistance, or low conviction. Do not trade.

Return ONLY a valid JSON array (no markdown fences, no explanation) with this exact shape per stock:
[{"ticker":"...","momentum_score":7,"signal":"BUY","logic":"...","target_range":"...","stop_loss":"...","trigger_price":123.45,"trigger_volume_ratio":1.5}]`;

const DEVILS_ADVOCATE_PROMPT = `You are a Professional Contrarian Short-Seller. 
Your job is to find the "Fatal Flaw" in a bullish trade setup.
Look for:
- Bull Traps (Wicks at high)
- Low volume breakouts (Fakeouts)
- Sector headwinds
- Major resistance levels just above
- Overextension (Vertical moves)
- Regulatory/News risks that could trigger a reversal.

Critique the provided stock data and give a 1-2 sentence "Bear Case" why this trade might fail.
Return ONLY a valid JSON object: {"bear_case": "..."}`;

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

    // Check if Gemini key is available
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        console.warn('[AI Advisor] GEMINI_API_KEY not set — using WATCH fallback for all stocks.');
        for (const s of stocks) {
            const t = s.ticker ?? s.Ticker;
            results.set(t, fallback(t, 'AI Advisor requires GEMINI_API_KEY for StockSage AI integration.'));
        }
        return results;
    }

    // ── Phase 3: AI Memory (Feedback Loop) ───────────────────
    let memoryContext = "Market Context: No recent trade history available yet.";
    try {
        const recentHistory = await prisma.historicalSetup.findMany({
            where: { status: { in: ['WON', 'LOST'] } },
            orderBy: { resolvedAt: 'desc' },
            take: 30
        });

        if (recentHistory.length > 0) {
            const wins = recentHistory.filter(h => h.status === 'WON').length;
            const winRate = ((wins / recentHistory.length) * 100).toFixed(1);

            const typeStats: Record<string, { total: number, wins: number }> = {};
            for (const h of recentHistory) {
                if (!typeStats[h.setupType]) typeStats[h.setupType] = { total: 0, wins: 0 };
                typeStats[h.setupType].total++;
                if (h.status === 'WON') typeStats[h.setupType].wins++;
            }

            const typePerformances = Object.entries(typeStats)
                .filter(([_, stats]) => stats.total >= 2)
                .map(([type, stats]) => `${type}: ${((stats.wins / stats.total) * 100).toFixed(0)}% WR (${stats.total} trades)`)
                .join(', ');

            memoryContext = `CRITICAL MARKET CONTEXT (Recent Agent Performance via Closed Trades):
- Overall recent win rate: ${winRate}% (${wins}/${recentHistory.length}).
- Setup performance: ${typePerformances || 'Not enough data by type'}.
Use this data to penalize failing setup types and prioritize working ones. If a setup type is performing poorly in this regime, downgrade signals to WATCH.`;
        }
    } catch (e) {
        console.warn('[AI Advisor] Failed to load memory context.');
    }

    const dynamicSystemPrompt = `${SYSTEM_PROMPT}\n\n${memoryContext}`;

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
        pcr: s.pcr ?? 'N/A',
        derivativeStatus: s.derivativeStatus ?? 'N/A'
    })).join('\n');

    try {
        let raw = '';
        try {
            // Try Gemini primary (User request)
            raw = await geminiAsk(
                dynamicSystemPrompt,
                `Analyse these ${stocks.length} stocks:\n${stockData}`,
                { maxTokens: 1200, temperature: 0.2 }
            );
        } catch (geminiErr: any) {
            console.warn('[AI Advisor] Gemini failed. Falling back to Claude...');
            try {
                raw = await claudeAsk(
                    dynamicSystemPrompt,
                    `Analyse these ${stocks.length} stocks:\n${stockData}`,
                    { maxTokens: 1200, temperature: 0.2 }
                );
            } catch (claudeErr: any) {
                console.warn('[AI Advisor] Claude failed. Falling back to Groq...');
                raw = await groqAsk(
                    dynamicSystemPrompt,
                    `Analyse these ${stocks.length} stocks:\n${stockData}`,
                    { maxTokens: 1200, temperature: 0.2 }
                );
            }
        }

        // Strip any accidental markdown fences
        const clean = raw.replace(/```json|```/g, '').trim();
        const jsonMatch = clean.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in response');

        const parsed: AIAssessment[] = JSON.parse(jsonMatch[0]);

        // ── Phase 4: Devil's Advocate Check ──
        for (const item of parsed) {
            if (item.ticker) {
                if (item.signal === 'BUY' || item.signal === 'LIGHT BUY') {
                    const originalStock = stocks.find(s => (s.ticker ?? s.Ticker) === item.ticker);
                    if (originalStock) {
                        try {
                            // Try Gemini first for Bear Case (User preference)
                            let bearResponse = '';
                            try {
                                bearResponse = await geminiAsk(
                                    DEVILS_ADVOCATE_PROMPT,
                                    `Critique this ${item.signal} setup for ${item.ticker}:\n${JSON.stringify(item)}\nTechnical Data: ${JSON.stringify(originalStock)}`,
                                    { maxTokens: 150, temperature: 0.7 }
                                );
                            } catch {
                                // Fallback to Claude
                                bearResponse = await claudeAsk(
                                    DEVILS_ADVOCATE_PROMPT,
                                    `Critique this ${item.signal} setup for ${item.ticker}:\n${JSON.stringify(item)}\nTechnical Data: ${JSON.stringify(originalStock)}`,
                                    { maxTokens: 150, temperature: 0.7 }
                                );
                            }
                            const bearJson = JSON.parse(bearResponse.replace(/```json|```/g, '').trim());
                            item.bear_case = bearJson.bear_case;
                        } catch (e) {
                            item.bear_case = "Contrarian analysis unavailable.";
                        }
                    }
                }
                results.set(item.ticker, item);
            }
        }

        console.log(`[AI Advisor] Gemini analysed ${parsed.length}/${stocks.length} stocks (with Devil's Advocate for ${parsed.filter(p => p.bear_case).length} setups) ✓`);
    } catch (err: any) {
        console.error('[AI Advisor] Gemini error:', err.message);
        const reason = err.message?.includes('GEMINI_API_KEY')
            ? 'AI service configuration error. Please check server logs.'
            : `AI analysis is temporarily unavailable. Review technicals manually.`;
        for (const s of stocks) {
            const t = s.ticker ?? s.Ticker;
            if (!results.has(t)) results.set(t, fallback(t, reason));
        }
    }

    return results;
}

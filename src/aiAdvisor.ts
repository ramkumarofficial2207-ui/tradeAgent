import { claudeAsk } from './claudeClient';
import { groqAsk } from './groqClient';
import { geminiAsk } from './geminiClient';
import prisma from './prismaClient';
import axios from 'axios';

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
    // Phase 4: Devil's Advocate / Risk Governor
    bear_case?: string;
    // Phase 5: Debate Synthesis metadata
    debate_verdict?: string;
    // Phase 4: Machine Learning Prediction
    mlWinProbability?: number | string;
    mlAction?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENT 1 — Technical Analyst (Bullish Momentum Scanner)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TECHNICAL_ANALYST_PROMPT = `You are a Professional Momentum Trading Analyst specializing in the Indian NSE market.
Your goal is to identify "High Velocity" stocks capable of 5-15% short-term swing moves.

Analysis rules (Newgen-style breakout):
1. VOLUME SHOCK: ≥1.5x average volume required. <1.2x → automatic REJECT unless day just started.
2. PRICE VELOCITY: Price must be pinned near the day high. >1.5% below day high = wick rejection → reject.
3. MOMENTUM ZONE: RSI 55–75 preferred. RSI >78 = overbought → downgrade.
4. ROOM TO RUN: Distance to next major resistance.
5. RUBBER BAND: >25% above 200-DMA = dangerous extension → downgrade to WATCH or REJECT.
6. NEWS CONTEXT (CRITICAL): Read the provided headlines. If you detect severe regulatory action, SEC probes, fraud, severe analyst downgrades, or immediate earnings risk, you MUST override technicals and issue an REJECT signal with the reasoning.
7. OPTIONS FLOW (If available): Look at PCR and Derivative Status. PCR > 1.0 with 'Long Buildup' is hyper-bullish. 'Short Buildup' or PCR < 0.6 is a massive wall of call sellers → REJECT.
8. ML ENGINE PREDICTION (NEW): The 'mlWinProbability' and 'mlAction' are provided by our Python XGBoost model. If ML says REJECT or < 55%, you MUST heavily downgrade.
9. EXECUTION TRIGGER (NEW): You must define a precise 'trigger_price' (usually 0.1% above day high or pivot) and a 'trigger_volume_ratio' (minimum volume intensity required during the breakout).

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENT 2 — Risk Governor (Contrarian Critic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const RISK_GOVERNOR_PROMPT = `You are a Professional Risk Governor and Contrarian Analyst for an Indian NSE swing trading desk.
Your SOLE job is to stress-test bullish trade setups. You receive the Technical Analyst's BUY/LIGHT BUY signals and must challenge every one of them.

Your checklist (challenge each):
1. BULL TRAP CHECK: Is the breakout on declining volume? Are there upper wicks suggesting supply?
2. SECTOR HEADWINDS: Is the broader sector weak? Will sector rotation kill this trade?
3. OVEREXTENSION: How far is the stock from 20/50/200 DMA? Vertical moves mean-revert violently.
4. RESISTANCE OVERHEAD: Is there heavy supply at a known resistance level just 2-3% above?
5. NEWS LANDMINE: Could pending earnings, regulatory events, or macro data negate the thesis?
6. LIQUIDITY RISK: Can the position be exited cleanly? Low volume = slippage trap.
7. REGIME MISMATCH: Is this a momentum play in a risk-off market, or a deep-value play in a screaming bull market?

For each stock, output:
- risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"  
- bear_case: A 2-3 sentence explanation of the biggest risk.
- override_signal: null (no override) | "WATCH" | "REJECT" — Only override if risk_level is CRITICAL.
- confidence_penalty: 0 to -3 (how much to penalize the momentum_score).

Return ONLY a valid JSON array:
[{"ticker":"...","risk_level":"MEDIUM","bear_case":"...","override_signal":null,"confidence_penalty":-1}]`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AGENT 3 — Synthesizer (Final Decision Maker)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SYNTHESIZER_PROMPT = `You are the Final Decision Synthesizer for an Indian NSE swing trading system.
You receive two inputs:
1. The Technical Analyst's bullish assessment (signal, score, logic, targets).
2. The Risk Governor's contrarian critique (risk level, bear case, penalty).

Your job is to produce the FINAL trading verdict by reconciling both views.

Rules:
- If the Risk Governor flags CRITICAL risk and recommends an override → you MUST honor the override.
- If risk_level is HIGH → downgrade BUY to LIGHT BUY, or LIGHT BUY to WATCH.
- If risk_level is MEDIUM → apply the confidence_penalty but keep the signal intact.
- If risk_level is LOW → keep the Technical Analyst's original signal and score.
- Always incorporate the bear_case into your final logic so the trader sees both sides.
- The final momentum_score = original score + confidence_penalty (clamped to 1-10).

Return ONLY a valid JSON array:
[{"ticker":"...","momentum_score":7,"signal":"BUY","logic":"Bull: ... | Bear: ...","target_range":"...","stop_loss":"...","trigger_price":123.45,"trigger_volume_ratio":1.5,"bear_case":"...","debate_verdict":"CONFIRMED|DOWNGRADED|OVERRIDDEN"}]`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dedicated LLM Role Dispatchers — with cross-fallback safety
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runTechnicalAnalyst(
    systemPrompt: string,
    userMessage: string,
    opts: { maxTokens: number; temperature: number }
): Promise<string> {
    // Primary: Groq Llama 3.3 70B (ultra-fast 0.4s response, 800 tokens/sec)
    // Secondary: Gemini
    // Fallback: Claude
    try {
        if (process.env.GROQ_API_KEY) {
            return await groqAsk(systemPrompt, userMessage, opts);
        }
    } catch (e: any) {
        console.warn('[AI Technical Analyst] Groq call failed, trying Gemini...', e.message);
    }
    try {
        if (process.env.GEMINI_API_KEY) {
            return await geminiAsk(systemPrompt, userMessage, opts);
        }
    } catch (e: any) {
        console.warn('[AI Technical Analyst] Gemini call failed, trying Claude...', e.message);
    }
    return await claudeAsk(systemPrompt, userMessage, opts);
}

async function runRiskGovernor(
    systemPrompt: string,
    userMessage: string,
    opts: { maxTokens: number; temperature: number }
): Promise<string> {
    try {
        if (process.env.GROQ_API_KEY) {
            return await groqAsk(systemPrompt, userMessage, opts);
        }
    } catch (e: any) {
        console.warn('[AI Risk Governor] Groq call failed, trying Gemini...', e.message);
    }
    try {
        if (process.env.GEMINI_API_KEY) {
            return await geminiAsk(systemPrompt, userMessage, opts);
        }
    } catch (e: any) {
        console.warn('[AI Risk Governor] Gemini call failed, trying Claude...', e.message);
    }
    return await claudeAsk(systemPrompt, userMessage, opts);
}

async function runSynthesizer(
    systemPrompt: string,
    userMessage: string,
    opts: { maxTokens: number; temperature: number }
): Promise<string> {
    try {
        if (process.env.GROQ_API_KEY) {
            return await groqAsk(systemPrompt, userMessage, opts);
        }
    } catch (e: any) {
        console.warn('[AI Synthesizer] Groq call failed, trying Gemini...', e.message);
    }
    try {
        if (process.env.GEMINI_API_KEY) {
            return await geminiAsk(systemPrompt, userMessage, opts);
        }
    } catch (e: any) {
        console.warn('[AI Synthesizer] Gemini call failed, trying Claude...', e.message);
    }
    return await claudeAsk(systemPrompt, userMessage, opts);
}

function parseJsonArray<T>(raw: string): T[] {
    const clean = raw.replace(/```json|```/g, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found in LLM response');
    return JSON.parse(match[0]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Closed-Loop ML Memory — Few-Shot Examples from Historical Performance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function buildClosedLoopMemory(): Promise<string> {
    try {
        const recentHistory = await prisma.historicalSetup.findMany({
            where: { status: { in: ['WON', 'LOST'] } },
            orderBy: { resolvedAt: 'desc' },
            take: 40,
        });

        if (recentHistory.length === 0) {
            return 'Market Context: No recent trade history available yet. Apply standard rules.';
        }

        const wins = recentHistory.filter(h => h.status === 'WON');
        const losses = recentHistory.filter(h => h.status === 'LOST');
        const winRate = ((wins.length / recentHistory.length) * 100).toFixed(1);

        // ── Per-Setup-Type win rate breakdown ──
        const typeStats: Record<string, { total: number; wins: number; avgPnl: number }> = {};
        for (const h of recentHistory) {
            if (!typeStats[h.setupType]) typeStats[h.setupType] = { total: 0, wins: 0, avgPnl: 0 };
            typeStats[h.setupType].total++;
            if (h.status === 'WON') typeStats[h.setupType].wins++;
            typeStats[h.setupType].avgPnl += h.resultPct ?? 0;
        }

        const typePerformances = Object.entries(typeStats)
            .filter(([_, stats]) => stats.total >= 2)
            .map(([type, stats]) => {
                const wr = ((stats.wins / stats.total) * 100).toFixed(0);
                const avgPnl = (stats.avgPnl / stats.total).toFixed(1);
                return `${type}: ${wr}% WR (${stats.total} trades, avg ${avgPnl}%)`;
            })
            .join('\n  ');

        // ── Concrete few-shot examples (best 3 wins + worst 3 losses) ──
        const topWins = wins
            .filter(w => w.resultPct != null)
            .sort((a, b) => (b.resultPct ?? 0) - (a.resultPct ?? 0))
            .slice(0, 3);

        const worstLosses = losses
            .filter(l => l.resultPct != null)
            .sort((a, b) => (a.resultPct ?? 0) - (b.resultPct ?? 0))
            .slice(0, 3);

        const winExamples = topWins.map(w =>
            `  ✅ ${w.ticker} (${w.setupType}): Entry ₹${w.entryPrice} → +${w.resultPct?.toFixed(1)}% | Confidence ${w.confidenceScore}/10 | Signal: ${w.aiSignal}`
        ).join('\n');

        const lossExamples = worstLosses.map(l =>
            `  ❌ ${l.ticker} (${l.setupType}): Entry ₹${l.entryPrice} → ${l.resultPct?.toFixed(1)}% | Confidence ${l.confidenceScore}/10 | Signal: ${l.aiSignal}`
        ).join('\n');

        // ── Identify failing setup types (< 40% WR with ≥ 3 trades) ──
        const failingTypes = Object.entries(typeStats)
            .filter(([_, stats]) => stats.total >= 3 && (stats.wins / stats.total) < 0.40)
            .map(([type]) => type);

        const failingWarning = failingTypes.length > 0
            ? `\n⚠️ FAILING SETUP TYPES (auto-penalize to WATCH): ${failingTypes.join(', ')}`
            : '';

        return `CRITICAL CLOSED-LOOP PERFORMANCE MEMORY (Last ${recentHistory.length} resolved trades):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Win Rate: ${winRate}% (${wins.length}W / ${losses.length}L)

Per-Setup Performance:
  ${typePerformances || 'Not enough data by type.'}
${failingWarning}

WINNING TRADE EXAMPLES (learn from these patterns):
${winExamples || '  No winning examples yet.'}

LOSING TRADE EXAMPLES (avoid these patterns):
${lossExamples || '  No losing examples yet.'}

INSTRUCTIONS:
- Prioritize setup types with >60% win rates.
- If a setup type appears in the FAILING list above, you MUST downgrade its signal to WATCH regardless of technicals.
- Use the few-shot examples to calibrate your confidence scores — if a setup looks similar to a past loser, penalize it.`;

    } catch (e) {
        console.warn('[AI Advisor] Failed to load closed-loop memory:', e);
        return 'Market Context: Unable to load trade history. Apply standard rules.';
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Export — Multi-Agent Debate Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function analyzeStocksWithAI(stocks: any[]): Promise<Map<string, AIAssessment>> {
    const results = new Map<string, AIAssessment>();

    if (!stocks.length) return results;

    // Fail-closed assessment used when the AI pipeline is unavailable.
    const fallback = (s: any, reason: string): AIAssessment => {
        const t = typeof s === 'string' ? s : (s.ticker ?? s.Ticker ?? 'UNKNOWN');
        const rawScore = typeof s === 'object' ? (s.confidenceScore ?? s.momentumScore) : undefined;
        const score = Number.isFinite(Number(rawScore)) ? Number(rawScore) : 0;

        return {
            ticker: t,
            momentum_score: Math.min(10, Math.max(0, Math.round(score))),
            signal: 'WATCH',
            logic: reason,
            target_range: 'UNAVAILABLE',
            stop_loss: 'UNAVAILABLE',
            bear_case: 'AI validation unavailable; no AI-backed trade decision was produced.',
            debate_verdict: 'UNAVAILABLE',
        };
    };

    // Check if Gemini key is available
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        console.warn('[AI Advisor] GEMINI_API_KEY not set — using WATCH fallback for all stocks.');
        for (const s of stocks) {
            const t = s.ticker ?? s.Ticker;
            results.set(t, fallback(t, 'AI Advisor requires GEMINI_API_KEY for ApexScan AI integration.'));
        }
        return results;
    }

    // ── Build closed-loop ML memory ──
    const memoryContext = await buildClosedLoopMemory();

    // ── Phase 4: Machine Learning Prediction Engine ──
    console.log(`[AI Debate] Stage 0: Calling Python ML Engine for ${stocks.length} stocks...`);
    let isMlOffline = false;
    for (const s of stocks) {
        if (isMlOffline) {
            s.mlWinProbability = 'UNKNOWN (ML Offline)';
            s.mlAction = 'WATCH';
            continue;
        }
        try {
            const mlRes = await axios.post('http://127.0.0.1:8000/predict', {
                ticker: s.ticker ?? s.Ticker,
                rsi14: s.rsi14 ?? 50,
                adx14: s.adx14 ?? 15,
                volumeRatio: s.volumeRatio ?? 1.0,
                distFrom20dma: s.distFrom20dma ?? 0,
                distFrom50dma: s.distFrom50dma ?? 0,
                distFrom200dma: s.distFromDma200Pct ?? 0,
                pcr: s.pcr ?? 1.0,
                oiChangePct: s.oiChangePct ?? 0,
                sectorRs5d: s.sectorRs5d ?? 0,
                sectorRs20d: s.sectorRs20d ?? 0
            }, { timeout: 1000 });
            
            s.mlWinProbability = mlRes.data.winProbability;
            s.mlAction = mlRes.data.action;
        } catch (e: any) {
            console.warn(`[ML Engine] ML Server offline (${e.message}) — bypassing remaining ML checks.`);
            isMlOffline = true;
            s.mlWinProbability = 'UNKNOWN (ML Offline)';
            s.mlAction = 'WATCH';
        }
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
        setupType: s.setupType ?? 'Unknown',
        confidenceScore: s.confidenceScore ?? null,
        newsHeadlines: s.headlines ? s.headlines.slice(0, 3) : [],
        pcr: s.pcr ?? 'N/A',
        derivativeStatus: s.derivativeStatus ?? 'N/A',
        mlWinProbability: s.mlWinProbability,
        mlAction: s.mlAction,
    })).join('\n');

    try {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STAGE 1: Technical Analyst — Bullish Assessment
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const analystSystemPrompt = `${TECHNICAL_ANALYST_PROMPT}\n\n${memoryContext}`;
        const analystRaw = await runTechnicalAnalyst(
            analystSystemPrompt,
            `Analyse these ${stocks.length} stocks:\n${stockData}`,
            { maxTokens: 1500, temperature: 0.2 }
        );

        const analystAssessments: AIAssessment[] = parseJsonArray(analystRaw);
        console.log(`[AI Debate] Stage 1 (Technical Analyst): ${analystAssessments.length} assessments received ✓`);

        // Filter BUY and LIGHT BUY signals for the Risk Governor debate
        const bullishSignals = analystAssessments.filter(
            a => a.signal === 'BUY' || a.signal === 'LIGHT BUY'
        );

        // Non-bullish signals go straight to results (no debate needed)
        for (const a of analystAssessments) {
            if (a.signal !== 'BUY' && a.signal !== 'LIGHT BUY') {
                results.set(a.ticker, { ...a, debate_verdict: 'NO_DEBATE' });
            }
        }

        if (bullishSignals.length === 0) {
            console.log('[AI Debate] No bullish signals to debate. Skipping Stages 2-3.');
            return results;
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STAGE 2: Risk Governor — Contrarian Stress Test
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const bullishData = bullishSignals.map(s => {
            const originalStock = stocks.find(st => (st.ticker ?? st.Ticker) === s.ticker);
            return JSON.stringify({
                ticker: s.ticker,
                signal: s.signal,
                momentum_score: s.momentum_score,
                logic: s.logic,
                target_range: s.target_range,
                stop_loss: s.stop_loss,
                // Inject raw technicals for the Risk Governor to examine
                price: originalStock?.close ?? originalStock?.ltp,
                rsi14: originalStock?.rsi14,
                distFromDma200Pct: originalStock?.distFromDma200Pct,
                volumeRatio: originalStock?.volumeRatio,
                sector: originalStock?.sector,
                setupType: originalStock?.setupType,
                newsHeadlines: originalStock?.headlines?.slice(0, 3) ?? [],
                pcr: originalStock?.pcr,
                derivativeStatus: originalStock?.derivativeStatus,
            });
        }).join('\n');

        let riskAssessments: Array<{
            ticker: string;
            risk_level: string;
            bear_case: string;
            override_signal: string | null;
            confidence_penalty: number;
        }> = [];

        try {
            const riskRaw = await runRiskGovernor(
                RISK_GOVERNOR_PROMPT,
                `Stress-test these ${bullishSignals.length} bullish setups:\n${bullishData}`,
                { maxTokens: 1200, temperature: 0.5 }
            );
            riskAssessments = parseJsonArray(riskRaw);
            console.log(`[AI Debate] Stage 2 (Risk Governor): ${riskAssessments.length} risk assessments ✓`);
        } catch (riskErr: any) {
            console.warn('[AI Debate] Risk Governor failed — proceeding without contrarian view:', riskErr.message);
            // If risk governor fails, create neutral assessments
            riskAssessments = bullishSignals.map(s => ({
                ticker: s.ticker,
                risk_level: 'MEDIUM',
                bear_case: 'Risk assessment unavailable — apply standard caution.',
                override_signal: null,
                confidence_penalty: -0.5,
            }));
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // STAGE 3: Synthesizer — Final Verdict
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const synthesisInput = bullishSignals.map(bull => {
            const risk = riskAssessments.find(r => r.ticker === bull.ticker);
            return JSON.stringify({
                // Analyst view
                ticker: bull.ticker,
                analyst_signal: bull.signal,
                analyst_score: bull.momentum_score,
                analyst_logic: bull.logic,
                target_range: bull.target_range,
                stop_loss: bull.stop_loss,
                trigger_price: bull.trigger_price,
                trigger_volume_ratio: bull.trigger_volume_ratio,
                // Risk Governor view
                risk_level: risk?.risk_level ?? 'MEDIUM',
                bear_case: risk?.bear_case ?? 'No contrarian view available.',
                override_signal: risk?.override_signal ?? null,
                confidence_penalty: risk?.confidence_penalty ?? 0,
            });
        }).join('\n');

        try {
            const synthesisRaw = await runSynthesizer(
                SYNTHESIZER_PROMPT,
                `Reconcile these ${bullishSignals.length} bull vs bear debates:\n${synthesisInput}`,
                { maxTokens: 1500, temperature: 0.15 }
            );

            const finalVerdicts: AIAssessment[] = parseJsonArray(synthesisRaw);
            console.log(`[AI Debate] Stage 3 (Synthesizer): ${finalVerdicts.length} final verdicts ✓`);

            for (const verdict of finalVerdicts) {
                if (verdict.ticker) {
                    // Clamp momentum_score to 1-10
                    verdict.momentum_score = Math.max(1, Math.min(10, verdict.momentum_score));
                    const bullInput = bullishSignals.find(b => b.ticker === verdict.ticker);
                    if (bullInput) {
                        verdict.mlWinProbability = (bullInput as any).mlWinProbability;
                        verdict.mlAction = (bullInput as any).mlAction;
                    }
                    results.set(verdict.ticker, verdict);
                }
            }
        } catch (synthErr: any) {
            console.warn('[AI Debate] Synthesizer failed — using analyst + risk governor merge:', synthErr.message);
            // Manual merge fallback
            for (const bull of bullishSignals) {
                const risk = riskAssessments.find(r => r.ticker === bull.ticker);
                const penalty = risk?.confidence_penalty ?? 0;
                const adjustedScore = Math.max(1, Math.min(10, bull.momentum_score + penalty));

                let finalSignal = bull.signal;
                if (risk?.override_signal === 'REJECT') {
                    finalSignal = 'REJECT';
                } else if (risk?.override_signal === 'WATCH') {
                    finalSignal = 'WATCH';
                } else if (risk?.risk_level === 'HIGH' && finalSignal === 'BUY') {
                    finalSignal = 'LIGHT BUY';
                } else if (risk?.risk_level === 'HIGH' && finalSignal === 'LIGHT BUY') {
                    finalSignal = 'WATCH';
                }

                results.set(bull.ticker, {
                    ...bull,
                    signal: finalSignal as AIAssessment['signal'],
                    momentum_score: adjustedScore,
                    bear_case: risk?.bear_case ?? 'Contrarian analysis unavailable.',
                    debate_verdict: risk?.override_signal ? 'OVERRIDDEN' : (risk?.risk_level === 'HIGH' ? 'DOWNGRADED' : 'CONFIRMED'),
                    mlWinProbability: (bull as any).mlWinProbability,
                    mlAction: (bull as any).mlAction,
                });
            }
        }

        const debateStats = {
            confirmed: [...results.values()].filter(r => r.debate_verdict === 'CONFIRMED').length,
            downgraded: [...results.values()].filter(r => r.debate_verdict === 'DOWNGRADED').length,
            overridden: [...results.values()].filter(r => r.debate_verdict === 'OVERRIDDEN').length,
        };
        console.log(`[AI Debate] Pipeline complete: ${debateStats.confirmed} confirmed, ${debateStats.downgraded} downgraded, ${debateStats.overridden} overridden ✓`);

    } catch (err: any) {
        console.error('[AI Advisor] Multi-Agent Debate pipeline error:', err.message);
        const reason = err.message?.includes('GEMINI_API_KEY')
            ? 'AI service configuration error. Please check server logs.'
            : `AI analysis is temporarily unavailable. Review technicals manually.`;
        for (const s of stocks) {
            const t = s.ticker ?? s.Ticker;
            if (!results.has(t)) results.set(t, fallback(s, reason));
        }
    }

    return results;
}

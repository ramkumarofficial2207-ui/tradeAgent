import prisma from '../prismaClient';
import { claudeAsk } from '../claudeClient';
import { fetchNiftyData, SECTOR_MAP } from '../dataService';
import { fetchStockReport, StockReport } from '../fundamentalService';
import { geminiAsk } from '../geminiClient';
import { groqAsk } from '../groqClient';
import { analyzeNewsImpact, buildTechnicalContextFromStock } from '../newsImpactService';
import { ScanResult, TradeSetup } from '../types';
import { buildMarketGroundingFromReport } from '../newsIntel/marketGrounding';
import { detectChatIntent } from './intents';
import {
    BuildChatResponseInput,
    ChatIntent,
    ChatMeta,
    GroundedChatResponse,
} from './types';
import { getPortfolioNewsRisk, getPortfolioSummary } from '../portfolioService';
import { getTickerNewsDigest } from '../newsIntel/service';

function formatPrice(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    return `Rs ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function isoNow(): string {
    return new Date().toISOString();
}

function findSetup(scan: ScanResult | null, ticker: string): TradeSetup | null {
    return scan?.setups?.find(setup => setup.ticker === ticker) ?? null;
}

function deriveConfidence(report: StockReport | null, setup: TradeSetup | null): number {
    let score = 3;
    if (report) score += 2;
    if (setup) score += 2;
    if (report?.aboveDma200) score += 1;
    if (report?.outperformsNifty) score += 1;
    if ((report?.volumeRatio ?? 0) >= 1) score += 1;
    return Math.max(1, Math.min(score, 10));
}

function buildStockCard(report: StockReport, setup: TradeSetup | null) {
    const confidenceScore = setup?.confidenceScore ?? deriveConfidence(report, setup);
    const signal = (setup?.aiSignal ?? (confidenceScore >= 7 ? 'BUY' : 'WATCH')) as 'BUY' | 'LIGHT BUY' | 'WATCH' | 'REJECT';
    return {
        ticker: report.ticker,
        price: report.currentPrice,
        signal,
        buyZone: setup?.buyZone ?? report.currentPrice,
        target: setup?.target ?? report.target ?? undefined,
        stopLoss: setup?.stopLoss ?? report.stopLoss ?? undefined,
        targetPct: setup?.targetPct ?? (setup?.target ? +(((setup.target - report.currentPrice) / report.currentPrice) * 100).toFixed(2) : undefined),
        slPct: setup?.slPct ?? (setup?.stopLoss ? +(((report.currentPrice - setup.stopLoss) / report.currentPrice) * 100).toFixed(2) : undefined),
        riskReward: setup?.riskReward ?? report.riskReward ?? undefined,
        confidenceScore,
        sector: report.sector || SECTOR_MAP[report.ticker] || 'NSE',
        setupType: setup?.setupType ?? report.setupType ?? undefined,
    };
}

function makeMeta(partial: Partial<ChatMeta> = {}): ChatMeta {
    return {
        supportLevel: partial.supportLevel ?? 'supported',
        grounded: partial.grounded ?? true,
        liveDataUsed: partial.liveDataUsed ?? false,
        scannerContextUsed: partial.scannerContextUsed ?? false,
        dataUsed: partial.dataUsed ?? [],
        lastUpdated: partial.lastUpdated ?? null,
        notes: partial.notes ?? [],
    };
}

async function summarizeConcept(message: string): Promise<string> {
    const systemPrompt = [
        'You are ApexScan, an NSE market research assistant.',
        'Explain concepts clearly for Indian swing traders.',
        'Do not claim live data, self-learning, or unsupported forecasting.',
        'Keep the answer under 180 words.',
    ].join(' ');

    const fallback = 'I can explain market concepts, but the AI explanation service is unavailable right now. Ask about a supported NSE stock or scanner-backed setup if you need grounded live context.';

    try {
        return await geminiAsk(systemPrompt, message, { maxTokens: 220, temperature: 0.3 });
    } catch {
        try {
            return await claudeAsk(systemPrompt, message, { maxTokens: 220, temperature: 0.3 });
        } catch {
            try {
                return await groqAsk(systemPrompt, message, { maxTokens: 220, temperature: 0.3 });
            } catch {
                return fallback;
            }
        }
    }
}

function buildUnsupportedResponse(intent: ChatIntent): GroundedChatResponse {
    const note = intent.reason || 'This request is outside the current grounded product scope.';
    const reply = [
        `${note}`,
        '',
        'Current supported scope:',
        '- NSE stock research using latest available price and technical context',
        '- Scanner-backed setup review',
        '- Market pulse and portfolio risk summary',
        '- Market concept explanations',
        '',
        'Closest supported alternative: ask for an NSE stock, top scanner setups, portfolio risk, or a market concept.',
    ].join('\n');

    return {
        reply,
        stockCard: null,
        sources: ['Capability policy'],
        meta: makeMeta({
            supportLevel: 'unsupported',
            grounded: true,
            notes: ['Unsupported requests are declined instead of being guessed.'],
        }),
    };
}

function buildStockReply(report: StockReport, setup: TradeSetup | null, scan: ScanResult | null): GroundedChatResponse {
    const evidence = deriveConfidence(report, setup);
    const dataUsed = ['NSE quote snapshot', 'Technical indicators'];
    const notes: string[] = [];
    if (report.peRatio != null || report.roe != null) dataUsed.push('Fundamental snapshot');
    if (setup) dataUsed.push('Latest swing scanner');
    if (!setup) notes.push('No active scanner-backed setup is attached to this ticker right now.');
    if (report.volumeRatio == null) notes.push('Volume intensity is unavailable in the current snapshot.');

    const trendLine = `Trend: price is ${report.aboveDma200 ? 'above' : 'below'} 200 DMA, ${report.aboveEma50 ? 'above' : 'below'} 50 EMA, RSI ${report.rsi14 ?? 'N/A'}, volume ratio ${report.volumeRatio ?? 'N/A'}.`;
    const fundamentalLine = `Fundamentals: sector ${report.sector}, P/E ${report.peRatio ?? 'N/A'}, ROE ${report.roe ?? 'N/A'}, debt/equity ${report.debtToEquity ?? 'N/A'}.`;
    const scannerLine = setup
        ? `Scanner context: ${setup.setupType} with confidence ${setup.confidenceScore}/10, buy zone ${formatPrice(setup.buyZone)}, target ${formatPrice(setup.target)}, stop ${formatPrice(setup.stopLoss)}.`
        : 'Scanner context: no current swing setup is attached to this stock in the latest cached scan.';
    const verdictLine = setup
        ? `Verdict: evidence strength ${evidence}/10. Treat the scanner levels as the working trade frame and invalidate the idea if price loses the stop or volume confirmation fades.`
        : `Verdict: evidence strength ${evidence}/10. This is a grounded stock snapshot, but it is not a scanner-backed trade setup yet.`;
    const marketLine = scan?.marketStatus?.regime
        ? `Market regime: ${scan.marketStatus.regime}${scan.marketStatus.warning ? `, ${scan.marketStatus.warning}` : ''}.`
        : 'Market regime: unavailable in chat context.';

    const reply = [
        `Grounded stock view for ${report.ticker}.`,
        '',
        `${trendLine}`,
        `${fundamentalLine}`,
        `${scannerLine}`,
        `${marketLine}`,
        `${verdictLine}`,
    ].join('\n');

    return {
        reply,
        stockCard: buildStockCard(report, setup),
        sources: dataUsed,
        meta: makeMeta({
            supportLevel: setup ? 'supported' : 'partial',
            liveDataUsed: true,
            scannerContextUsed: !!setup,
            dataUsed,
            lastUpdated: report.fetchedAt,
            notes,
        }),
    };
}

function buildScannerReply(scan: ScanResult | null): GroundedChatResponse {
    if (!scan || !scan.setups.length) {
        return {
            reply: 'Scanner context is not ready yet. Run a market scan first or wait for the scheduled scan before asking for top setups.',
            stockCard: null,
            sources: ['Scanner cache'],
            meta: makeMeta({
                supportLevel: 'partial',
                scannerContextUsed: true,
                dataUsed: ['Scanner cache'],
                notes: ['No cached scan results were available for this chat request.'],
            }),
        };
    }

    const top = scan.setups.slice(0, 5).map((setup, index) =>
        `${index + 1}. ${setup.ticker} | ${setup.setupType} | confidence ${setup.confidenceScore}/10 | buy ${formatPrice(setup.buyZone)} | target ${formatPrice(setup.target)} | stop ${formatPrice(setup.stopLoss)}`
    );

    const reply = [
        `Latest scanner-backed setups from ${new Date(scan.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
        '',
        `Market regime: ${scan.marketStatus.regime || 'N/A'}${scan.marketStatus.warning ? ` | ${scan.marketStatus.warning}` : ''}`,
        ...top,
    ].join('\n');

    return {
        reply,
        stockCard: null,
        sources: ['Latest swing scanner'],
        meta: makeMeta({
            supportLevel: 'supported',
            scannerContextUsed: true,
            dataUsed: ['Latest swing scanner'],
            lastUpdated: scan.timestamp,
            notes: ['These are cached scan results, not ad hoc predictions.'],
        }),
    };
}

async function buildMarketReply(scan: ScanResult | null, message: string): Promise<GroundedChatResponse> {
    const pulse = scan?.marketStatus ?? await fetchNiftyData();
    const isWhyQuestion = /WHY|CAUSE|REASON/i.test(message);
    const dataUsed = scan?.marketStatus
        ? ['Market regime snapshot', 'Scanner market status']
        : ['Market pulse snapshot'];

    const lines = [
        'Grounded market pulse:',
        `- Nifty change: ${formatPct(pulse.niftyChange)}`,
        `- Sensex change: ${formatPct(('sensexChange' in pulse ? pulse.sensexChange : undefined) ?? null)}`,
        `- Midcap change: ${formatPct(('niftyMidcapChange' in pulse ? pulse.niftyMidcapChange : undefined) ?? null)}`,
        `- VIX change: ${formatPct(pulse.vixChange)}`,
    ];

    if ('goldChange' in pulse) lines.push(`- Gold proxy change: ${formatPct(pulse.goldChange ?? null)}`);
    if ('silverChange' in pulse) lines.push(`- Silver proxy change: ${formatPct(pulse.silverChange ?? null)}`);
    if ('regime' in pulse && pulse.regime) lines.push(`- Regime: ${pulse.regime}`);
    if ('warning' in pulse && pulse.warning) lines.push(`- Risk note: ${pulse.warning}`);
    if (isWhyQuestion) lines.push('- Causality note: this chat path can describe the market pulse, but it does not yet attach verified headline attribution inside the answer.');

    return {
        reply: lines.join('\n'),
        stockCard: null,
        sources: dataUsed,
        meta: makeMeta({
            supportLevel: isWhyQuestion ? 'partial' : 'supported',
            liveDataUsed: true,
            scannerContextUsed: !!scan?.marketStatus,
            dataUsed,
            lastUpdated: scan?.timestamp ?? isoNow(),
            notes: isWhyQuestion ? ['Headline attribution is not yet wired into market chat answers.'] : [],
        }),
    };
}

async function buildPortfolioReply(userId: string, scan: ScanResult | null): Promise<GroundedChatResponse> {
    const [summary, newsRisk, openTrades] = await Promise.all([
        getPortfolioSummary(userId),
        getPortfolioNewsRisk(userId, scan),
        prisma.trade.findMany({
            where: { userId, status: 'OPEN' },
            orderBy: { entryDate: 'desc' },
            take: 3,
        }),
    ]);

    if (!summary.openCount && !summary.closedCount) {
        return {
            reply: 'Your portfolio is empty in the app right now. Add trades first, then I can comment on concentration, open risk, and realized performance.',
            stockCard: null,
            sources: ['Portfolio database'],
            meta: makeMeta({
                supportLevel: 'partial',
                dataUsed: ['Portfolio database'],
                lastUpdated: isoNow(),
                notes: ['No portfolio trades were available for review.'],
            }),
        };
    }

    const topOpen = openTrades.length
        ? openTrades.map(trade => `- ${trade.ticker} | sector ${trade.sector || 'N/A'} | entry ${formatPrice(trade.entryPrice)} | current ${formatPrice(trade.currentPrice ?? trade.entryPrice)}`).join('\n')
        : '- No open positions';

    const reply = [
        'Grounded portfolio summary:',
        `- Open trades: ${summary.openCount}`,
        `- Closed trades: ${summary.closedCount}`,
        `- Win rate: ${summary.winRate}%`,
        `- Realized PnL: ${formatPrice(summary.totalRealizedPnL)}`,
        `- Open risk: ${formatPrice(summary.totalOpenRiskRs)} (${summary.avgOpenRiskPct}%)`,
        `- Largest position: ${summary.largestPositionPct}% of deployed capital`,
        `- Highest sector concentration: ${summary.topSector} (${summary.topSectorCount} open positions)`,
        `- Holdings with high-severity news: ${newsRisk.highSeverityCount}`,
        `- Holdings with regulatory news risk: ${newsRisk.regulatoryRiskCount}`,
        '',
        'Open positions:',
        topOpen,
    ].join('\n');

    const flagged = newsRisk.holdings
        .filter(item => item.status === 'HIGH_SEVERITY' || item.status === 'REGULATORY_RISK')
        .slice(0, 3)
        .map(item => `- ${item.ticker} | ${item.status} | sentiment ${item.avgSentiment} | ${item.latestHeadline || 'No headline'}`)
        .join('\n');

    const finalReply = flagged
        ? `${reply}\n\nNews risk flags:\n${flagged}`
        : reply;

    return {
        reply: finalReply,
        stockCard: null,
        sources: ['Portfolio database', 'News intelligence store'],
        meta: makeMeta({
            supportLevel: 'supported',
            dataUsed: ['Portfolio database', 'News intelligence store'],
            lastUpdated: isoNow(),
            notes: ['Portfolio analysis is based on trades saved inside the app and the latest normalized ticker news.'],
        }),
    };
}

async function buildPerformanceReply(): Promise<GroundedChatResponse> {
    const history = await prisma.historicalSetup.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
    });

    const resolved = history.filter(item => item.status === 'WON' || item.status === 'LOST');
    if (!resolved.length) {
        return {
            reply: 'There is not enough closed-trade history yet to claim a grounded win rate. Until that history exists, the assistant should not state an accuracy percentage.',
            stockCard: null,
            sources: ['Historical setup log'],
            meta: makeMeta({
                supportLevel: 'partial',
                dataUsed: ['Historical setup log'],
                lastUpdated: isoNow(),
                notes: ['Performance claims are withheld until enough resolved trades exist.'],
            }),
        };
    }

    const won = resolved.filter(item => item.status === 'WON');
    const lost = resolved.filter(item => item.status === 'LOST');
    const avgWin = won.length ? won.reduce((sum, item) => sum + (item.resultPct || 0), 0) / won.length : 0;
    const avgLoss = lost.length ? lost.reduce((sum, item) => sum + (item.resultPct || 0), 0) / lost.length : 0;
    const winRate = +((won.length / resolved.length) * 100).toFixed(1);

    const reply = [
        'Grounded track record summary:',
        `- Resolved setups: ${resolved.length}`,
        `- Won: ${won.length}`,
        `- Lost: ${lost.length}`,
        `- Win rate: ${winRate}%`,
        `- Average win: ${formatPct(avgWin)}`,
        `- Average loss: ${formatPct(avgLoss)}`,
        '',
        'Use this as historical evidence, not as a promise about the next trade.',
    ].join('\n');

    return {
        reply,
        stockCard: null,
        sources: ['Historical setup log'],
        meta: makeMeta({
            supportLevel: 'supported',
            dataUsed: ['Historical setup log'],
            lastUpdated: history[0]?.createdAt?.toISOString?.() ?? isoNow(),
            notes: ['Performance is based on stored resolved setups only.'],
        }),
    };
}

async function buildConceptReply(message: string): Promise<GroundedChatResponse> {
    const reply = await summarizeConcept(message);
    return {
        reply,
        stockCard: null,
        sources: ['Concept explainer'],
        meta: makeMeta({
            supportLevel: 'supported',
            dataUsed: ['Concept explainer'],
            notes: ['Concept explanations do not imply live market verification.'],
        }),
    };
}

async function buildNewsReply(message: string, ticker: string | undefined, scan: ScanResult | null): Promise<GroundedChatResponse> {
    const wantsLatestNews = /LATEST NEWS|HEADLINES|NEWS ON/i.test(message);
    if (ticker && wantsLatestNews && message.length < 240) {
        const digest = await getTickerNewsDigest(ticker, scan, true);
        if (!digest.itemCount) {
            return {
                reply: `I could not find recent normalized news for ${ticker} right now. Try again shortly or paste the headline/article text for direct impact analysis.`,
                stockCard: null,
                sources: ['News intelligence store'],
                meta: makeMeta({
                    supportLevel: 'partial',
                    grounded: true,
                    liveDataUsed: false,
                    scannerContextUsed: false,
                    dataUsed: ['News intelligence store'],
                    lastUpdated: null,
                    notes: ['No recent ticker news was available in the store.'],
                }),
            };
        }

        const reply = [
            `Latest normalized news for ${ticker}.`,
            '',
            `Average sentiment: ${digest.avgSentiment} | Bullish: ${digest.bullishCount} | Bearish: ${digest.bearishCount} | High impact: ${digest.highImpactCount}`,
            digest.regulatoryRisk ? 'Regulatory risk: yes' : 'Regulatory risk: no high-severity regulatory flag in the recent sample',
            digest.events.length ? `Detected events: ${Array.from(new Set(digest.events.map(event => event.type))).slice(0, 6).join(', ')}` : 'Detected events: none',
            digest.distribution ? `Distribution: tailwind ${digest.distribution.newsTailwindScore}, alignment ${digest.distribution.signalAlignment}, alert eligible ${digest.distribution.alertEligible ? 'yes' : 'no'}` : 'Distribution: unavailable',
            digest.marketGrounding ? `Grounding: CMP ${formatPrice(digest.marketGrounding.price)} | gap ${formatPct(digest.marketGrounding.gapPct)} | regime ${digest.marketGrounding.regime ?? 'N/A'} | breadth ${digest.marketGrounding.sectorBreadth?.breadthScore ?? 'N/A'}` : 'Grounding: unavailable',
            digest.analogs?.length ? `Historical analogs: ${digest.analogs.map(item => `${item.eventTypes.join('/')} (${item.sentiment})`).join(', ')}` : 'Historical analogs: none yet',
            '',
            ...digest.items.slice(0, 5).map((item, index) =>
                `${index + 1}. ${item.title} | ${item.impact.category} | score ${item.impact.news_sentiment_score} | ${item.impact.trade_signal}`
            ),
        ].join('\n');

        return {
            reply,
            stockCard: null,
            sources: ['News intelligence store'],
            meta: makeMeta({
                supportLevel: 'supported',
                grounded: true,
                liveDataUsed: !!digest.marketGrounding?.price,
                scannerContextUsed: !!digest.marketGrounding?.scannerSetup,
                dataUsed: ['News intelligence store', ...(digest.marketGrounding?.price ? ['Live market grounding'] : [])],
                lastUpdated: digest.latestPublishedAt,
                notes: ['These items were normalized and scored by the news intelligence engine.'],
            }),
        };
    }

    const report = ticker ? await fetchStockReport(ticker) : null;
    const setup = ticker ? findSetup(scan, ticker) : null;
    const marketGrounding =
        await buildMarketGroundingFromReport(
            report,
            setup,
            scan?.marketStatus,
            report?.sector && scan?.sectorBreadth ? scan.sectorBreadth[report.sector] ?? null : null,
        ) ?? buildTechnicalContextFromStock(report, setup);

    const analysis = await analyzeNewsImpact({
        headline: message.slice(0, 240),
        articleText: message,
        targetTicker: ticker,
        targetSector: report?.sector,
        currentMarketContext: scan?.marketStatus?.regime
            ? `${scan.marketStatus.regime}${scan.marketStatus.warning ? ` | ${scan.marketStatus.warning}` : ''}`
            : undefined,
        technicalContext: marketGrounding,
    });

    const lines = [
        `News impact analysis${analysis.ticker !== 'N/A' ? ` for ${analysis.ticker}` : ''}.`,
        '',
        `Category: ${analysis.category}`,
        `Sentiment: ${analysis.news_sentiment_score} | Magnitude: ${analysis.impact_magnitude}`,
        `Priced in: ${analysis.priced_in_assessment.status} | ${analysis.priced_in_assessment.reason}`,
        `Horizons: intraday ${analysis.time_horizon.intraday}, short-term ${analysis.time_horizon.short_term}, long-term ${analysis.time_horizon.long_term}`,
        `Trade posture: ${analysis.trade_signal}`,
        `Confirmation: ${analysis.market_grounding.confirmation_status} (${analysis.market_grounding.confirmation_score ?? 'N/A'}) | Tailwind ${analysis.distribution_flags.news_tailwind_score} | Alignment ${analysis.distribution_flags.signal_alignment}`,
        `${analysis.rationale}`,
    ];

    if (analysis.key_levels_to_watch.basis === 'TECHNICAL_CONTEXT') {
        lines.push(
            `Levels: support ${analysis.key_levels_to_watch.support.join(', ') || 'N/A'} | resistance ${analysis.key_levels_to_watch.resistance.join(', ') || 'N/A'}`
        );
    } else {
        lines.push('Levels: technical levels are unavailable because live chart context was not attached.');
    }

    return {
        reply: lines.join('\n'),
        stockCard: report ? buildStockCard(report, setup) : null,
        sources: ['News impact engine', ...(report ? ['NSE quote snapshot', 'Technical indicators'] : [])],
        meta: makeMeta({
            supportLevel:
                analysis.support_level === 'SUPPORTED'
                    ? 'supported'
                    : analysis.support_level === 'PARTIAL'
                        ? 'partial'
                        : 'unsupported',
            grounded: true,
            liveDataUsed: !!analysis.market_grounding.cmp,
            scannerContextUsed: !!analysis.market_grounding.scanner_setup,
            dataUsed: ['News impact engine', ...(analysis.market_grounding.cmp ? ['NSE quote snapshot', 'Technical indicators'] : [])],
            lastUpdated: report?.fetchedAt ?? isoNow(),
            notes: analysis.missing_inputs.length
                ? [`Missing inputs: ${analysis.missing_inputs.join(', ')}.`]
                : ['Impact analysis used the available news and market context.'],
        }),
    };
}

export async function buildGroundedChatResponse(input: BuildChatResponseInput): Promise<GroundedChatResponse> {
    const intent = detectChatIntent(input.message);

    if (intent.kind === 'unsupported_query') {
        return buildUnsupportedResponse(intent);
    }

    if (intent.kind === 'news_query') {
        return buildNewsReply(input.message, intent.ticker, input.lastSwingScan);
    }

    if (intent.kind === 'performance_query') {
        return buildPerformanceReply();
    }

    if (intent.kind === 'portfolio_query') {
        return buildPortfolioReply(input.userId, input.lastSwingScan);
    }

    if (intent.kind === 'scanner_query') {
        return buildScannerReply(input.lastSwingScan);
    }

    if (intent.kind === 'market_query') {
        return buildMarketReply(input.lastSwingScan, input.message);
    }

    if (intent.kind === 'stock_query' && intent.ticker) {
        const report = await fetchStockReport(intent.ticker);
        if (!report) {
            return {
                reply: `I could not verify a grounded live snapshot for ${intent.ticker} right now. Try again shortly, or ask for the latest scanner-backed setups instead.`,
                stockCard: null,
                sources: ['Stock data fetch'],
                meta: makeMeta({
                    supportLevel: 'partial',
                    grounded: true,
                    liveDataUsed: false,
                    dataUsed: ['Stock data fetch'],
                    notes: ['Live verification failed for this ticker.'],
                }),
            };
        }

        const setup = findSetup(input.lastSwingScan, intent.ticker);
        return buildStockReply(report, setup, input.lastSwingScan);
    }

    return buildConceptReply(input.message);
}

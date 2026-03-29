import { analyzeNewsImpact } from './newsImpactService';
import { getTickerNewsDigest } from './newsIntel/service';

export interface NewsValidation {
    blocked: boolean;
    reason: string;
    headlines: string[];
}

const NEGATIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /\bpledge\b/i, reason: 'Promoter pledge risk detected' },
    { pattern: /\bregulator|sebi|penalty|probe|fraud|raids?\b/i, reason: 'Regulatory risk headline detected' },
    { pattern: /\bdowngrade|cut to (?:sell|underperform)|negative outlook\b/i, reason: 'Negative analyst/sector downgrade' },
    { pattern: /\bresults today|earnings today|q[1-4] results\b/i, reason: 'Near-term earnings event risk' },
];

export async function validateNewsRisk(ticker: string): Promise<NewsValidation> {
    try {
        const digest = await getTickerNewsDigest(ticker, null, true);
        const headlines = digest.items.map(item => item.title).slice(0, 8);
        const joined = headlines.join(' | ');
        const analysis = analyzeNewsImpact({
            headline: headlines[0] || `${ticker} latest news`,
            articleText: joined,
            targetTicker: ticker,
        });
        const hit = NEGATIVE_PATTERNS.find((rule) => rule.pattern.test(joined));
        const blocked =
            !!hit ||
            (
                digest.regulatoryRisk ||
                (
                    analysis.news_sentiment_score <= -0.45 &&
                    (analysis.impact_magnitude === 'HIGH' || analysis.category === 'REGULATORY')
                )
            );

        if (blocked) {
            return {
                blocked: true,
                reason: hit?.reason || `${analysis.category}: ${analysis.rationale}`,
                headlines,
            };
        }
        return {
            blocked: false,
            reason: `${analysis.category}: ${analysis.rationale}`,
            headlines,
        };
    } catch {
        // Fail-open for signal generation, but include explicit message.
        return { blocked: false, reason: 'News source unavailable; manual check required', headlines: [] };
    }
}

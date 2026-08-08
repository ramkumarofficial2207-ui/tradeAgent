import { describe, expect, it } from 'vitest';
import { normalizePortfolioRisk } from '../apex-intelligence/src/lib/portfolioViewModel';

describe('portfolio risk view model', () => {
    it('maps the current portfolio intelligence API response into renderable values', () => {
        expect(normalizePortfolioRisk({
            openHoldings: 2,
            maxDamageTodayRs: 1250.5,
            maxDamageTodayPct: 1.75,
            suggestions: ['Reduce concentrated exposure.'],
        })).toEqual({
            totalOpenPositions: 2,
            totalCapitalRiskRs: 1250.5,
            capitalRiskPct: 1.75,
            warnings: ['Reduce concentrated exposure.'],
        });
    });

    it('continues to support the legacy portfolio response shape', () => {
        expect(normalizePortfolioRisk({
            totalOpenPositions: 1,
            totalCapitalRiskRs: 500,
            capitalRiskPct: 0.8,
            warnings: ['Legacy warning'],
        })).toEqual({
            totalOpenPositions: 1,
            totalCapitalRiskRs: 500,
            capitalRiskPct: 0.8,
            warnings: ['Legacy warning'],
        });
    });

    it('returns safe finite defaults for missing or malformed data', () => {
        const result = normalizePortfolioRisk({
            maxDamageTodayRs: undefined,
            maxDamageTodayPct: 'not-a-number',
            suggestions: null,
        });

        expect(result).toEqual({
            totalOpenPositions: 0,
            totalCapitalRiskRs: 0,
            capitalRiskPct: 0,
            warnings: [],
        });
        expect(() => result.totalCapitalRiskRs.toLocaleString('en-IN')).not.toThrow();
    });
});

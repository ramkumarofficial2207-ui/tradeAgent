import prisma from './prismaClient';
import { getCalibrationMap } from './edgeAnalyticsService';
import { MarketStatus, TradeSetup } from './types';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function derivePositionSizePct(setup: TradeSetup, marketStatus: MarketStatus): number {
    const regimeMult = marketStatus.positionSizeMult ?? (marketStatus.regime === 'BULLISH' ? 1 : marketStatus.regime === 'NEUTRAL' ? 0.5 : 0);
    const edgeFactor = clamp((setup.calibratedEdgeScore ?? setup.confidenceScore) / 10, 0.2, 1);
    const riskTightness = setup.slPct > 0 ? clamp(2 / setup.slPct, 0.35, 1.2) : 0.5;
    return +clamp(regimeMult * edgeFactor * riskTightness, 0, 1.5).toFixed(2);
}

export async function applyRiskGovernor(
    setups: TradeSetup[],
    marketStatus: MarketStatus
): Promise<TradeSetup[]> {
    if (!setups.length) return setups;

    const openTrades = await prisma.trade.findMany({
        where: { status: 'OPEN' },
        select: { sector: true },
    });
    const openSectorCounts = openTrades.reduce<Record<string, number>>((acc, trade) => {
        const key = trade.sector || 'Diversified';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const { setupMap, alignmentMap, confidenceMap, sectorMap, regimeMap, dayOfWeekMap, totals } = await getCalibrationMap();

    for (const setup of setups) {
        const alignment = setup.newsDistribution?.signalAlignment ?? 'UNAVAILABLE';
        const confidenceBand = setup.confidenceScore >= 8 ? 'HIGH' : setup.confidenceScore >= 6 ? 'MEDIUM' : 'LOW';
        const executionQuality = setup.executionQuality;
        const executionValues = [
            executionQuality?.breakoutQuality,
            executionQuality?.pullbackQuality,
            executionQuality?.gapQuality,
        ].filter((value): value is number => value != null);
        const avgExecutionQuality = executionValues.length
            ? executionValues.reduce((sum, value) => sum + value, 0) / executionValues.length
            : 0;
        const calibration =
            (setupMap.get(setup.setupType) ?? 0) +
            (alignmentMap.get(alignment) ?? 0) +
            (confidenceMap.get(confidenceBand) ?? 0) +
            (sectorMap.get(setup.sector || 'Diversified') ?? 0) +
            (regimeMap.get(marketStatus.regime ?? 'UNKNOWN') ?? 0) +
            (dayOfWeekMap.get(new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Calcutta' })) ?? 0);

        const confirmationBoost = setup.marketGrounding?.confirmationStatus === 'CONFIRMED'
            ? 0.45
            : setup.marketGrounding?.confirmationStatus === 'PARTIAL'
                ? 0.1
                : -0.35;
        const newsPenalty = setup.newsDistribution?.newsRiskFlag ? -0.8 : 0;
        const regulatoryPenalty = setup.newsDistribution?.regulatoryRiskFlag ? -1 : 0;
        const openSectorPenalty = (openSectorCounts[setup.sector] ?? 0) >= 2 ? -0.6 : 0;
        const regimePenalty = marketStatus.regime === 'RISK_OFF' ? -1.5 : marketStatus.regime === 'NEUTRAL' ? -0.2 : 0;
        const executionBoost = executionQuality
            ? (((avgExecutionQuality || 5) - 5) * 0.12) +
            (((executionQuality.effectiveRiskReward ?? setup.riskReward) - 1.5) * 0.35) +
            (((executionQuality.eventDurability ?? 5) - 5) * 0.14) +
            (setup.timeframe === 'Intraday'
                ? ((((executionQuality.structure5m ?? 5) + (executionQuality.structure15m ?? 5)) / 2) - 5) * 0.16
                : 0)
            : 0;
        const edgeScore = clamp(
            setup.confidenceScore + calibration + confirmationBoost + newsPenalty + regulatoryPenalty + openSectorPenalty + regimePenalty + executionBoost,
            0,
            10
        );

        const riskFlags = [
            setup.newsDistribution?.newsRiskFlag ? 'NEWS_RISK' : null,
            setup.newsDistribution?.regulatoryRiskFlag ? 'REGULATORY_RISK' : null,
            (openSectorCounts[setup.sector] ?? 0) >= 2 ? 'SECTOR_CONCENTRATION' : null,
            setup.marketGrounding?.confirmationStatus === 'UNCONFIRMED' ? 'WEAK_CONFIRMATION' : null,
            executionQuality?.effectiveRiskReward != null && executionQuality.effectiveRiskReward < 1.6 ? 'THIN_EXECUTION_RR' : null,
            avgExecutionQuality > 0 && avgExecutionQuality < 4.8 ? 'LOW_EXECUTION_QUALITY' : null,
            totals.expectancy < 0 ? 'NEGATIVE_EXPECTANCY_ENV' : null,
        ].filter((flag): flag is string => Boolean(flag));

        setup.calibratedEdgeScore = +edgeScore.toFixed(2);
        setup.positionSizePct = derivePositionSizePct({ ...setup, calibratedEdgeScore: edgeScore }, marketStatus);
        setup.riskFlags = riskFlags;
        setup.rejectionReasons = [
            ...(setup.rejectionReasons ?? []),
            ...(riskFlags.includes('REGULATORY_RISK') ? ['Regulatory headline conflict'] : []),
            ...(riskFlags.includes('NEWS_RISK') ? ['Negative or unstable news flow'] : []),
            ...(riskFlags.includes('SECTOR_CONCENTRATION') ? ['Sector concentration cap reached'] : []),
            ...(riskFlags.includes('WEAK_CONFIRMATION') ? ['Market confirmation is weak'] : []),
            ...(riskFlags.includes('THIN_EXECUTION_RR') ? ['Execution-adjusted reward-to-risk is too thin'] : []),
            ...(riskFlags.includes('LOW_EXECUTION_QUALITY') ? ['Breakout or pullback quality is below tradeable threshold'] : []),
        ];
        setup.confidenceDrivers = [
            ...(setup.confidenceDrivers ?? []),
            `Edge score ${setup.calibratedEdgeScore.toFixed(2)}/10`,
            `Regime ${marketStatus.regime ?? 'UNKNOWN'}`,
            `News alignment ${alignment}`,
            ...(executionQuality
                ? [`Execution avg ${(avgExecutionQuality || 0).toFixed(1)}/10 | Eff RR ${(executionQuality.effectiveRiskReward ?? setup.riskReward).toFixed(2)}:1`]
                : []),
        ];

        if (
            edgeScore < 5.6 ||
            riskFlags.includes('REGULATORY_RISK') ||
            riskFlags.includes('NEWS_RISK') ||
            riskFlags.includes('LOW_EXECUTION_QUALITY')
        ) {
            setup.aiSignal = 'WATCH';
        } else if (edgeScore >= 7.8 && setup.aiSignal === 'LIGHT BUY') {
            setup.aiSignal = 'BUY';
        }

        setup.newsDistribution = setup.newsDistribution
            ? {
                ...setup.newsDistribution,
                alertEligible:
                    setup.aiSignal === 'BUY' &&
                    edgeScore >= 7 &&
                    setup.marketGrounding?.confirmationStatus === 'CONFIRMED' &&
                    !riskFlags.includes('THIN_EXECUTION_RR') &&
                    !riskFlags.includes('LOW_EXECUTION_QUALITY') &&
                    !riskFlags.includes('REGULATORY_RISK') &&
                    !riskFlags.includes('NEWS_RISK'),
            }
            : setup.newsDistribution;
        setup.alertStage = setup.newsDistribution?.alertEligible
            ? 'TRADE_READY'
            : setup.marketGrounding?.confirmationStatus === 'CONFIRMED'
                ? 'TRIGGER_ARMED'
                : riskFlags.length
                    ? 'THESIS_INVALIDATED'
                    : 'SETUP_DETECTED';

        const governorLine = `Edge ${setup.calibratedEdgeScore}/10 | Size ${setup.positionSizePct}%${riskFlags.length ? ` | ${riskFlags.join(', ')}` : ''}`;
        setup.aiLogic = setup.aiLogic ? `${governorLine}\n${setup.aiLogic}` : governorLine;
    }

    return setups.sort((a, b) => (b.calibratedEdgeScore ?? b.confidenceScore) - (a.calibratedEdgeScore ?? a.confidenceScore));
}

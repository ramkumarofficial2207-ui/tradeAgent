export interface PortfolioRiskViewModel {
  warnings: string[];
  totalOpenPositions: number;
  totalCapitalRiskRs: number;
  capitalRiskPct: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asFiniteNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function normalizePortfolioRisk(value: unknown): PortfolioRiskViewModel {
  const data = asRecord(value);

  return {
    warnings: asWarnings(data.warnings ?? data.suggestions),
    totalOpenPositions: asFiniteNumber(data.totalOpenPositions ?? data.openHoldings),
    totalCapitalRiskRs: asFiniteNumber(data.totalCapitalRiskRs ?? data.maxDamageTodayRs),
    capitalRiskPct: asFiniteNumber(data.capitalRiskPct ?? data.maxDamageTodayPct),
  };
}

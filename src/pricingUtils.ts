// =====================================================
// pricingUtils.ts — NSE Tick-Size Rounding & Formatting
// Standard NSE Tick Step = ₹0.05
// =====================================================

/**
 * Rounds a stock price to the nearest NSE tick step (₹0.05).
 */
export function roundToNSETick(price: number): number {
  if (!price || !Number.isFinite(price) || price <= 0) return 0;
  const rounded = Math.round(price / 0.05) * 0.05;
  return +rounded.toFixed(2);
}

/**
 * Formats a price into a consistent 2-decimal INR price string (e.g., "1714.70").
 */
export function formatINR(price: number): string {
  return roundToNSETick(price).toFixed(2);
}

// Backward-compatible aliases for existing codebase references
export const roundToNseTick = roundToNSETick;
export const formatNsePrice = formatINR;

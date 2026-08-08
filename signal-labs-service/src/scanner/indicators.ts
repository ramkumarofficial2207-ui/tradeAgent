/**
 * scanner/indicators.ts
 * Mathematical indicators: RSI, ATR, EMAs, Bollinger Band Width, Close-to-High Bar Closing Strength Ratio
 */

export interface OHLCV {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((acc, val) => acc + val, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateSMA(values: number[], period: number): number {
  if (values.length < period) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const slice = values.slice(values.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateATR(candles: OHLCV[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }
  return calculateSMA(trs, period);
}

export function calculateBarClosingStrength(candle: OHLCV): number {
  const range = candle.high - candle.low;
  if (range <= 0) return 1.0;
  return (candle.close - candle.low) / range;
}

export function calculateBollingerBandWidth(prices: number[], period = 20): { sma: number; width: number } {
  if (prices.length < period) {
    const sma = calculateSMA(prices, prices.length);
    return { sma, width: 0.05 };
  }
  const slice = prices.slice(prices.length - period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, val) => acc + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = sma + 2 * stdDev;
  const lower = sma - 2 * stdDev;
  const width = sma > 0 ? (upper - lower) / sma : 0;
  return { sma, width };
}

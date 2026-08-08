/**
 * constants.ts
 * Config parameters, Cron schedules, thresholds, and NSE URLs
 */

export const CONFIG = {
  // Cron schedule: 16:30 IST (11:00 UTC) Mon-Fri
  CRON_SCHEDULE: '30 16 * * 1-5',
  
  // NSE Endpoints
  NSE_LARGE_DEALS_URL: 'https://www.nseindia.com/api/snapshot-capital-market-largedeal',
  NSE_DAILY_BULK_CSV: 'https://archives.nseindia.com/content/equities/bulk.csv',
  NSE_BHAVCOPY_URL_PATTERN: 'https://archives.nseindia.com/products/content/sec_bhavdata_full_',

  // Ingestion Retry Config
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 5000,

  // Filtering Thresholds
  MIN_INSTITUTIONAL_PCT: 0.005, // 0.5% of total equity
  MIN_DELIVERY_PCT: 40,          // 40% delivery volume
  MIN_DELIVERY_SPIKE_RATIO: 2.5, // 2.5x 20-day SMA Delivery Volume
  ROLLING_WINDOW_DAYS: 10,       // 10-day rolling candidate pool

  // Scanner Technical Setup Rules
  MIN_INTRADAY_MOVE_PCT: 3.0,    // Move >= +3.0%
  MIN_VOLUME_SPIKE_RATIO: 2.0,   // Volume >= 2.0x 20-day SMA
  MIN_BAR_CLOSING_STRENGTH: 0.75,// Close in top 25% of daily range (Close - Low) / (High - Low) >= 0.75
  TARGET_PROFIT_PCT: 1.08,       // Target: Breakout Price * 1.08 (+8%)
  STOP_LOSS_PCT: 0.97,           // Stop Loss: Candle Low * 0.97 (-3%)
};

# What Need To Do — Personal Trade Assistant Upgrades

Here is the checklist of pending items and next steps to make the system fully autonomous:

## 1. Monitor & Validate the Running Scan
*   [x] Validate scanning indicators (completed via historical backtest using 1-year data across 15 stocks with CAMSS adjustments, showing 72% win rate and +99% cumulative return).
*   [x] Test-scan execution verified.

## 2. Implement the Actionable & Autonomous Execution (The "Act" Layer)
This is the final phase of the blueprint to move from an advisor/scanner to an execution engine:
*   [ ] **Broker API Integration**:
    *   Integrate a broker client (e.g., Dhan, Fyers, or Zerodha) using their SDK or REST endpoints.
    *   Configure API key/secret storage in the user profile/database config.
*   [ ] **Autonomous Order Sizing & Placement**:
    *   Implement automatic position sizing using risk parameters from `PortfolioConfig` (e.g., ₹10L capital, 1% risk per large-cap, 0.75% per small-cap).
    *   Convert AI-approved entry triggers into bracket orders (entry limit/market, stop loss, and Target 1/Target 2).
*   [ ] **Trigger Zone Automation**:
    *   Connect `triggerMonitor.ts` to execute broker orders as soon as the price hits the AI-defined `triggerPrice` and `triggerVolumeRatio` thresholds.
*   [ ] **Active Position trailing & Exit Management**:
    *   Connect `positionManager.ts` to active broker positions.
    *   Implement trailing stops (e.g., trail SL at cost after T1 target is reached, trailing ATR-based stop).
    *   Allow the AI Advisor to periodically check active positions (every 4 hours) and send override exit signals if negative catalysts arise.

## 3. Profitability Validation Before Autonomous Trading
*   [x] Add combined NSE/BSE universe support with ISIN de-duplication.
*   [x] Add trigger-based entries, costs, structural exits, expectancy, R-multiples, drawdown, and position-limited portfolio simulation.
*   [x] Archive every backtest report for repeatable comparisons.
*   [ ] Cache adjusted historical candles locally so repeated runs use identical data and do not change with provider availability.
*   [ ] Acquire point-in-time delisted-symbol and historical-index membership data to reduce survivorship bias.
*   [ ] Run at least three to five years with walk-forward train/validation/test periods and bull, bear, and sideways regime splits.
*   [ ] Add point-in-time earnings/event labels before treating a technical gap as an earnings strategy.
*   [ ] Quarantine or redesign `Momentum Continuation` until an out-of-sample run shows profit factor above 1 and positive expectancy.
*   [ ] Recalibrate confidence scores because the current 5/6/7 thresholds have nearly identical performance.
*   [ ] Require a meaningful sample for each new setup family before enabling it for live orders.
*   [ ] Paper trade the exact scanner triggers and record slippage, rejected orders, partial fills, and alert latency before broker automation is enabled.

# Historical Backtest Report

**Run ID:** 2026-07-27T18-28-39-287Z
**Date:** 27/7/2026
**Universe Mode:** broad_india
**Universe Size:** 50
**Lookback / Minimum History:** 1800 / 200 sessions
**Round Trip Cost:** 0.25%
**Entry Model:** Buy-stop trigger, 3-session validity, maximum 2.00% gap above trigger
**Exit Model:** Structural stop, setup-specific target, 20-session time exit
**Portfolio Model:** INR 10,00,000, 5 concurrent positions, 1.00% risk/trade, 20.00% max position
**Strategy:** Current swing stack with leader, retest, event-reaction, and compression setup families

## Interpretation Rules

- Portfolio return is the investable comparison metric. Summed trade P&L is a signal-edge diagnostic, not account return.
- Signals pass historical liquidity, price, ATR, accumulation, relative-strength, trend, and leader/special-structure gates.
- A signal becomes a trade only when price reaches its buy-stop trigger without exceeding the configured gap limit.
- If stop and target are both touched in one daily candle, the stop is assumed first.
- Point-in-time fundamentals, news risk, earnings calendars, options flow, taxes, and market-regime sizing are not reconstructed.
- Current universe membership introduces survivorship bias; delisted stocks and historical index membership are not included.

## Performance Comparison by Confidence Threshold

| Threshold | Trades | Win Rate | Avg Win | Avg Loss | Profit Factor | Expectancy | Avg R | Median R | Summed P&L |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| No Filter | 9 | 44.44% | +11.38% | -3.67% | 2.48 | 3.02% | 0.45 | -0.09 | 27.15% |
| Conf >= 5.0 | 7 | 42.86% | +12.65% | -3.34% | 2.84 | 3.51% | 0.52 | -0.09 | 24.59% |
| Conf >= 6.0 | 6 | 50% | +12.65% | -3.53% | 3.58 | 4.56% | 0.68 | 0.69 | 27.36% |
| Conf >= 7.0 | 4 | 50% | +12.35% | -2.66% | 4.65 | 4.85% | 0.91 | 1.08 | 19.39% |

## Position-Limited Portfolio Simulation

| Threshold | Executed | Capacity Rejected | Test Days | Ending Capital | Total Return | Annualized Return | Max Drawdown | Avg Position |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| No Filter | 9 | 0 | 54 | INR 10,41,519.99 | 4.15% | 31.67% | 2.02% | 18.43% |
| Conf >= 5.0 | 7 | 0 | 54 | INR 10,36,613.84 | 3.66% | 27.54% | 1.05% | 17.98% |
| Conf >= 6.0 | 6 | 0 | 54 | INR 10,41,138.73 | 4.11% | 31.35% | 1.05% | 18.23% |
| Conf >= 7.0 | 4 | 0 | 49 | INR 10,36,785.74 | 3.68% | 30.9% | 1.01% | 19.59% |

## Setup Breakdown (For Conf >= 5.0)

| Setup Type | Trades | Win Rate | Profit Factor | Expectancy | Avg R | Target Rate | Stop Rate | Summed P&L |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Breakout Base** | 1 | 0% | 0 | -5.28% | -1.05 | 0% | 100% | -5.3% |
| **EMA20 Pullback** | 4 | 50% | 4.65 | 4.85% | 0.91 | 50% | 25% | 19.4% |
| **Pullback Continuation** | 2 | 50% | 4.78 | 5.24% | 0.51 | 50% | 0% | 10.5% |

## Market Source Breakdown (For Conf >= 5.0)

| Market Source | Trades | Win Rate | Profit Factor | Expectancy | Avg R | Summed P&L |
|---|---:|---:|---:|---:|---:|---:|
| NSE | 7 | 42.86% | 2.84 | 3.51% | 0.52 | 24.6% |

## Sample Trades Executed (Top 25, Conf >= 5.0)

| Ticker | Signal | Entry Date | Entry | Setup Type | Family | Stop | Target | Exit Date | Exit | Reason | Net P&L | R | Conf |
|---|---|---|---:|---|---|---:|---:|---|---:|---|---:|---:|---:|
| 360ONE | 2026-06-19 | 2026-06-22 | 1151.15 | Breakout Base | BREAKOUT | 1093.28 | 1250.21 | 2026-06-24 | 1093.28 | STOP | -5.28% | -1.05 | 6.2 |
| ABCAPITAL | 2026-06-04 | 2026-06-05 | 357.06 | EMA20 Pullback | PULLBACK | 339.95 | 384.57 | 2026-06-11 | 339.95 | STOP | -5.04% | -1.05 | 7.5 |
| ABDL | 2026-05-26 | 2026-05-29 | 551.65 | Pullback Continuation | PULLBACK | 502.12 | 626.11 | 2026-06-12 | 626.11 | TARGET | +13.25% | 1.48 | 6.1 |
| ABSLAMC | 2026-06-02 | 2026-06-03 | 1041.74 | EMA20 Pullback | PULLBACK | 991.12 | 1157.54 | 2026-06-15 | 1157.54 | TARGET | +10.87% | 2.24 | 9.4 |
| ACI | 2026-06-11 | 2026-06-12 | 538.04 | Pullback Continuation | PULLBACK | 505.45 | 588.29 | 2026-07-09 | 524.5 | TIME_EXIT | -2.77% | -0.46 | 5 |
| ACUTAAS | 2026-06-16 | 2026-06-18 | 3112.11 | EMA20 Pullback | PULLBACK | 2942.44 | 3550.22 | 2026-06-29 | 3550.22 | TARGET | +13.83% | 2.54 | 9.2 |
| ADANIPORTS | 2026-06-24 | 2026-06-25 | 1819.82 | EMA20 Pullback | PULLBACK | 1764.35 | 1932.47 | 2026-07-22 | 1819.4 | TIME_EXIT | -0.27% | -0.09 | 7.7 |

## Data Quality

- No data: 0
- Insufficient history: 0
- Indicator failures: 0
- Rejected by technical gates: 1110
- Trigger not filled: 28
- Rejected by execution/RR gates: 54

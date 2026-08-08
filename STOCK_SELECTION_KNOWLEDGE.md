# Stock Selection Knowledge Base

This document explains how the current stock-picking system works, which strategies it uses, which indicators it relies on, and how a stock moves from the universe into a final trade setup.

The implementation documented here is based on:

- `src/scanner.ts`
- `src/indicators.ts`
- `src/aiAdvisor.ts`
- `src/newsValidator.ts`
- `src/earningsValidator.ts`
- sample output files in `data/`

## 1. Core Idea

The system is a hybrid technical scanner with a strong momentum bias. It does not pick stocks from a single indicator. Instead, it:

1. Builds a liquid universe.
2. Filters out weak or unsafe names.
3. Scores the remaining stocks using trend, volume, relative strength, and setup quality.
4. Detects a specific setup type such as breakout, bull flag, VCP, compression, pullback, or deep value reversal.
5. Applies risk-reward, news, earnings, options-flow, and regime checks.
6. Ranks the final setups and keeps the best ones.

The main design principle is:

- strong trend or clean reversal structure
- confirmed by volume
- supported by relative strength versus Nifty
- backed by a good risk-reward profile

## 2. Stock Selection Flow

### Swing scanner

The swing scanner follows this sequence:

1. Build universe from liquid NSE names and add news-catalyst tickers.
2. Require at least 20 candles for liquidity calculation.
3. Require at least 200 candles for technical analysis.
4. Require price >= `50`.
5. Require daily turnover >= `10 Cr`.
6. Reject stocks with excessive ATR volatility.
7. Compute indicators.
8. Require accumulation score >= `45`.
9. Accept either:
   - a standard trend structure
   - a bull flag setup
   - a deep value reversion setup
10. Reject bad options flow, if available.
11. Sort qualified names by composite momentum score.
12. Convert qualified names into trade setups.
13. Reject setups with weak risk-reward, news risk, or earnings risk.
14. Rank the final setups and keep the top 8.

### Intraday scanner

The intraday scanner uses a similar but faster process:

1. Limit the universe to a curated intraday list.
2. Use 5-minute candles.
3. Require enough session history.
4. Require EMA alignment or a tight pullback near EMA20.
5. Require healthy RSI, ADX, volume, and relative strength.
6. Require accumulation score >= `45`.
7. Confirm price is above VWAP.
8. Confirm opening-range breakout or first-pullback hold.
9. Score 5-minute and 15-minute structure.
10. Reject weak execution-quality or poor risk-reward setups.

## 3. Universe Building

The scanner does not search every stock blindly. It begins with a tradable universe.

### Swing universe

The swing scanner uses two sources:

- dynamic NSE bhavcopy universe for liquid names
- static fallback universe if bhavcopy is unavailable

It also adds:

- news catalyst tickers discovered from the news intelligence layer

This means the scanner can still look at stocks with fresh news even before they fully show up as technical leaders.

### Liquidity gates

Before a stock can even be considered, it must pass:

- minimum daily turnover: `10 Cr`
- minimum history: `200` candles
- minimum price: `50`
- ATR percentage ceiling: `12%`

These are important because the system is meant to focus on tradeable names, not illiquid noise.

## 4. Indicators Used

This is the complete indicator set currently used by the scanner.

| Indicator / Feature | How It Is Used |
| --- | --- |
| `SMA(200)` / 200 DMA | Long-term trend filter and distance-from-trend measure |
| `EMA(50)` | Intermediate trend and pullback reference |
| `EMA(20)` | Short-term trend, bounce level, and breakout support |
| `RSI(14)` | Momentum zone, overbought/oversold filter, setup quality |
| `ADX(14)` | Trend strength filter |
| 50 EMA slope over 10 days | Confirms whether trend is rising |
| 20-day average volume | Liquidity and volume baseline |
| Today volume / 20-day average volume | Volume expansion confirmation |
| 1-month return | Relative strength and swing scoring |
| 3-month return | Relative strength and swing scoring |
| 6-month return | Medium-term trend contribution |
| 10-day return | Bull flag and continuation logic |
| 52-week high proximity | Quality of trend continuation setups |
| Distance from 200 DMA | Stretch / oversold / reversal context |
| Accumulation score | Demand proxy based on up-volume vs down-volume |
| VCP metrics | Volatility contraction setup detection |
| Compression metrics | Tight range, NR4/NR7, inside-bar pattern detection |
| Opening range, VWAP | Intraday execution logic |
| 5-minute and 15-minute structure | Intraday confirmation |
| Options PCR and derivative status | Risk filter and flow confirmation |
| News sentiment / news risk | Setup block or contextual filter |
| Earnings calendar | Setup block to avoid event risk |
| Market regime using Nifty and VIX | Position sizing and risk permission |

## 5. Main Strategies Used

The scanner uses multiple strategy families. A stock can qualify under more than one.

### 5.1 Trend continuation

This is the default strategy.

Typical characteristics:

- price above 200 DMA
- price above or near 20 EMA and 50 EMA
- positive ADX
- volume at or above normal
- stock outperforming Nifty
- RSI in a healthy momentum zone

This is the most common “clean” setup family.

### 5.2 Breakout base

This looks for a stock breaking out of a recent consolidation or base.

Typical characteristics:

- close above recent swing high
- trend still aligned
- volume expansion on breakout
- RSI and ADX supportive

The system also scores breakout quality separately, so not every breakout is accepted.

### 5.3 Bull flag breakout

This is a short-swing momentum pattern.

Detected when:

- 10-day return is at least `15%`
- price holds above `EMA20`
- RSI is at least `60`
- volume is drying up on the flag portion

The logic is that the stock already had an impulsive move, then paused without heavy selling, and may continue higher.

### 5.4 VCP breakout / contraction

VCP means volatility contraction pattern.

The detector looks for:

- a prior peak that is not too far back
- price staying close to the pivot
- shrinking ranges over time
- volume drying up
- breakout volume confirmation

This is a classic tight-base continuation setup.

### 5.5 Compression breakout

This is a narrower version of consolidation detection.

It uses:

- NR4 / NR7 style tight-range candles
- inside bars
- volume dry-up
- price staying close to the pivot
- tight overall range

This strategy favors “coiled spring” price action.

### 5.6 EMA20 bounce

Used mainly in intraday and short swing contexts.

The system looks for:

- price near EMA20
- EMA20 holding above EMA50
- bullish structure after a pullback

This is a shallow pullback continuation setup.

### 5.7 EMA50 pullback

This is a deeper pullback strategy inside an uptrend.

Used when:

- price is near EMA50
- trend remains constructive
- volume and RSI support a rebound

### 5.8 Deep value reversion

This is the main reversal strategy.

Detected when:

- price is at least `10%` below 200 DMA
- RSI is below `35`
- volume ratio is at least `1.5`
- the latest candle closes above its open

The stop and target logic are different for this setup because the stock is intentionally below long-term trend.

### 5.9 Momentum continuation

Used when a stock is already near the highs and still showing strength.

Typical clues:

- near 52-week high
- strong RSI
- strong close location
- momentum still intact

### 5.10 Intraday opening-range breakout / first-pullback hold

The intraday scanner uses a separate strategy:

- above VWAP
- breakout of opening range, or
- first pullback that holds support

It also checks 5-minute and 15-minute trend structure.

## 6. How a Stock Gets Qualified

### Swing qualification rules

After basic liquidity checks, a swing candidate must satisfy the core technical gate:

- price above 200 DMA
- RSI between `45` and `80`
- ADX at least `10`
- volume ratio at least:
  - `1.0` for larger names
  - `1.1` for small caps
- 20-day average volume at least `150,000`
- not more than `35%` below the 52-week high
- 50 EMA slope positive

Then it must also pass the demand proxy:

- accumulation score at least `45`

If it does not fit standard trend structure, it can still pass as:

- bull flag
- deep value reversion

### Intraday qualification rules

The intraday path is stricter on structure:

- EMA alignment or tight pullback near EMA20
- RSI between `50` and `78`
- ADX at least `16`
- volume ratio at least `1.05`
- 20-day average volume at least `20,000`
- relative strength not worse than Nifty by more than `0.5%`
- accumulation score at least `45`
- price above VWAP
- opening-range breakout or first-pullback hold
- acceptable 5m and 15m structure scores

## 7. Scoring Logic

The scanner does not simply accept or reject. It scores.

### Initial composite ranking

Qualified swing candidates are sorted by a simple composite score:

- volume ratio
- relative strength versus Nifty
- ADX
- RSI

### Confidence score

The confidence score is built from 5 components:

1. Trend strength
2. Volume expansion
3. Relative strength
4. Setup quality
5. Risk-reward

The setup passes when total confidence is at least `7.0` out of `10`.

### Setup quality details

Setup quality combines:

- RSI zone
- distance from 200 DMA
- proximity to 52-week high

### Risk-reward details

Risk-reward is built from:

- entry price
- stop loss
- target price
- estimated slippage

The minimum acceptable risk-reward is normally `1.5:1`.

For strong early continuation setups, the scanner allows a lower threshold if the structure is still high quality.

## 8. Stop Loss and Target Logic

Stops are not arbitrary. They depend on the setup type.

### Deep value reversion

- stop below the lowest low of the last 15 days, with buffer

### VCP and bull flag

- stop below the recent pivot low, with a tight buffer

### Standard trend setup

- stop below EMA20 or based on ATR distance

### Target logic

- default target is `3 x ATR`
- secondary target is also derived from ATR
- deep value reversals may target EMA50 if the math makes sense

## 9. Risk Filters

This system is intentionally conservative about bad risk conditions.

### News risk

The scanner checks news headlines and can block a setup if it detects:

- pledge risk
- regulatory risk
- probe / fraud / penalty language
- near-term earnings risk
- negative analyst downgrade language

### Earnings risk

If earnings are within the safety window, the setup is blocked to avoid gap risk.

### Options flow risk

If options data is available:

- `Short Buildup` is rejected
- `PCR < 0.6` is rejected

### Regime risk

The market regime affects position sizing:

- `BULLISH` = full size
- `NEUTRAL` = half size
- `RISK_OFF` = no new longs

The regime uses:

- Nifty 50 DMA vs 200 DMA
- India VIX
- institutional flow as an overlay

## 10. Market Regime Rules

The regime detector uses Nifty candles plus VIX.

- `BULLISH` when Nifty 50 DMA is above 200 DMA and VIX is calm
- `RISK_OFF` when Nifty 50 DMA is below 200 DMA and VIX is elevated
- `NEUTRAL` for everything else

This does not change the strategy family, but it changes how aggressive the system should be.

## 11. Final Ranking Rules

After all setup-level checks, the system keeps the strongest setups and ranks them by:

- setup category preference
- calibrated edge score
- confluence score
- confidence score
- risk-reward

Only the top 8 setups are kept in the final result.

The category preference gives priority to:

- `TOMORROW` continuation setups before
- `SWING_2_5` setups

## 12. AI Layer

The AI layer is an overlay, not the primary selector.

It can:

- label a stock as `BUY`, `LIGHT BUY`, `WATCH`, or `REJECT`
- add a momentum score
- suggest a trigger price
- suggest a trigger volume ratio
- provide a bear case

But the stock still has to pass the technical and risk filters first.

In other words:

- technical rules pick the stock
- AI refines the narrative and execution context

## 13. What the JSON Files Represent

The data files in `data/` are outputs of the system:

- `data/edge-analytics.json` contains setup metadata such as setup type, confidence, confluence, regime, risk-reward, and position size
- `data/news-intelligence.json` contains news impact, sentiment, trade signal, and risk flags
- `data/trades.json` contains active or exited trade records

These files are useful for understanding the system’s behavior, but they are not the source of the strategy itself.

## 14. Quick Summary

If I compress the whole system into one sentence:

> It picks liquid NSE stocks that show trend or reversal structure, confirms them with volume and relative strength, filters out news/earnings/options risk, scores the setup quality and risk-reward, and then keeps the best-ranked trade setups.

## 15. Practical Reading Guide

If you want to interpret a pick quickly, check these first:

1. Is it above 200 DMA?
2. Is RSI in a healthy zone?
3. Is volume above average?
4. Is ADX showing trend strength?
5. Is it outperforming Nifty?
6. Is the setup a breakout, pullback, bull flag, VCP, compression, or reversal?
7. Is the risk-reward acceptable after slippage?
8. Is there news or earnings risk?
9. Is the market regime supportive?

If most of those are yes, the system is likely to like the stock.


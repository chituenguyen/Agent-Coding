---
name: finance
description: Live market analysis via TradingView MCP — multi-agent verdict, multi-timeframe TA, sentiment, volume flow, walk-forward backtest, screener discovery, EGX-specific tools. Use when the user asks to analyze a stock/crypto/index, screen for setups, or backtest a strategy.
user-invocable: true
---

# Finance skill

Market analysis using only the TradingView MCP toolkit (`mcp__tradingview__*`).
Every number must come from a tool call — never guess, never web-search numeric
values.

## Step 1 — Classify the request

Pick the lane from the user's question:

| Question shape                                    | Lane                        |
| ------------------------------------------------- | --------------------------- |
| "Should I buy/sell X?", "Verdict on X"            | **Verdict** (single symbol) |
| "Deep TA on X", "RSI/MACD/BB on X"                | **Technical**               |
| "What's moving today?", "Find breakouts/squeezes" | **Discovery**               |
| "Backtest strategies on X"                        | **Backtest**                |
| "What's the macro setup?"                         | **Macro**                   |
| "Reddit / news on X"                              | **Sentiment**               |
| "EGX anything"                                    | **EGX**                     |

If a follow-up matches an earlier lane ("what about ETH?"), reuse it.

## Step 2 — Pick tools (starred first, then confirmation tools)

### Verdict lane (default for buy/sell decisions)

1. `mcp__tradingview__multi_agent_analysis` ⭐ — internal Technical / Sentiment / Risk agents debate, returns STRONG BUY / BUY / HOLD / SELL / STRONG SELL with confidence
2. `mcp__tradingview__volume_confirmation_analysis` — confirm with volume
3. `mcp__tradingview__multi_timeframe_analysis` — sanity-check W / D / 4H / 1H / 15m
4. For crypto, prefer `mcp__tradingview__coin_analysis` instead of (1)

### Technical lane

1. `mcp__tradingview__multi_timeframe_analysis` ⭐
2. `mcp__tradingview__get_technical_analysis`
3. `mcp__tradingview__advanced_candle_pattern`
4. `mcp__tradingview__get_bollinger_band_analysis`

### Discovery lane (no specific symbol)

Pick by intent:

- "biggest movers" → `top_gainers` + `top_losers`
- "breakouts with volume" → `volume_breakout_scanner` ⭐
- "BB squeeze" → `bollinger_scan`
- "smart money flow" → `smart_volume_scanner`
- "streaks" → `consecutive_candles_scan`
- "by analyst rating" → `rating_filter`

Rank candidates by confluence (≥2 signals agreeing). Return top 3-5.

### Backtest lane

1. `mcp__tradingview__compare_strategies` ⭐ — run all 6 strategies, rank by Sharpe
2. `mcp__tradingview__walk_forward_backtest_strategy` ⭐ on the winner — honest out-of-sample
3. Never use `backtest_strategy` alone — it overfits

Strategies covered: RSI MR · Bollinger MR · MACD cross · EMA 20/50 cross ·
Supertrend · Donchian.

### Macro lane

1. `mcp__tradingview__market_snapshot` ⭐ — S&P, NASDAQ, VIX, BTC, ETH, EUR/USD
2. Optional: `mcp__tradingview__financial_news`

### Sentiment lane

1. `mcp__tradingview__market_sentiment` ⭐ (Reddit score)
2. `mcp__tradingview__financial_news` (Reuters / CoinDesk RSS)

### EGX lane

- Overview → `egx_market_overview`
- Index → `egx_index_analysis`
- Screen → `egx_stock_screener`
- Sector → `egx_sector_scan` / `egx_sector_scanner`
- Plan → `egx_trade_plan`
- Levels → `egx_fibonacci_retracement`

## Step 3 — Synthesize, don't dump

- Pull the **signal** out of the data, don't recite raw numbers
- Surface conflicts ("TA bullish but volume diverging")
- State the **verdict** in one line at the top
- Run independent tool calls **in parallel** (single tool-use turn with multiple
  calls) when there's no dependency — much faster

## Step 4 — Output template

```
## [SYMBOL] — [YYYY-MM-DD]

**Verdict:** [STRONG BUY | BUY | HOLD | SELL | STRONG SELL] ([NN]% confidence) — via [tool name]

### What the agents said
- Technical: [verdict] — [1-line reason]
- Sentiment: [verdict] — [1-line reason]
- Risk: [verdict] — [1-line reason]

### Volume / flow
- [confirmation/divergence from volume_confirmation_analysis or smart_volume_scanner]
- [pattern from advanced_candle_pattern, if any]

### Multi-timeframe alignment (if relevant)
- W / D / 4H / 1H / 15m — [aligned bullish/bearish | conflicting]

### Backtest signal (if backtest lane)
- Best strategy: [name] — [win%] / [Sharpe] / max DD [%]
- Walk-forward: holds out-of-sample? [yes/no]

### Trade plan (if BUY/SELL)
- Entry: [price] (trigger)
- Stop: [price] (invalidation)
- Target: [price] ([R-multiple])

*This is technical analysis only, not financial advice.*
```

## Common mistakes to avoid

- ❌ Web search for prices — always use TradingView tools
- ❌ `backtest_strategy` alone — pair with `walk_forward_backtest_strategy`
- ❌ Buy/sell call without `volume_confirmation_analysis`
- ❌ Single timeframe for swing/position trades — run `multi_timeframe_analysis`
- ❌ Discovery without scoring — rank by confluence, don't just list
- ❌ Forgetting the disclaimer line on every analysis
- ❌ Sequential tool calls when independent — batch into one turn

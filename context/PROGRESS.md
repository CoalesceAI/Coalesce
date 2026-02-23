# Product Progress Tracker

## Phase 1: MVP -- Market Aggregation

**Status: COMPLETE**
**Target: 2-3 weeks | Actual: Done**

### Completed

- [x] **Setup & Tooling**
  - Predexon MCP installed (`user-predexon`)
  - `PREDEXON_API_KEY` added to `.env` / `.env.example` (server-only)
  - `swr`, `lightweight-charts`, `recharts` installed

- [x] **Types** (`src/types/market.ts`)
  - 25+ interfaces derived from Predexon OpenAPI schemas
  - Covers: PolymarketMarket, KalshiMarket, CandlestickData, Trade, OrderbookSnapshot, MatchedPair
  - Unified types: `UnifiedMarket`, `ArbitragePair` for cross-platform normalization

- [x] **Predexon Service Layer** (`src/lib/predexon.ts`)
  - Typed REST client wrapping `https://api.predexon.com/v2`
  - Server-only (never imported from client code)
  - Automatic query param serialization, ISR caching (60s), error class `PredexonApiError`

- [x] **API Routes** (`src/app/api/markets/`)
  - `GET /api/markets` -- Unified market list (Polymarket + Kalshi merged)
  - `GET /api/markets/[id]` -- Single market detail (auto-detects platform)
  - `GET /api/markets/[id]/candlesticks` -- OHLCV chart data
  - `GET /api/markets/[id]/orderbook` -- Latest orderbook snapshot
  - `GET /api/markets/[id]/trades` -- Recent trade history
  - `GET /api/markets/matched-pairs` -- Cross-platform arbitrage pairs with enriched prices

- [x] **SWR Hooks** (`src/hooks/use-markets.ts`)
  - `useMarkets`, `useMarket`, `useCandlesticks`, `useOrderbook`, `useTrades`, `useMatchedPairs`
  - Auto-refresh intervals: 15s (orderbook/trades), 30s (markets), 60s (candles/arb)

- [x] **Markets Page** (`/[team-slug]/markets`)
  - Search with debounce (400ms, min 3 chars)
  - Platform filter (All / Polymarket / Kalshi)
  - Sort selector (volume, OI, price, newest)
  - Table: title, platform badge, Yes/No prices, volume, 24h vol, liquidity

- [x] **Market Detail** (`/[team-slug]/markets/[id]`)
  - TradingView candlestick chart (lightweight-charts v5)
  - Orderbook depth visualization (bid/ask bars, spread)
  - Live trades feed with BUY/SELL coloring
  - Stat cards: Yes price, No price, Total Volume, Liquidity/OI

- [x] **Arbitrage Scanner** (`/[team-slug]/arbitrage`)
  - Matched pairs table sorted by spread (largest first)
  - Columns: market, Polymarket YES, Kalshi YES, spread, similarity score
  - Color-coded by opportunity size (green >= 5c, yellow >= 3c)

- [x] **Dashboard** (overhauled from boilerplate)
  - Stats: Markets Tracked, Matched Pairs, Top Spread, 24h Volume
  - Hot Markets: top 8 by volume with live prices
  - Top Arbitrage Opportunities: top 8 by spread

- [x] **Database Schema** (`prisma/schema.prisma`)
  - `WatchlistItem` model (bookmark markets)
  - `AlertRule` model (price/spread alerts)
  - `Platform` and `AlertType` enums

- [x] **Sidebar** updated with Markets + Arbitrage links

- [x] **Codebase Health**
  - `tsc --noEmit` passes with 0 errors
  - `yarn build` succeeds (exit code 0)
  - Dead boilerplate removed (recent-sales, placeholder data)
  - `swr` dependency added (was missing)
  - Font import fixed (moved from client component to CSS)
  - `"use client"` directives added where missing

---

## Phase 2: Intelligence Layer

**Status: NOT STARTED**
**Target: 2-3 weeks after Phase 1**

### Planned

- [ ] **Smart Money Signals**
  - API routes: `/api/smart-money/[conditionId]`, `/api/smart-money/activity`
  - UI: Markets where smart wallets are buying/selling, net ratio, smart volume
  - Requires: Predexon Dev plan API key

- [ ] **Leaderboards**
  - API routes: `/api/leaderboard`, `/api/leaderboard/[conditionId]`
  - UI: Global + per-market wallet rankings

- [ ] **Wallet Analytics**
  - API routes: `/api/wallet/[address]/*`
  - UI: P&L chart, open positions, style tags, similar wallets

- [ ] **Alerts & Notifications**
  - Leverage `AlertRule` model (already in schema)
  - Background cron for threshold monitoring
  - In-app notification center

- [ ] **Volatility & Liquidity Indicators**
  - Compute from candlestick + orderbook data
  - Surface as badges on market cards

---

## Phase 3: Real-Time & Trading

**Status: NOT STARTED**
**Target: 3-4 weeks after Phase 2**

### Planned

- [ ] **WebSocket Integration**
  - Predexon WebSocket for real-time trades and lifecycle events
  - SSE from API routes to push to client

- [ ] **Trading Execution**
  - Install `@predexon/trade-sdk`
  - Order entry UI: buy/sell YES/NO, limit/market
  - Position management page

- [ ] **AI Chat Interface**
  - Natural language queries backed by Predexon MCP tools + LLM
  - Command palette or dedicated chat panel

---

## Key Metrics

| Metric | Value |
|--------|-------|
| TypeScript errors | 0 |
| Build status | Passing |
| API routes | 6 |
| UI pages | 4 (Dashboard, Markets, Market Detail, Arbitrage) |
| SWR hooks | 6 |
| Predexon endpoints used | 8 of 36 |
| Database models | 5 (User, Team, TeamUser, WatchlistItem, AlertRule) |

// ---------------------------------------------------------------------------
// Predexon API response types — derived from OpenAPI schemas at
// https://docs.predexon.com/api-reference
// ---------------------------------------------------------------------------

// -- Polymarket --

export interface PolymarketOutcome {
  label: string;
  token_id: string | null;
  price: number | null;
}

export interface MarketRollingMetrics {
  volume_1d: number;
  volume_7d: number;
  volume_30d: number;
  buy_volume_1d: number;
  buy_volume_7d: number;
  buy_volume_30d: number;
  sell_volume_1d: number;
  sell_volume_7d: number;
  sell_volume_30d: number;
  trades_1d: number;
  trades_7d: number;
  trades_30d: number;
  buys_1d: number;
  buys_7d: number;
  buys_30d: number;
  sells_1d: number;
  sells_7d: number;
  sells_30d: number;
  oi_change_1d: number;
  oi_change_7d: number;
  oi_change_30d: number;
  computed_at: string | null;
}

export interface PolymarketMarket {
  condition_id: string;
  question_id: string | null;
  market_id: string;
  market_slug: string;
  title: string;
  description: string;
  status: string;
  winning_side: string | null;
  start_time: string | null;
  end_time: string | null;
  close_time: string | null;
  created_time: string | null;
  image_url: string;
  event_id: string | null;
  event_slug: string | null;
  event_title: string | null;
  outcomes: PolymarketOutcome[];
  total_volume_usd: number;
  liquidity_usd: number;
  tags: string[];
  is_neg_risk: boolean;
  rolling_metrics: MarketRollingMetrics | null;
}

export interface OffsetPagination {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
}

export interface PolymarketMarketsResponse {
  markets: PolymarketMarket[];
  pagination: OffsetPagination;
}

// -- Kalshi --

export interface KalshiOutcome {
  label: string;
  bid: number | null;
  ask: number | null;
}

export interface KalshiEvent {
  event_ticker: string;
  series_ticker: string | null;
  title: string;
  subtitle: string;
}

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  market_id: string | null;
  title: string;
  yes_subtitle: string;
  no_subtitle: string;
  status: string;
  result: string | null;
  open_time: string | null;
  close_time: string | null;
  expected_expiration_time: string | null;
  settlement_time: string | null;
  determination_time: string | null;
  can_close_early: boolean;
  strike_type: string | null;
  custom_strike: string | null;
  outcomes: KalshiOutcome[];
  last_price: number | null;
  volume: number;
  open_interest: number;
  dollar_volume: number;
  dollar_open_interest: number;
  event: KalshiEvent;
  created_at: string | null;
  updated_at: string | null;
}

export interface CursorPagination {
  limit: number;
  count: number;
  pagination_key: string | null;
  has_more: boolean;
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  pagination: CursorPagination;
}

// -- Candlesticks --

export interface PriceData {
  open: number;
  high: number;
  low: number;
  close: number;
  open_dollars: string;
  high_dollars: string;
  low_dollars: string;
  close_dollars: string;
  mean: number;
  mean_dollars: string;
  previous: number;
  previous_dollars: string;
}

export interface CandlestickData {
  end_period_ts: number;
  price: PriceData;
  volume: number;
  trades_count: number;
}

export interface CandlesticksResponse {
  condition_id: string;
  candlesticks: CandlestickData[];
}

// -- Orderbook --

export interface OrderbookLevel {
  size: number;
  price: number;
}

export interface OrderbookSnapshot {
  asks: OrderbookLevel[];
  bids: OrderbookLevel[];
  hash: string;
  assetId: string;
  timestamp: number;
  tickSize: string;
  indexedAt: number;
  market: string;
}

export interface OrderbooksResponse {
  snapshots: OrderbookSnapshot[];
  pagination: CursorPagination;
}

// -- Trades --

export type OrderSide = "BUY" | "SELL";

export interface Trade {
  token_id: string;
  side: OrderSide;
  market_slug: string;
  condition_id: string;
  shares: number;
  shares_normalized: number;
  price: number;
  amount_usd: number;
  tx_hash: string;
  title: string;
  timestamp: number;
  order_hash: string;
  user: string;
  taker: string;
  is_yes_side: boolean;
  outcome_label: string;
  fee_usd: number;
}

export interface TradesResponse {
  trades: Trade[];
  pagination: CursorPagination;
}

// -- Matched Pairs (cross-platform) --

export interface PolymarketPairInfo {
  condition_id: string;
  market_slug: string;
  market_id: string;
  title: string;
  expiration_ts: number | null;
}

export interface KalshiPairInfo {
  market_ticker: string;
  title: string;
  yes_subtitle: string | null;
  expiration_ts: number | null;
}

export interface MatchedPair {
  POLYMARKET: PolymarketPairInfo;
  KALSHI: KalshiPairInfo;
  similarity: number | null;
  explanation: string | null;
  earliest_expiration_ts: number | null;
}

export interface MatchedPairsResponse {
  pairs: MatchedPair[];
  pagination: CursorPagination;
}

// -- Price --

export interface PriceResponse {
  price: number;
  timestamp: number;
}

// -- Volume --

export interface VolumeDataPoint {
  timestamp: number;
  total: number;
  buy: number;
  sell: number;
}

export interface VolumeResponse {
  token_id: string;
  data: VolumeDataPoint[];
}

// -- Open Interest --

export interface OpenInterestDataPoint {
  timestamp: number;
  open_interest: number;
}

export interface OpenInterestResponse {
  condition_id: string;
  data: OpenInterestDataPoint[];
}

// -- Unified Market (our normalized view) --

export type Platform = "polymarket" | "kalshi";

export interface UnifiedMarket {
  id: string;
  platform: Platform;
  title: string;
  status: string;
  yesPrice: number | null;
  noPrice: number | null;
  volume: number;
  liquidity: number;
  volume24h: number;
  trades24h: number;
  imageUrl: string;
  tags: string[];
  endTime: string | null;
  createdTime: string | null;
  slug: string;
  // Polymarket-specific
  conditionId?: string;
  // Kalshi-specific
  ticker?: string;
  eventTicker?: string;
}

// -- Arbitrage --

export interface ArbitragePair {
  polymarketTitle: string;
  kalshiTitle: string;
  polymarketYesPrice: number | null;
  kalshiYesPrice: number | null;
  spread: number | null;
  similarity: number | null;
  polymarketConditionId: string;
  polymarketSlug: string;
  kalshiTicker: string;
  expiresAt: number | null;
}

// -- API error --

export interface ApiError {
  error: string;
  message: string;
}

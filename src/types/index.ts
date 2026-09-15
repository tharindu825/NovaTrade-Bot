export type TradeSide = 'Buy' | 'Sell';
export type TradeDirection = 'LONG' | 'SHORT';
export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE_CHOP';

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTicker {
  symbol: string;
  lastPrice: number;
  bid1Price: number;
  ask1Price: number;
  spreadPercent: number;
  volume24hUsdt: number;
  price24hPcnt: number;
  fundingRate: number;
  predictedFundingRate?: number;
  openInterest?: number;
}

export interface TechnicalIndicators {
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  atr: number;
  higherTimeframeTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volumeAboveAverage: boolean;
  regime: MarketRegime;
}

export interface SignalCandidate {
  symbol: string;
  direction: TradeDirection;
  timeframe: string;
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  riskDistance: number;
  riskRewardRatioTP1: number;
  riskRewardRatioTP2: number;
  atr: number;
  technicalReasons: string[];
  timestamp: number;
}

export interface NewsArticle {
  title: string;
  source: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  sentimentTag?: 'bullish' | 'bearish' | 'neutral';
}

export interface FearGreedData {
  value: number; // 0 to 100
  classification: string; // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
  timestamp: number;
}

export interface MarketSentimentContext {
  articles: NewsArticle[];
  fearGreed: FearGreedData | null;
  fundingRate: number;
  symbol: string;
  timestamp: number;
}

export interface AIRiskEvaluation {
  approved: boolean;
  verdict: 'APPROVE' | 'REJECT' | 'REDUCE_SIZE';
  confidenceScore: number; // 0 - 100
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  riskAdjustmentFactor: number; // 0.5 to 1.0 (multiplier for position sizing)
  reasoning: string;
  warnings: string[];
  modelUsed: string;
}

export type TradeStatus =
  | 'PENDING_ENTRY'
  | 'OPEN'
  | 'TP1_HIT_BREAKEVEN'
  | 'CLOSED_TP2'
  | 'CLOSED_SL'
  | 'CANCELLED'
  | 'CLOSED_MANUAL';

export interface ActiveTrade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  side: TradeSide; // 'Buy' for LONG, 'Sell' for SHORT
  entryPrice: number;
  initialQty: number;
  currentQty: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp1Hit: boolean;
  status: TradeStatus;
  orderIdEntry?: string;
  orderIdTP1?: string;
  orderIdTP2?: string;
  orderIdSL?: string;
  realizedPnl: number;
  aiEvaluation?: AIRiskEvaluation;
  createdAt: number;
  updatedAt: number;
}

export interface AccountBalance {
  totalEquity: number;
  availableBalance: number;
  currency: string;
}

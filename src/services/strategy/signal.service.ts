import { Candle, SignalCandidate, TechnicalIndicators } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

// ─── Filter Mode Profiles ──────────────────────────────────────────────────────
/**
 * Three pre-defined strictness profiles, switchable via FILTER_MODE in .env.
 *
 *  STRICT   — Original settings. All gates are tight; fewest trades, highest conviction.
 *  MODERATE — Balanced default. EMA zone, StochRSI, BB and trend strength relaxed.
 *  RELAXED  — Very permissive. For low-volatility / ranging markets or initial testing.
 */
interface FilterProfile {
  // [P2-C] Minimum EMA50/EMA200 separation % to confirm trend strength
  trendStrengthMin: number;

  // [P2-D] BB width must be >= avgWidth * this multiplier
  bbExpansionMultiplier: number;

  // [P1-C] EMA zone: ATR tolerance for how far price can be from EMA21/EMA50
  emaAtrTolerance: number;

  // [P1-C] EMA zone: close/open price band buffer (fraction of price)
  emaBandBuffer: number;

  // Long RSI range
  rsiLongMin: number;
  rsiLongMax: number;

  // Short RSI range
  rsiShortMin: number;
  rsiShortMax: number;

  // [P2-B] Long: StochRSI must be <= this (oversold)
  stochRsiOversoldMax: number;

  // [P2-B] Short: StochRSI must be >= this (overbought)
  stochRsiOverboughtMin: number;
}

const FILTER_PROFILES: Record<'STRICT' | 'MODERATE' | 'RELAXED', FilterProfile> = {
  /**
   * STRICT — Original high-conviction settings.
   * Designed for strong trending markets with clear momentum.
   * Fewest signals, but highest win-rate expectancy.
   */
  STRICT: {
    trendStrengthMin:       0.4,
    bbExpansionMultiplier:  0.95,
    emaAtrTolerance:        0.8,
    emaBandBuffer:          0.002,
    rsiLongMin:             38,
    rsiLongMax:             65,
    rsiShortMin:            35,
    rsiShortMax:            62,
    stochRsiOversoldMax:    30,
    stochRsiOverboughtMin:  70,
  },

  /**
   * MODERATE — Balanced default.
   * EMA zone is wider, StochRSI window expanded, BB can be mildly contracting.
   * Good for most market conditions — recommended starting point.
   */
  MODERATE: {
    trendStrengthMin:       0.2,
    bbExpansionMultiplier:  0.80,
    emaAtrTolerance:        1.5,
    emaBandBuffer:          0.005,
    rsiLongMin:             35,
    rsiLongMax:             70,
    rsiShortMin:            22,   // Lowered from 30: bear dumps can push RSI to 20-25
    rsiShortMax:            68,
    stochRsiOversoldMax:    45,
    stochRsiOverboughtMin:  55,
  },

  /**
   * RELAXED — Very permissive.
   * Catches early setups in low-volatility, ranging, or recovering markets.
   * Higher trade frequency; use with reduced position sizing or paper trading.
   */
  RELAXED: {
    trendStrengthMin:       0.05,
    bbExpansionMultiplier:  0.60,
    emaAtrTolerance:        2.5,
    emaBandBuffer:          0.01,
    rsiLongMin:             30,
    rsiLongMax:             75,
    rsiShortMin:            15,   // Lowered from 25: catches extreme oversold shorts
    rsiShortMax:            72,
    stochRsiOversoldMax:    60,
    stochRsiOverboughtMin:  40,
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export class SignalService {
  /**
   * Evaluate if candles and technical indicators form a trade candidate.
   *
   * The strictness of every gate is controlled by FILTER_MODE in .env:
   *   STRICT   → tight gates, fewest signals, highest conviction
   *   MODERATE → balanced (default)
   *   RELAXED  → permissive, more signals, best for low-volatility markets
   *
   * Gates applied (in order):
   *   P1-A  Volume confirmation   — volumeAboveAverage must be true
   *   P1-B  2-candle / engulfing  — requires a real bullish/bearish structure
   *   P1-C  EMA zone check        — price inside/near the EMA21–EMA50 band
   *   P2-A  MACD histogram flip   — histogram turned positive/negative
   *   P2-B  StochRSI gate         — oversold for longs, overbought for shorts
   *   P2-C  Trend strength        — EMA50/EMA200 separation meets minimum
   *   P2-D  BB expansion filter   — Bollinger Band width above threshold
   *   P3-A  Dynamic swing lookback — 15–20 candle lookback for SL placement
   *   P3-B  RSI divergence bonus   — upgrades confidence reason
   *   P3-C  Named candle pattern   — included in reasons for AI context
   */
  evaluateSetup(
    symbol: string,
    triggerCandles: Candle[],
    indicators: TechnicalIndicators
  ): SignalCandidate | null {
    if (triggerCandles.length < 20) return null;

    const profile = FILTER_PROFILES[env.FILTER_MODE];

    const lastIdx = triggerCandles.length - 1;
    const currentCandle = triggerCandles[lastIdx];
    const prevCandle = triggerCandles[lastIdx - 1];

    const entryPrice = currentCandle.close;
    const atr = indicators.atr;
    const slBuffer = atr * env.SL_ATR_MULTIPLIER;

    // ─── Shared pre-computation ──────────────────────────────────────────────

    // [P2-C] Trend strength gate
    const hasTrendStrength = indicators.trendStrength >= profile.trendStrengthMin;

    // [P2-D] Bollinger Band expansion gate
    const isBbExpanding =
      indicators.bollingerBands.width >= indicators.bollingerBands.avgWidth * profile.bbExpansionMultiplier;

    // [P1-A] Volume confirmation
    const isVolumeSurging = indicators.volumeAboveAverage;

    // ─────────────────────────────────────────────────────────────────────────
    // LONG EVALUATION
    // ─────────────────────────────────────────────────────────────────────────
    if (indicators.higherTimeframeTrend === 'BULLISH') {
      const emaLow = Math.min(indicators.ema21, indicators.ema50);
      const emaHigh = Math.max(indicators.ema21, indicators.ema50);
      const buf = profile.emaBandBuffer;
      const emaAtr = profile.emaAtrTolerance;

      // [P1-C] Price must be pulling back INTO / near the EMA band
      const isInEmaZone =
        (currentCandle.low <= emaHigh * (1 + buf) &&
          currentCandle.close >= emaLow * (1 - buf) &&
          Math.abs(currentCandle.low - indicators.ema21) <= atr * emaAtr) ||
        Math.abs(currentCandle.low - indicators.ema50) <= atr * emaAtr;

      // RSI health
      const isRsiHealthy = indicators.rsi >= profile.rsiLongMin && indicators.rsi <= profile.rsiLongMax;

      // [P2-B] StochRSI: oversold gate
      const isStochRsiOversold = indicators.stochRsi <= profile.stochRsiOversoldMax;

      // [P2-A] MACD: histogram flip or bullish expansion
      const isHistogramFlipping =
        indicators.macd.prevHistogram < 0 && indicators.macd.histogram >= 0;
      const isMacdBullish = isHistogramFlipping || indicators.macd.histogram > 0;

      // [P1-B] Use two CLOSED candles (lastIdx-1 and lastIdx-2), not the live forming candle
      const closedCandle = triggerCandles[lastIdx - 1];
      const prevClosedCandle = triggerCandles[lastIdx - 2];
      const isCandleBullish = closedCandle.close >= closedCandle.open;
      const isPrevCandleBullish = prevClosedCandle.close >= prevClosedCandle.open;
      const isBullishEngulfing =
        closedCandle.close > prevClosedCandle.open &&
        closedCandle.open < prevClosedCandle.close &&
        isCandleBullish &&
        !isPrevCandleBullish;
      const isCandleStructureValid =
        (isCandleBullish && isPrevCandleBullish) || isBullishEngulfing;

      logger.debug(
        `[LONG][${env.FILTER_MODE}] ${symbol}: zone=${isInEmaZone} rsi=${isRsiHealthy} stoch=${isStochRsiOversold} macd=${isMacdBullish} candle=${isCandleStructureValid} vol=${isVolumeSurging} trend=${hasTrendStrength} bb=${isBbExpanding}`
      );

      if (
        isInEmaZone &&
        isRsiHealthy &&
        isStochRsiOversold &&
        isMacdBullish &&
        isCandleStructureValid &&
        isVolumeSurging &&
        hasTrendStrength &&
        isBbExpanding
      ) {
        // [P3-A] Dynamic swing lookback: 15–20 candles
        const lookback = Math.min(20, Math.max(15, Math.floor(triggerCandles.length * 0.15)));
        const recentLows = triggerCandles.slice(lastIdx - lookback, lastIdx).map((c) => c.low);
        const swingLow = Math.min(...recentLows);
        const slPrice = Math.min(swingLow - slBuffer * 0.5, entryPrice - slBuffer);

        const riskDistance = entryPrice - slPrice;
        if (riskDistance <= 0) return null;

        const tp1Price = entryPrice + riskDistance * env.TP1_RR_RATIO;
        const tp2Price = entryPrice + riskDistance * env.TP2_RR_RATIO;

        // [P3-C] Build rich reasons list
        const reasons: string[] = [
          `[Mode: ${env.FILTER_MODE}] Higher Timeframe Trend is BULLISH (EMA50 > EMA200, strength: ${indicators.trendStrength.toFixed(2)}%)`,
          `${indicators.candlePattern} — Valid 2-bar bullish structure`,
          `RSI at ${indicators.rsi.toFixed(1)} | StochRSI at ${indicators.stochRsi.toFixed(1)} (Oversold within healthy zone)`,
          `MACD ${isHistogramFlipping ? 'Histogram FLIPPED positive' : 'confirming upside expansion'}`,
          `Volume surge confirmed (above 20-period SMA)`,
          `Bollinger Bands expanding (width: ${(indicators.bollingerBands.width * 100).toFixed(2)}%)`,
          `R:R Ratio -> TP1: ${env.TP1_RR_RATIO}R | TP2: ${env.TP2_RR_RATIO}R`,
        ];

        // [P3-B] RSI divergence bonus
        if (indicators.rsiDivergence === 'BULLISH_DIV') {
          reasons.unshift(`⚡ BULLISH RSI DIVERGENCE DETECTED — High-Conviction Entry`);
        }

        return {
          symbol,
          direction: 'LONG',
          timeframe: `${env.TRIGGER_TIMEFRAME}m`,
          entryPrice,
          slPrice,
          tp1Price,
          tp2Price,
          riskDistance,
          riskRewardRatioTP1: env.TP1_RR_RATIO,
          riskRewardRatioTP2: env.TP2_RR_RATIO,
          atr,
          technicalReasons: reasons,
          timestamp: Date.now(),
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHORT EVALUATION
    // ─────────────────────────────────────────────────────────────────────────
    if (indicators.higherTimeframeTrend === 'BEARISH') {
      const emaLow = Math.min(indicators.ema21, indicators.ema50);
      const emaHigh = Math.max(indicators.ema21, indicators.ema50);
      const buf = profile.emaBandBuffer;
      const emaAtr = profile.emaAtrTolerance;

      // [P1-C] Price must be bouncing INTO / near the EMA band from below (resistance)
      const isInEmaZone =
        (currentCandle.high >= emaLow * (1 - buf) &&
          currentCandle.close <= emaHigh * (1 + buf) &&
          Math.abs(currentCandle.high - indicators.ema21) <= atr * emaAtr) ||
        Math.abs(currentCandle.high - indicators.ema50) <= atr * emaAtr;

      // RSI health
      const isRsiHealthy = indicators.rsi >= profile.rsiShortMin && indicators.rsi <= profile.rsiShortMax;

      // [P2-B] StochRSI: overbought gate
      const isStochRsiOverbought = indicators.stochRsi >= profile.stochRsiOverboughtMin;

      // [P2-A] MACD: histogram flip or bearish expansion
      const isHistogramFlipping =
        indicators.macd.prevHistogram > 0 && indicators.macd.histogram <= 0;
      const isMacdBearish = isHistogramFlipping || indicators.macd.histogram < 0;

      // [P1-B] Use two CLOSED candles (lastIdx-1 and lastIdx-2), not the live forming candle
      const closedCandle = triggerCandles[lastIdx - 1];
      const prevClosedCandle = triggerCandles[lastIdx - 2];
      const isCandleBearish = closedCandle.close <= closedCandle.open;
      const isPrevCandleBearish = prevClosedCandle.close <= prevClosedCandle.open;
      const isBearishEngulfing =
        closedCandle.close < prevClosedCandle.open &&
        closedCandle.open > prevClosedCandle.close &&
        isCandleBearish &&
        !isPrevCandleBearish;
      const isCandleStructureValid =
        (isCandleBearish && isPrevCandleBearish) || isBearishEngulfing;

      // [P2-B-CONTEXT] In a deep bear dump (RSI < 25), StochRSI can stay oversold
      // throughout the fall. Waive the overbought requirement when RSI confirms extreme
      // bearish momentum — the RSI gate already enforces a reasonable range.
      const isDeepDump = indicators.rsi < 25;
      const isStochOkForShort = isStochRsiOverbought || isDeepDump;

      logger.debug(
        `[SHORT][${env.FILTER_MODE}] ${symbol}: zone=${isInEmaZone} rsi=${isRsiHealthy} stoch=${isStochOkForShort}(deepDump=${isDeepDump}) macd=${isMacdBearish} candle=${isCandleStructureValid} vol=${isVolumeSurging} trend=${hasTrendStrength} bb=${isBbExpanding}`
      );

      if (
        isInEmaZone &&
        isRsiHealthy &&
        isStochOkForShort &&
        isMacdBearish &&
        isCandleStructureValid &&
        isVolumeSurging &&
        hasTrendStrength &&
        isBbExpanding
      ) {
        // [P3-A] Dynamic swing lookback: 15–20 candles
        const lookback = Math.min(20, Math.max(15, Math.floor(triggerCandles.length * 0.15)));
        const recentHighs = triggerCandles.slice(lastIdx - lookback, lastIdx).map((c) => c.high);
        const swingHigh = Math.max(...recentHighs);
        const slPrice = Math.max(swingHigh + slBuffer * 0.5, entryPrice + slBuffer);

        const riskDistance = slPrice - entryPrice;
        if (riskDistance <= 0) return null;

        const tp1Price = entryPrice - riskDistance * env.TP1_RR_RATIO;
        const tp2Price = entryPrice - riskDistance * env.TP2_RR_RATIO;

        // [P3-C] Build rich reasons list
        const reasons: string[] = [
          `[Mode: ${env.FILTER_MODE}] Higher Timeframe Trend is BEARISH (EMA50 < EMA200, strength: ${indicators.trendStrength.toFixed(2)}%)`,
          `${indicators.candlePattern} — Valid 2-bar bearish structure`,
          `RSI at ${indicators.rsi.toFixed(1)} | StochRSI at ${indicators.stochRsi.toFixed(1)} (Overbought at resistance)`,
          `MACD ${isHistogramFlipping ? 'Histogram FLIPPED negative' : 'confirming downward expansion'}`,
          `Volume surge confirmed (above 20-period SMA)`,
          `Bollinger Bands expanding (width: ${(indicators.bollingerBands.width * 100).toFixed(2)}%)`,
          `R:R Ratio -> TP1: ${env.TP1_RR_RATIO}R | TP2: ${env.TP2_RR_RATIO}R`,
        ];

        // [P3-B] RSI divergence bonus
        if (indicators.rsiDivergence === 'BEARISH_DIV') {
          reasons.unshift(`⚡ BEARISH RSI DIVERGENCE DETECTED — High-Conviction Short`);
        }

        return {
          symbol,
          direction: 'SHORT',
          timeframe: `${env.TRIGGER_TIMEFRAME}m`,
          entryPrice,
          slPrice,
          tp1Price,
          tp2Price,
          riskDistance,
          riskRewardRatioTP1: env.TP1_RR_RATIO,
          riskRewardRatioTP2: env.TP2_RR_RATIO,
          atr,
          technicalReasons: reasons,
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }
}

export const signalService = new SignalService();

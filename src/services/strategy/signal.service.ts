import { Candle, SignalCandidate, TechnicalIndicators } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class SignalService {
  /**
   * Evaluate if candles and technical indicators form a high-probability trade candidate.
   *
   * Gates applied (in order):
   *   P1-A  Volume confirmation  — volumeAboveAverage must be true
   *   P1-B  2-candle / engulfing — requires a real bullish/bearish structure, not a single doji
   *   P1-C  EMA zone check       — price must be inside the EMA21–EMA50 band, not just "near" one
   *   P2-A  MACD histogram flip  — histogram must have turned positive (not just > 0 with loose OR)
   *   P2-B  Stochastic RSI gate  — StochRSI < 25 for longs, > 75 for shorts (oversold/overbought)
   *   P2-C  Trend strength       — EMA50/EMA200 separation >= 0.4% to avoid weak/false trends
   *   P2-D  BB expansion filter  — Bollinger Band width >= average width (expanding, not squeezing)
   *   P3-A  Dynamic swing lookback — 15–20 candle lookback for more robust SL placement
   *   P3-B  RSI divergence bonus  — upgrades confidence reason when divergence detected
   *   P3-C  Named candle pattern   — included in technicalReasons for AI context
   */
  evaluateSetup(
    symbol: string,
    triggerCandles: Candle[],
    indicators: TechnicalIndicators
  ): SignalCandidate | null {
    if (triggerCandles.length < 20) return null;

    const lastIdx = triggerCandles.length - 1;
    const currentCandle = triggerCandles[lastIdx];
    const prevCandle = triggerCandles[lastIdx - 1];

    const entryPrice = currentCandle.close;
    const atr = indicators.atr;
    const slBuffer = atr * env.SL_ATR_MULTIPLIER;

    // ─── Shared pre-computation ──────────────────────────────────────────────

    // [P2-C] Trend must be convincingly strong (EMA50/200 separation ≥ 0.4%)
    const hasTrendStrength = indicators.trendStrength >= 0.4;

    // [P2-D] Bollinger Bands must be expanding (width ≥ recent average)
    const isBbExpanding = indicators.bollingerBands.width >= indicators.bollingerBands.avgWidth * 0.95;

    // [P1-A] Volume confirmation
    const isVolumeSurging = indicators.volumeAboveAverage;

    // ─────────────────────────────────────────────────────────────────────────
    // LONG EVALUATION
    // ─────────────────────────────────────────────────────────────────────────
    if (indicators.higherTimeframeTrend === 'BULLISH') {

      // [P1-C] Price must be pulling back INTO the EMA band (between ema21 and ema50)
      const emaLow = Math.min(indicators.ema21, indicators.ema50);
      const emaHigh = Math.max(indicators.ema21, indicators.ema50);
      const isInEmaZone =
        currentCandle.low <= emaHigh * 1.002 &&
        currentCandle.close >= emaLow * 0.998 &&
        Math.abs(currentCandle.low - indicators.ema21) <= atr * 0.8 ||
        Math.abs(currentCandle.low - indicators.ema50) <= atr * 0.8;

      const isRsiHealthy = indicators.rsi >= 38 && indicators.rsi <= 65;

      // [P2-B] Stochastic RSI: require recently oversold (< 25) for high-quality entries
      const isStochRsiOversold = indicators.stochRsi <= 30;

      // [P2-A] MACD: histogram must have flipped from negative → positive, OR be solidly positive
      const isHistogramFlipping =
        indicators.macd.prevHistogram < 0 && indicators.macd.histogram >= 0;
      const isMacdBullish = isHistogramFlipping || indicators.macd.histogram > 0;

      // [P1-B] 2-candle structure: require 2 consecutive bullish closes OR a bullish engulfing
      const isCandleBullish = currentCandle.close >= currentCandle.open;
      const isPrevCandleBullish = prevCandle.close >= prevCandle.open;
      const isBullishEngulfing =
        currentCandle.close > prevCandle.open &&
        currentCandle.open < prevCandle.close &&
        isCandleBullish &&
        !isPrevCandleBullish;
      const isCandleStructureValid =
        (isCandleBullish && isPrevCandleBullish) || isBullishEngulfing;

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

        // [P3-C] Build rich reasons list including candle pattern and divergence
        const reasons: string[] = [
          `Higher Timeframe Trend is BULLISH (EMA50 > EMA200, strength: ${indicators.trendStrength.toFixed(2)}%)`,
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

        logger.debug(
          `[LONG] ${symbol} gates: zone=${isInEmaZone} rsi=${isRsiHealthy} stoch=${isStochRsiOversold} macd=${isMacdBullish} candle=${isCandleStructureValid} vol=${isVolumeSurging} trend=${hasTrendStrength} bb=${isBbExpanding}`
        );

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

      // [P1-C] Price must be bouncing up INTO the EMA band from below (resistance)
      const emaLow = Math.min(indicators.ema21, indicators.ema50);
      const emaHigh = Math.max(indicators.ema21, indicators.ema50);
      const isInEmaZone =
        currentCandle.high >= emaLow * 0.998 &&
        currentCandle.close <= emaHigh * 1.002 &&
        Math.abs(currentCandle.high - indicators.ema21) <= atr * 0.8 ||
        Math.abs(currentCandle.high - indicators.ema50) <= atr * 0.8;

      const isRsiHealthy = indicators.rsi >= 35 && indicators.rsi <= 62;

      // [P2-B] Stochastic RSI: require recently overbought (> 70) for high-quality shorts
      const isStochRsiOverbought = indicators.stochRsi >= 70;

      // [P2-A] MACD: histogram must have flipped from positive → negative, OR be solidly negative
      const isHistogramFlipping =
        indicators.macd.prevHistogram > 0 && indicators.macd.histogram <= 0;
      const isMacdBearish = isHistogramFlipping || indicators.macd.histogram < 0;

      // [P1-B] 2-candle structure: require 2 consecutive bearish closes OR a bearish engulfing
      const isCandleBearish = currentCandle.close <= currentCandle.open;
      const isPrevCandleBearish = prevCandle.close <= prevCandle.open;
      const isBearishEngulfing =
        currentCandle.close < prevCandle.open &&
        currentCandle.open > prevCandle.close &&
        isCandleBearish &&
        !isPrevCandleBearish;
      const isCandleStructureValid =
        (isCandleBearish && isPrevCandleBearish) || isBearishEngulfing;

      if (
        isInEmaZone &&
        isRsiHealthy &&
        isStochRsiOverbought &&
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
          `Higher Timeframe Trend is BEARISH (EMA50 < EMA200, strength: ${indicators.trendStrength.toFixed(2)}%)`,
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

        logger.debug(
          `[SHORT] ${symbol} gates: zone=${isInEmaZone} rsi=${isRsiHealthy} stoch=${isStochRsiOverbought} macd=${isMacdBearish} candle=${isCandleStructureValid} vol=${isVolumeSurging} trend=${hasTrendStrength} bb=${isBbExpanding}`
        );

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

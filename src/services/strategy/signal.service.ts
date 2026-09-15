import { Candle, SignalCandidate, TechnicalIndicators } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class SignalService {
  /**
   * Evaluate if candles and technical indicators form a high-probability trade candidate
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

    // --- LONG EVALUATION ---
    if (indicators.higherTimeframeTrend === 'BULLISH') {
      const isPullbackNearEMA =
        Math.abs(currentCandle.low - indicators.ema21) <= atr * 0.8 ||
        Math.abs(currentCandle.low - indicators.ema50) <= atr * 0.8;

      const isRsiHealthy = indicators.rsi >= 38 && indicators.rsi <= 65;
      const isMacdBullish = indicators.macd.histogram > 0 || indicators.macd.macd > indicators.macd.signal;
      const isCandleBullish = currentCandle.close >= currentCandle.open;

      if (isPullbackNearEMA && isRsiHealthy && isMacdBullish && isCandleBullish) {
        // Find recent swing low over the last 10 candles
        const recentLows = triggerCandles.slice(lastIdx - 10, lastIdx).map((c) => c.low);
        const swingLow = Math.min(...recentLows);
        const slPrice = Math.min(swingLow - slBuffer * 0.5, entryPrice - slBuffer);

        const riskDistance = entryPrice - slPrice;
        if (riskDistance <= 0) return null;

        const tp1Price = entryPrice + riskDistance * env.TP1_RR_RATIO;
        const tp2Price = entryPrice + riskDistance * env.TP2_RR_RATIO;

        const reasons = [
          `Higher Timeframe Trend is BULLISH (EMA50 > EMA200)`,
          `Healthy Pullback to EMA21/50 with Bullish Reversal Candle`,
          `RSI at ${indicators.rsi.toFixed(1)} (Healthy momentum zone)`,
          `MACD confirming upside expansion`,
          `R:R Ratio -> TP1: ${env.TP1_RR_RATIO}R | TP2: ${env.TP2_RR_RATIO}R`,
        ];

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

    // --- SHORT EVALUATION ---
    if (indicators.higherTimeframeTrend === 'BEARISH') {
      const isPullbackNearEMA =
        Math.abs(currentCandle.high - indicators.ema21) <= atr * 0.8 ||
        Math.abs(currentCandle.high - indicators.ema50) <= atr * 0.8;

      const isRsiHealthy = indicators.rsi >= 35 && indicators.rsi <= 62;
      const isMacdBearish = indicators.macd.histogram < 0 || indicators.macd.macd < indicators.macd.signal;
      const isCandleBearish = currentCandle.close <= currentCandle.open;

      if (isPullbackNearEMA && isRsiHealthy && isMacdBearish && isCandleBearish) {
        // Find recent swing high over the last 10 candles
        const recentHighs = triggerCandles.slice(lastIdx - 10, lastIdx).map((c) => c.high);
        const swingHigh = Math.max(...recentHighs);
        const slPrice = Math.max(swingHigh + slBuffer * 0.5, entryPrice + slBuffer);

        const riskDistance = slPrice - entryPrice;
        if (riskDistance <= 0) return null;

        const tp1Price = entryPrice - riskDistance * env.TP1_RR_RATIO;
        const tp2Price = entryPrice - riskDistance * env.TP2_RR_RATIO;

        const reasons = [
          `Higher Timeframe Trend is BEARISH (EMA50 < EMA200)`,
          `Pullback to EMA21/50 Resistance with Bearish Rejection`,
          `RSI at ${indicators.rsi.toFixed(1)} (Declining from resistance)`,
          `MACD confirming downward expansion`,
          `R:R Ratio -> TP1: ${env.TP1_RR_RATIO}R | TP2: ${env.TP2_RR_RATIO}R`,
        ];

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

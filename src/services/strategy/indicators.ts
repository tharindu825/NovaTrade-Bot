import { Candle, TechnicalIndicators, MarketRegime } from '../../types';

export class TechnicalIndicatorService {
  /**
   * Calculate Simple Moving Average (SMA)
   */
  calculateSMA(data: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(NaN);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
      }
    }
    return sma;
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   */
  calculateEMA(data: number[], period: number): number[] {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);

    // Initial SMA
    let initialSum = 0;
    for (let i = 0; i < period; i++) {
      if (i < data.length) initialSum += data[i];
    }
    let prevEma = initialSum / period;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        ema.push(NaN);
      } else if (i === period - 1) {
        ema.push(prevEma);
      } else {
        const currentEma = (data[i] - prevEma) * multiplier + prevEma;
        ema.push(currentEma);
        prevEma = currentEma;
      }
    }
    return ema;
  }

  /**
   * Calculate Relative Strength Index (RSI - 14)
   */
  calculateRSI(data: number[], period: number = 14): number[] {
    const rsi: number[] = [];
    if (data.length <= period) return data.map(() => 50);

    const changes: number[] = [];
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i] - data[i - 1]);
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 0; i < period; i++) {
      const change = changes[i];
      if (change > 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    rsi.push(...new Array(period).fill(NaN));
    const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + firstRS));

    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      }
    }

    return rsi;
  }

  /**
   * Calculate Average True Range (ATR - 14)
   */
  calculateATR(candles: Candle[], period: number = 14): number[] {
    const atr: number[] = [];
    if (candles.length < 2) return candles.map(() => 0);

    const trueRanges: number[] = [candles[0].high - candles[0].low];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Smooth ATR using Wilder's smoothing
    let initialSum = 0;
    for (let i = 0; i < period; i++) {
      if (i < trueRanges.length) initialSum += trueRanges[i];
    }
    let prevAtr = initialSum / period;

    for (let i = 0; i < trueRanges.length; i++) {
      if (i < period - 1) {
        atr.push(NaN);
      } else if (i === period - 1) {
        atr.push(prevAtr);
      } else {
        const currentAtr = (prevAtr * (period - 1) + trueRanges[i]) / period;
        atr.push(currentAtr);
        prevAtr = currentAtr;
      }
    }

    return atr;
  }

  /**
   * Calculate MACD (12, 26, 9)
   */
  calculateMACD(
    closes: number[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): { macd: number[]; signal: number[]; histogram: number[] } {
    const fastEma = this.calculateEMA(closes, fastPeriod);
    const slowEma = this.calculateEMA(closes, slowPeriod);

    const macdLine: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (isNaN(fastEma[i]) || isNaN(slowEma[i])) {
        macdLine.push(NaN);
      } else {
        macdLine.push(fastEma[i] - slowEma[i]);
      }
    }

    // Filter out initial NaNs for signal line calculation
    const validMacdIndices = macdLine
      .map((val, idx) => (isNaN(val) ? -1 : idx))
      .filter((idx) => idx !== -1);

    const validMacd = validMacdIndices.map((idx) => macdLine[idx]);
    const validSignal = this.calculateEMA(validMacd, signalPeriod);

    const signalLine: number[] = new Array(closes.length).fill(NaN);
    const histogram: number[] = new Array(closes.length).fill(NaN);

    for (let j = 0; j < validMacdIndices.length; j++) {
      const originalIdx = validMacdIndices[j];
      const sig = validSignal[j];
      signalLine[originalIdx] = sig;
      if (!isNaN(sig) && !isNaN(macdLine[originalIdx])) {
        histogram[originalIdx] = macdLine[originalIdx] - sig;
      }
    }

    return { macd: macdLine, signal: signalLine, histogram };
  }

  /**
   * Extract comprehensive indicators for the latest candle
   */
  analyzeCandles(
    triggerCandles: Candle[],
    trendCandles: Candle[]
  ): TechnicalIndicators | null {
    if (triggerCandles.length < 50 || trendCandles.length < 50) {
      return null;
    }

    const triggerCloses = triggerCandles.map((c) => c.close);
    const triggerVolumes = triggerCandles.map((c) => c.volume);
    const trendCloses = trendCandles.map((c) => c.close);

    // Indicator series
    const ema9 = this.calculateEMA(triggerCloses, 9);
    const ema21 = this.calculateEMA(triggerCloses, 21);
    const ema50 = this.calculateEMA(triggerCloses, 50);
    const ema200 = this.calculateEMA(triggerCloses, Math.min(200, triggerCloses.length));
    const rsiSeries = this.calculateRSI(triggerCloses, 14);
    const atrSeries = this.calculateATR(triggerCandles, 14);
    const macdResult = this.calculateMACD(triggerCloses, 12, 26, 9);
    const volumeSma = this.calculateSMA(triggerVolumes, 20);

    // Trend timeframe indicators
    const trendEma50 = this.calculateEMA(trendCloses, 50);
    const trendEma200 = this.calculateEMA(trendCloses, Math.min(200, trendCloses.length));

    const lastIdx = triggerCandles.length - 1;
    const lastTrendIdx = trendCandles.length - 1;

    // Macro Trend Assessment
    const latestTrendClose = trendCloses[lastTrendIdx];
    const latestTrendEma50 = trendEma50[lastTrendIdx];
    const latestTrendEma200 = trendEma200[lastTrendIdx];

    let higherTimeframeTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (latestTrendClose > latestTrendEma50 && latestTrendEma50 > (latestTrendEma200 || 0)) {
      higherTimeframeTrend = 'BULLISH';
    } else if (latestTrendClose < latestTrendEma50 && latestTrendEma50 < (latestTrendEma200 || Infinity)) {
      higherTimeframeTrend = 'BEARISH';
    }

    // Volume surge check
    const currentVolume = triggerVolumes[lastIdx];
    const avgVolume = volumeSma[lastIdx] || 0;
    const volumeAboveAverage = currentVolume > avgVolume * 1.1;

    // Determine Market Regime
    let regime: MarketRegime = 'RANGING';
    const latestEma50 = ema50[lastIdx];
    const latestEma200 = ema200[lastIdx];

    if (higherTimeframeTrend === 'BULLISH' && triggerCloses[lastIdx] > latestEma50) {
      regime = 'TRENDING_UP';
    } else if (higherTimeframeTrend === 'BEARISH' && triggerCloses[lastIdx] < latestEma50) {
      regime = 'TRENDING_DOWN';
    } else {
      regime = 'RANGING';
    }

    return {
      ema9: ema9[lastIdx] || triggerCloses[lastIdx],
      ema21: ema21[lastIdx] || triggerCloses[lastIdx],
      ema50: latestEma50 || triggerCloses[lastIdx],
      ema200: latestEma200 || triggerCloses[lastIdx],
      rsi: rsiSeries[lastIdx] || 50,
      macd: {
        macd: macdResult.macd[lastIdx] || 0,
        signal: macdResult.signal[lastIdx] || 0,
        histogram: macdResult.histogram[lastIdx] || 0,
      },
      atr: atrSeries[lastIdx] || (triggerCandles[lastIdx].high - triggerCandles[lastIdx].low),
      higherTimeframeTrend,
      volumeAboveAverage,
      regime,
    };
  }
}

export const technicalIndicators = new TechnicalIndicatorService();

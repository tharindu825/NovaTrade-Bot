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
   * Calculate Stochastic RSI (0–100)
   * Provides more sensitive overbought/oversold detection within an RSI zone.
   */
  calculateStochasticRSI(rsiSeries: number[], period: number = 14): number[] {
    return rsiSeries.map((_, i) => {
      if (i < period - 1) return NaN;
      const slice = rsiSeries.slice(i - period + 1, i + 1).filter((v) => !isNaN(v));
      if (slice.length < 2) return NaN;
      const minRsi = Math.min(...slice);
      const maxRsi = Math.max(...slice);
      if (maxRsi === minRsi) return 50;
      return ((rsiSeries[i] - minRsi) / (maxRsi - minRsi)) * 100;
    });
  }

  /**
   * Detect RSI Divergence over the last `lookback` candles.
   * Bullish: price lower low + RSI higher low → potential reversal up.
   * Bearish: price higher high + RSI lower high → potential reversal down.
   */
  detectRSIDivergence(
    candles: Candle[],
    rsiSeries: number[],
    lookback: number = 12
  ): 'BULLISH_DIV' | 'BEARISH_DIV' | 'NONE' {
    if (candles.length < lookback || rsiSeries.length < lookback) return 'NONE';

    const recentCandles = candles.slice(-lookback);
    const recentRsi = rsiSeries.slice(-lookback).filter((v) => !isNaN(v));

    if (recentRsi.length < 4) return 'NONE';

    const lastRsi = recentRsi[recentRsi.length - 1];
    const prevRsiValues = recentRsi.slice(0, -1);

    const lastClose = recentCandles[recentCandles.length - 1].close;
    const lastLow = recentCandles[recentCandles.length - 1].low;
    const lastHigh = recentCandles[recentCandles.length - 1].high;

    const prevLows = recentCandles.slice(0, -1).map((c) => c.low);
    const prevHighs = recentCandles.slice(0, -1).map((c) => c.high);

    const prevMinLow = Math.min(...prevLows);
    const prevMaxHigh = Math.max(...prevHighs);
    const prevMinRsi = Math.min(...prevRsiValues);
    const prevMaxRsi = Math.max(...prevRsiValues);

    // Bullish divergence: price makes lower low, RSI makes higher low
    if (lastLow < prevMinLow && lastRsi > prevMinRsi) return 'BULLISH_DIV';

    // Bearish divergence: price makes higher high, RSI makes lower high
    if (lastHigh > prevMaxHigh && lastRsi < prevMaxRsi) return 'BEARISH_DIV';

    return 'NONE';
  }

  /**
   * Calculate Average True Range (ATR - 14) using Wilder's smoothing
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
   * Returns macd, signal, histogram arrays + previous histogram for flip detection.
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
   * Calculate Bollinger Bands (20, 2σ) with normalised width for squeeze detection.
   */
  calculateBollingerBands(
    closes: number[],
    period: number = 20,
    stdDevMultiplier: number = 2
  ): { upper: number[]; lower: number[]; width: number[] } {
    const sma = this.calculateSMA(closes, period);
    const upper: number[] = [];
    const lower: number[] = [];
    const width: number[] = [];

    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1 || isNaN(sma[i])) {
        upper.push(NaN);
        lower.push(NaN);
        width.push(NaN);
        continue;
      }
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const stdDev = Math.sqrt(
        slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period
      );
      const u = mean + stdDevMultiplier * stdDev;
      const l = mean - stdDevMultiplier * stdDev;
      upper.push(u);
      lower.push(l);
      width.push(mean > 0 ? (u - l) / mean : NaN);
    }

    return { upper, lower, width };
  }

  /**
   * Identify a named candle pattern on the last two candles.
   * Returns a human-readable label for use in signal reasons and the AI prompt.
   */
  detectCandlePattern(
    currentCandle: Candle,
    prevCandle: Candle,
    ema21: number,
    ema50: number,
    atr: number
  ): string {
    const body = Math.abs(currentCandle.close - currentCandle.open);
    const range = currentCandle.high - currentCandle.low;
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);

    const nearEma21 = Math.abs(currentCandle.low - ema21) <= atr * 0.6;
    const nearEma50 = Math.abs(currentCandle.low - ema50) <= atr * 0.6;
    const nearSupport = nearEma21 ? 'EMA21' : nearEma50 ? 'EMA50' : 'Support';

    // Bullish Engulfing
    if (
      currentCandle.close > prevCandle.open &&
      currentCandle.open < prevCandle.close &&
      currentCandle.close > currentCandle.open &&
      prevCandle.close < prevCandle.open
    ) {
      return `Bullish Engulfing at ${nearSupport}`;
    }

    // Hammer (bullish)
    if (
      currentCandle.close > currentCandle.open &&
      lowerWick >= body * 2 &&
      upperWick <= body * 0.5 &&
      range > atr * 0.5
    ) {
      return `Hammer Candle at ${nearSupport}`;
    }

    // Shooting Star (bearish)
    const upperWickBear = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
    const bodyBear = Math.abs(currentCandle.close - currentCandle.open);
    if (
      currentCandle.close < currentCandle.open &&
      upperWickBear >= bodyBear * 2 &&
      range > atr * 0.5
    ) {
      return `Shooting Star at Resistance`;
    }

    // Bearish Engulfing
    if (
      currentCandle.close < prevCandle.open &&
      currentCandle.open > prevCandle.close &&
      currentCandle.close < currentCandle.open &&
      prevCandle.close > prevCandle.open
    ) {
      return `Bearish Engulfing at Resistance`;
    }

    // Inside Bar
    if (
      currentCandle.high < prevCandle.high &&
      currentCandle.low > prevCandle.low
    ) {
      return `Inside Bar (Consolidation)`;
    }

    // Generic bullish/bearish candle
    if (currentCandle.close > currentCandle.open) {
      return `Bullish Candle near ${nearSupport}`;
    }

    return `Bearish Candle at Resistance`;
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

    // --- Indicator Series ---
    const ema9 = this.calculateEMA(triggerCloses, 9);
    const ema21 = this.calculateEMA(triggerCloses, 21);
    const ema50 = this.calculateEMA(triggerCloses, 50);
    const ema200 = this.calculateEMA(triggerCloses, Math.min(200, triggerCloses.length));
    const rsiSeries = this.calculateRSI(triggerCloses, 14);
    const stochRsiSeries = this.calculateStochasticRSI(rsiSeries, 14);
    const atrSeries = this.calculateATR(triggerCandles, 14);
    const macdResult = this.calculateMACD(triggerCloses, 12, 26, 9);
    const volumeSma = this.calculateSMA(triggerVolumes, 20);
    const bb = this.calculateBollingerBands(triggerCloses, 20, 2);

    // --- Trend Timeframe Indicators ---
    const trendEma50 = this.calculateEMA(trendCloses, 50);
    const trendEma200 = this.calculateEMA(trendCloses, Math.min(200, trendCloses.length));

    const lastIdx = triggerCandles.length - 1;
    const lastTrendIdx = trendCandles.length - 1;

    // --- Higher Timeframe Trend ---
    const latestTrendClose = trendCloses[lastTrendIdx];
    const latestTrendEma50 = trendEma50[lastTrendIdx];
    const latestTrendEma200 = trendEma200[lastTrendIdx];

    let higherTimeframeTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (latestTrendClose > latestTrendEma50 && latestTrendEma50 > (latestTrendEma200 || 0)) {
      higherTimeframeTrend = 'BULLISH';
    } else if (latestTrendClose < latestTrendEma50 && latestTrendEma50 < (latestTrendEma200 || Infinity)) {
      higherTimeframeTrend = 'BEARISH';
    }

    // --- Trend Strength: % separation of EMA50 vs EMA200 ---
    const trendStrength =
      latestTrendEma200 && latestTrendClose > 0
        ? (Math.abs(latestTrendEma50 - latestTrendEma200) / latestTrendClose) * 100
        : 0;

    // --- Volume Surge ---
    const currentVolume = triggerVolumes[lastIdx];
    const avgVolume = volumeSma[lastIdx] || 0;
    const volumeAboveAverage = currentVolume > avgVolume * 1.1;

    // --- Market Regime ---
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

    // --- RSI Divergence ---
    const rsiDivergence = this.detectRSIDivergence(triggerCandles, rsiSeries, 12);

    // --- Bollinger Band width average (last 20 valid bars) ---
    const validBbWidths = bb.width.filter((v) => !isNaN(v)).slice(-20);
    const avgBbWidth =
      validBbWidths.length > 0
        ? validBbWidths.reduce((a, b) => a + b, 0) / validBbWidths.length
        : 0;

    // --- MACD prev histogram ---
    const prevHistogram = macdResult.histogram[lastIdx - 1] || 0;

    // --- Candle Pattern ---
    const currentCandle = triggerCandles[lastIdx];
    const prevCandle = triggerCandles[lastIdx - 1];
    const latestEma21 = ema21[lastIdx] || triggerCloses[lastIdx];
    const atrValue = atrSeries[lastIdx] || (currentCandle.high - currentCandle.low);

    const candlePattern = this.detectCandlePattern(
      currentCandle,
      prevCandle,
      latestEma21,
      latestEma50 || triggerCloses[lastIdx],
      atrValue
    );

    return {
      ema9: ema9[lastIdx] || triggerCloses[lastIdx],
      ema21: latestEma21,
      ema50: latestEma50 || triggerCloses[lastIdx],
      ema200: latestEma200 || triggerCloses[lastIdx],
      rsi: rsiSeries[lastIdx] || 50,
      stochRsi: stochRsiSeries[lastIdx] || 50,
      rsiDivergence,
      macd: {
        macd: macdResult.macd[lastIdx] || 0,
        signal: macdResult.signal[lastIdx] || 0,
        histogram: macdResult.histogram[lastIdx] || 0,
        prevHistogram,
      },
      bollingerBands: {
        upper: bb.upper[lastIdx] || triggerCloses[lastIdx],
        lower: bb.lower[lastIdx] || triggerCloses[lastIdx],
        width: bb.width[lastIdx] || 0,
        avgWidth: avgBbWidth,
      },
      atr: atrValue,
      higherTimeframeTrend,
      trendStrength,
      volumeAboveAverage,
      regime,
      candlePattern,
    };
  }
}

export const technicalIndicators = new TechnicalIndicatorService();

/**
 * Gate Diagnostic Script
 * Run: npx ts-node src/scripts/diagnose_gates.ts
 *
 * Fetches live data for the top coins and prints a per-gate breakdown
 * showing EXACTLY which gate is failing for each symbol.
 */
import 'dotenv/config';
import { bybitMarketService } from '../services/bybit/market.service';
import { technicalIndicators } from '../services/strategy/indicators';
import { coinSelectorService } from '../services/strategy/coinSelector.service';
import { env } from '../config/env';
import { TechnicalIndicators } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Mirror of FILTER_PROFILES from signal.service.ts
// ──────────────────────────────────────────────────────────────────────────────
const FILTER_PROFILES = {
  STRICT:   { trendStrengthMin: 0.4,  bbMult: 0.95, emaAtr: 0.8,  buf: 0.002, rsiLongMin: 38, rsiLongMax: 65, rsiShortMin: 35, rsiShortMax: 62, stochOversold: 30, stochOverbought: 70 },
  MODERATE: { trendStrengthMin: 0.2,  bbMult: 0.80, emaAtr: 1.5,  buf: 0.005, rsiLongMin: 35, rsiLongMax: 70, rsiShortMin: 22, rsiShortMax: 68, stochOversold: 45, stochOverbought: 55 },
  RELAXED:  { trendStrengthMin: 0.05, bbMult: 0.60, emaAtr: 2.5,  buf: 0.01,  rsiLongMin: 30, rsiLongMax: 75, rsiShortMin: 15, rsiShortMax: 72, stochOversold: 60, stochOverbought: 40 },
};

function pass(v: boolean) { return v ? '✅' : '❌'; }

function evaluateGates(symbol: string, ind: TechnicalIndicators, profile: typeof FILTER_PROFILES['MODERATE']) {
  const c = { close: ind.ema50, low: ind.ema21, high: ind.ema50 }; // placeholder — overridden below
  return profile; // unused, see below
}

async function run() {
  console.log(`\n🔍 NovaTrade Gate Diagnostic — FILTER_MODE: ${env.FILTER_MODE}\n`);
  const profile = FILTER_PROFILES[env.FILTER_MODE as keyof typeof FILTER_PROFILES] ?? FILTER_PROFILES.MODERATE;

  // 1. Pick symbols: top dynamic coins OR static fallback
  let symbols: string[] = env.TRADING_PAIRS.slice(0, 10);
  try {
    const ranked = await coinSelectorService.rankAndSelectTopCoins(15);
    if (ranked.length) symbols = ranked.map(c => c.symbol);
  } catch (e) {
    console.log('⚠️  Could not run dynamic coin selector, using static pairs.');
  }

  console.log(`📊 Diagnosing ${symbols.length} symbols: ${symbols.join(', ')}\n`);

  const results: Array<{
    symbol: string;
    trend: string;
    gates: Record<string, boolean>;
    values: Record<string, string>;
    passCount: number;
  }> = [];

  for (const symbol of symbols) {
    try {
      const [triggerCandles, trendCandles] = await Promise.all([
        bybitMarketService.getKlines(symbol, env.TRIGGER_TIMEFRAME, 100),
        bybitMarketService.getKlines(symbol, env.TREND_TIMEFRAME, 100),
      ]);

      if (triggerCandles.length < 50 || trendCandles.length < 50) {
        console.log(`⚠️  ${symbol}: Not enough candles (trigger=${triggerCandles.length}, trend=${trendCandles.length})`);
        continue;
      }

      const ind = technicalIndicators.analyzeCandles(triggerCandles, trendCandles);
      if (!ind) { console.log(`⚠️  ${symbol}: analyzeCandles returned null`); continue; }

      const lastIdx = triggerCandles.length - 1;
      const cur = triggerCandles[lastIdx];
      const prev = triggerCandles[lastIdx - 1];
      const atr = ind.atr;
      const isLong = ind.higherTimeframeTrend === 'BULLISH';
      const isShort = ind.higherTimeframeTrend === 'BEARISH';

      // ── Shared gates ──────────────────────────────────────────────────────
      const hasTrendStrength = ind.trendStrength >= profile.trendStrengthMin;
      const isBbExpanding    = ind.bollingerBands.width >= ind.bollingerBands.avgWidth * profile.bbMult;
      const isVolumeSurging  = ind.volumeAboveAverage;

      // ── Direction-specific gates ──────────────────────────────────────────
      let isInEmaZone = false;
      let isRsiHealthy = false;
      let isStochOk = false;
      let isMacdOk = false;
      let isCandleOk = false;
      let isCandleBullish = cur.close >= cur.open;
      let isPrevCandleBullish = prev.close >= prev.open;
      let isCandleBearish = cur.close <= cur.open;
      let isPrevCandleBearish = prev.close <= prev.open;

      const emaLow  = Math.min(ind.ema21, ind.ema50);
      const emaHigh = Math.max(ind.ema21, ind.ema50);
      const buf = profile.buf;
      const emaAtr = profile.emaAtr;

      if (isLong) {
        isInEmaZone = (
          cur.low <= emaHigh * (1 + buf) &&
          cur.close >= emaLow * (1 - buf) &&
          Math.abs(cur.low - ind.ema21) <= atr * emaAtr
        ) || Math.abs(cur.low - ind.ema50) <= atr * emaAtr;

        isRsiHealthy  = ind.rsi >= profile.rsiLongMin && ind.rsi <= profile.rsiLongMax;
        isStochOk     = ind.stochRsi <= profile.stochOversold;
        const histFlip = ind.macd.prevHistogram < 0 && ind.macd.histogram >= 0;
        isMacdOk      = histFlip || ind.macd.histogram > 0;
        const bullEngulf = cur.close > prev.open && cur.open < prev.close && isCandleBullish && !isPrevCandleBullish;
        isCandleOk    = (isCandleBullish && isPrevCandleBullish) || bullEngulf;
      } else if (isShort) {
        isInEmaZone = (
          cur.high >= emaLow * (1 - buf) &&
          cur.close <= emaHigh * (1 + buf) &&
          Math.abs(cur.high - ind.ema21) <= atr * emaAtr
        ) || Math.abs(cur.high - ind.ema50) <= atr * emaAtr;

        isRsiHealthy  = ind.rsi >= profile.rsiShortMin && ind.rsi <= profile.rsiShortMax;
        isStochOk     = ind.stochRsi >= profile.stochOverbought;
        const histFlip = ind.macd.prevHistogram > 0 && ind.macd.histogram <= 0;
        isMacdOk      = histFlip || ind.macd.histogram < 0;
        const bearEngulf = cur.close < prev.open && cur.open > prev.close && isCandleBearish && !isPrevCandleBearish;
        isCandleOk    = (isCandleBearish && isPrevCandleBearish) || bearEngulf;
      }

      const gates = {
        'HTF Trend (not NEUTRAL)': isLong || isShort,
        'EMA Zone [P1-C]':   isInEmaZone,
        'RSI Healthy [RSI]':  isRsiHealthy,
        'StochRSI [P2-B]':   isStochOk,
        'MACD [P2-A]':       isMacdOk,
        'Candle Structure [P1-B]': isCandleOk,
        'Volume Surge [P1-A]':    isVolumeSurging,
        'Trend Strength [P2-C]':  hasTrendStrength,
        'BB Expanding [P2-D]':    isBbExpanding,
      };

      const passCount = Object.values(gates).filter(Boolean).length;

      const values = {
        'Trend':         ind.higherTimeframeTrend,
        'TrendStrength': `${ind.trendStrength.toFixed(3)}% (min: ${profile.trendStrengthMin}%)`,
        'RSI':           `${ind.rsi.toFixed(1)} (long:${profile.rsiLongMin}-${profile.rsiLongMax} / short:${profile.rsiShortMin}-${profile.rsiShortMax})`,
        'StochRSI':      `${ind.stochRsi.toFixed(1)} (oversold≤${profile.stochOversold} / overbought≥${profile.stochOverbought})`,
        'MACD hist':     `${ind.macd.histogram.toFixed(4)} (prev: ${ind.macd.prevHistogram.toFixed(4)})`,
        'BB width':      `${(ind.bollingerBands.width * 100).toFixed(3)}% vs avg ${(ind.bollingerBands.avgWidth * 100).toFixed(3)}% (mult: ${profile.bbMult})`,
        'Volume>avg':    `${isVolumeSurging} (vol: ${triggerCandles[lastIdx].volume.toFixed(0)})`,
        'EMA21/50':      `${ind.ema21.toFixed(4)} / ${ind.ema50.toFixed(4)}`,
        'CurCandle':     `O:${cur.open.toFixed(4)} H:${cur.high.toFixed(4)} L:${cur.low.toFixed(4)} C:${cur.close.toFixed(4)}`,
      };

      results.push({ symbol, trend: ind.higherTimeframeTrend, gates, values, passCount });
    } catch (err: any) {
      console.log(`❌ Error diagnosing ${symbol}: ${err.message}`);
    }
  }

  // ── Print results sorted by passCount descending ──────────────────────────
  results.sort((a, b) => b.passCount - a.passCount);

  for (const r of results) {
    const bar = `${'█'.repeat(r.passCount)}${'░'.repeat(9 - r.passCount)}`;
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`  ${r.symbol.padEnd(12)} ${r.trend.padEnd(10)}  [${bar}] ${r.passCount}/9 gates pass`);
    console.log(`${'─'.repeat(65)}`);
    for (const [gate, passed] of Object.entries(r.gates)) {
      console.log(`  ${pass(passed)} ${gate}`);
    }
    console.log(`\n  📐 Raw values:`);
    for (const [k, v] of Object.entries(r.values)) {
      console.log(`     ${k.padEnd(18)}: ${v}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  SUMMARY — FILTER_MODE: ${env.FILTER_MODE}`);
  console.log(`${'═'.repeat(65)}`);
  const neutral = results.filter(r => r.trend === 'NEUTRAL').length;
  const wouldPass = results.filter(r => r.passCount === 9).length;
  console.log(`  Total symbols diagnosed : ${results.length}`);
  console.log(`  Stuck in NEUTRAL trend  : ${neutral} (first gate fails immediately)`);
  console.log(`  Would generate a signal : ${wouldPass}`);
  console.log(`\n  Most common failing gate:`);
  const gateFails: Record<string, number> = {};
  for (const r of results) {
    for (const [gate, passed] of Object.entries(r.gates)) {
      if (!passed) gateFails[gate] = (gateFails[gate] ?? 0) + 1;
    }
  }
  const sorted = Object.entries(gateFails).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([gate, count]) => {
    console.log(`    ${count}/${results.length} fail: ${gate}`);
  });
  console.log('');
}

run().catch(console.error);

import { bybitMarketService } from '../bybit/market.service';
import { technicalIndicators } from './indicators';
import { MarketTicker, RankedCoin, CoinOpportunityScore } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class CoinSelectorService {
  /**
   * Scan entire Bybit market, compute multi-factor scores, and rank top opportunity pairs
   */
  async rankAndSelectTopCoins(limit: number = env.DYNAMIC_TOP_COINS_COUNT): Promise<RankedCoin[]> {
    logger.info(`🔍 [COIN SELECTOR] Scanning entire Bybit USDT universe for high-opportunity pairs...`);

    // 1. Fetch all USDT Linear Tickers
    const allTickers = await bybitMarketService.getTickers();
    if (!allTickers.length) {
      logger.warn('No tickers returned from Bybit.');
      return [];
    }

    // Find BTC baseline for Relative Strength calculation
    const btcTicker = allTickers.find((t) => t.symbol === 'BTCUSDT');
    const btcChange24h = btcTicker ? btcTicker.price24hPcnt : 0;

    // 2. Apply Liquidity, Spread, and Derivatives Safety Filter
    const qualifiedTickers = allTickers.filter((t) => {
      const passesVolume = t.volume24hUsdt >= env.DYNAMIC_MIN_24H_VOLUME_USDT;
      const passesSpread = t.spreadPercent <= env.DYNAMIC_MAX_SPREAD_PERCENT;
      const passesFunding = Math.abs(t.fundingRate) <= 0.03; // Avoid extreme squeeze risk

      return passesVolume && passesSpread && passesFunding;
    });

    logger.info(
      `📊 ${qualifiedTickers.length} / ${allTickers.length} pairs passed liquidity & spread thresholds (Min Vol: $${(env.DYNAMIC_MIN_24H_VOLUME_USDT / 1e6).toFixed(0)}M, Max Spread: ${env.DYNAMIC_MAX_SPREAD_PERCENT}%).`
    );

    // Sort by volume descending and take top candidate pool (up to 35 pairs) for deep technical analysis
    const candidatePool = qualifiedTickers
      .sort((a, b) => b.volume24hUsdt - a.volume24hUsdt)
      .slice(0, 35);

    const scoredCoins: RankedCoin[] = [];

    // 3. Multi-Factor Quantitative Evaluation on Candidate Pool
    for (const ticker of candidatePool) {
      try {
        const [triggerCandles, trendCandles] = await Promise.all([
          bybitMarketService.getKlines(ticker.symbol, env.TRIGGER_TIMEFRAME, 60),
          bybitMarketService.getKlines(ticker.symbol, env.TREND_TIMEFRAME, 60),
        ]);

        if (triggerCandles.length < 30 || trendCandles.length < 30) continue;

        const indicators = technicalIndicators.analyzeCandles(triggerCandles, trendCandles);
        if (!indicators) continue;

        // A. Relative Strength vs BTC (0 - 30 pts)
        const rsDiff = ticker.symbol === 'BTCUSDT' ? 0 : ticker.price24hPcnt - btcChange24h;
        const absRs = Math.abs(rsDiff);
        let rsScore = Math.min(30, (absRs / 5) * 30); // 5% divergence = full 30 pts
        if (ticker.symbol === 'BTCUSDT') rsScore = 20; // Default high benchmark for BTC

        // B. Relative Volume (RVOL) Surge (0 - 25 pts)
        const recentVolumes = triggerCandles.slice(-20).map((c) => c.volume);
        const avgVol = recentVolumes.reduce((a, b) => a + b, 0) / (recentVolumes.length || 1);
        const currentVol = triggerCandles[triggerCandles.length - 1].volume;
        const rvol = avgVol > 0 ? currentVol / avgVol : 1.0;

        let rvolScore = 0;
        if (rvol >= 2.0) rvolScore = 25;
        else if (rvol >= 1.4) rvolScore = 20;
        else if (rvol >= 1.1) rvolScore = 15;
        else rvolScore = Math.max(5, rvol * 10);

        // C. Trend Structure Alignment (0 - 25 pts)
        let trendScore = 0;
        let trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = indicators.higherTimeframeTrend;

        if (indicators.higherTimeframeTrend === 'BULLISH') {
          const isStackedBullish =
            indicators.ema9 > indicators.ema21 &&
            indicators.ema21 > indicators.ema50 &&
            indicators.ema50 > indicators.ema200;
          trendScore = isStackedBullish ? 25 : 18;
        } else if (indicators.higherTimeframeTrend === 'BEARISH') {
          const isStackedBearish =
            indicators.ema9 < indicators.ema21 &&
            indicators.ema21 < indicators.ema50 &&
            indicators.ema50 < indicators.ema200;
          trendScore = isStackedBearish ? 25 : 18;
        } else {
          trendScore = 5; // Ranging/Chop penalty
        }

        // D. Normalized ATR Volatility Band (0 - 20 pts)
        const lastClose = triggerCandles[triggerCandles.length - 1].close;
        const natrPercent = lastClose > 0 ? (indicators.atr / lastClose) * 100 : 0;

        let natrScore = 0;
        if (natrPercent >= env.DYNAMIC_MIN_ATR_PERCENT && natrPercent <= env.DYNAMIC_MAX_ATR_PERCENT) {
          // Sweet spot: 1.5% - 5.0%
          if (natrPercent >= 1.8 && natrPercent <= 5.0) {
            natrScore = 20;
          } else {
            natrScore = 15;
          }
        } else {
          natrScore = 5; // Too compressed or hyper erratic
        }

        const totalScore = Math.round(rsScore + rvolScore + trendScore + natrScore);

        const scoreBreakdown: CoinOpportunityScore = {
          relativeStrengthScore: Math.round(rsScore),
          volumeSurgeScore: Math.round(rvolScore),
          trendStructureScore: Math.round(trendScore),
          volatilityHealthScore: Math.round(natrScore),
          totalScore,
        };

        scoredCoins.push({
          symbol: ticker.symbol,
          rank: 0,
          lastPrice: ticker.lastPrice,
          volume24hUsdt: ticker.volume24hUsdt,
          spreadPercent: ticker.spreadPercent,
          price24hPcnt: ticker.price24hPcnt,
          relativeStrengthVsBtc: parseFloat(rsDiff.toFixed(2)),
          rvol: parseFloat(rvol.toFixed(2)),
          natrPercent: parseFloat(natrPercent.toFixed(2)),
          trendDirection,
          scores: scoreBreakdown,
        });
      } catch (err: any) {
        logger.debug(`Error evaluating coin ${ticker.symbol}: ${err.message}`);
      }
    }

    // 4. Rank by Total Opportunity Score descending
    const rankedCoins = scoredCoins
      .sort((a, b) => b.scores.totalScore - a.scores.totalScore)
      .slice(0, limit)
      .map((coin, index) => ({
        ...coin,
        rank: index + 1,
      }));

    logger.info(`✨ Selected Top ${rankedCoins.length} opportunity pairs for active scanning.`);
    return rankedCoins;
  }
}

export const coinSelectorService = new CoinSelectorService();

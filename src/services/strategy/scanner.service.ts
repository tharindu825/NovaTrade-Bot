import { bybitMarketService } from '../bybit/market.service';
import { technicalIndicators } from './indicators';
import { signalService } from './signal.service';
import { SignalCandidate, MarketTicker } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class ScannerService {
  /**
   * Scan configured trading pairs for trade setups
   */
  async scanMarkets(): Promise<{ signals: SignalCandidate[]; tickers: MarketTicker[] }> {
    logger.info(`🔍 Scanning markets for high-probability setups...`);

    // Fetch tickers
    const allTickers = await bybitMarketService.getTickers(env.TRADING_PAIRS);

    // Apply Liquidity & Spread Filters
    const filteredTickers = allTickers.filter((t) => {
      const passesVolume = t.volume24hUsdt >= env.MIN_24H_VOLUME_USDT;
      const passesSpread = t.spreadPercent <= env.MAX_SPREAD_PERCENT;

      if (!passesVolume) {
        logger.debug(`Skipping ${t.symbol}: 24h Vol $${(t.volume24hUsdt / 1e6).toFixed(2)}M < Min $${(env.MIN_24H_VOLUME_USDT / 1e6).toFixed(2)}M`);
      }
      if (!passesSpread) {
        logger.debug(`Skipping ${t.symbol}: Spread ${t.spreadPercent.toFixed(3)}% > Max ${env.MAX_SPREAD_PERCENT}%`);
      }

      return passesVolume && passesSpread;
    });

    logger.info(`📊 ${filteredTickers.length} / ${allTickers.length} symbols passed liquidity & spread filters.`);

    const signals: SignalCandidate[] = [];

    for (const ticker of filteredTickers) {
      try {
        // Fetch 15m trigger candles & 60m trend candles
        const [triggerCandles, trendCandles] = await Promise.all([
          bybitMarketService.getKlines(ticker.symbol, env.TRIGGER_TIMEFRAME, 100),
          bybitMarketService.getKlines(ticker.symbol, env.TREND_TIMEFRAME, 100),
        ]);

        if (triggerCandles.length < 50 || trendCandles.length < 50) {
          continue;
        }

        const indicators = technicalIndicators.analyzeCandles(triggerCandles, trendCandles);
        if (!indicators) continue;

        const candidate = signalService.evaluateSetup(ticker.symbol, triggerCandles, indicators);
        if (candidate) {
          logger.info(`🎯 [SETUP FOUND] ${candidate.direction} on ${candidate.symbol} @ $${candidate.entryPrice}`);
          signals.push(candidate);
        }
      } catch (err: any) {
        logger.error(`Error scanning ${ticker.symbol}: ${err.message}`);
      }
    }

    return { signals, tickers: filteredTickers };
  }
}

export const scannerService = new ScannerService();

import Table from 'cli-table3';
import chalk from 'chalk';
import { bybitMarketService } from '../bybit/market.service';
import { technicalIndicators } from './indicators';
import { signalService } from './signal.service';
import { coinSelectorService } from './coinSelector.service';
import { SignalCandidate, MarketTicker, RankedCoin } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class ScannerService {
  /**
   * Print a table of dynamically selected top coins
   */
  printCoinSelectionTable(rankedCoins: RankedCoin[]) {
    console.log('\n' + chalk.bold.magenta('================== DYNAMIC COIN SELECTION RANKINGS =================='));
    const table = new Table({
      head: [
        chalk.white('Rank'),
        chalk.white('Symbol'),
        chalk.white('Price'),
        chalk.white('24h %'),
        chalk.white('RS vs BTC'),
        chalk.white('RVOL'),
        chalk.white('NATR %'),
        chalk.white('Trend'),
        chalk.white('Score (0-100)'),
      ],
      colWidths: [8, 12, 12, 10, 12, 10, 10, 12, 16],
    });

    for (const c of rankedCoins) {
      const isUp = c.price24hPcnt >= 0;
      const changeColor = isUp ? chalk.green(`+${c.price24hPcnt.toFixed(2)}%`) : chalk.red(`${c.price24hPcnt.toFixed(2)}%`);
      const rsColor = c.relativeStrengthVsBtc >= 0 ? chalk.green(`+${c.relativeStrengthVsBtc}%`) : chalk.red(`${c.relativeStrengthVsBtc}%`);
      const trendColor = c.trendDirection === 'BULLISH' ? chalk.green('BULLISH') : c.trendDirection === 'BEARISH' ? chalk.red('BEARISH') : chalk.gray('NEUTRAL');
      const scoreColor = c.scores.totalScore >= 75 ? chalk.greenBright(c.scores.totalScore.toString()) : chalk.yellow(c.scores.totalScore.toString());

      table.push([
        `#${c.rank}`,
        chalk.bold(c.symbol),
        `$${c.lastPrice}`,
        changeColor,
        rsColor,
        `${c.rvol}x`,
        `${c.natrPercent}%`,
        trendColor,
        chalk.bold(scoreColor),
      ]);
    }

    console.log(table.toString() + '\n');
  }

  /**
   * Scan trading pairs (dynamic auto-discovery or static list) for setups
   */
  async scanMarkets(): Promise<{ signals: SignalCandidate[]; tickers: MarketTicker[] }> {
    logger.info(`🔍 Scanning markets [Mode: ${env.COIN_SELECTION_MODE}]...`);

    let targetSymbols: string[] = [];
    let activeTickers: MarketTicker[] = [];

    if (env.COIN_SELECTION_MODE === 'DYNAMIC') {
      // 1. Dynamic Multi-Factor Coin Selection
      const rankedCoins = await coinSelectorService.rankAndSelectTopCoins(env.DYNAMIC_TOP_COINS_COUNT);
      if (!rankedCoins.length) {
        logger.warn('Dynamic coin selector found 0 qualifying pairs. Falling back to static pairs.');
        targetSymbols = env.TRADING_PAIRS;
      } else {
        this.printCoinSelectionTable(rankedCoins);
        targetSymbols = rankedCoins.map((c) => c.symbol);
      }
      activeTickers = await bybitMarketService.getTickers(targetSymbols);
    } else {
      // 2. Static Universe from .env
      const allTickers = await bybitMarketService.getTickers(env.TRADING_PAIRS);
      activeTickers = allTickers.filter((t) => {
        const passesVolume = t.volume24hUsdt >= env.MIN_24H_VOLUME_USDT;
        const passesSpread = t.spreadPercent <= env.MAX_SPREAD_PERCENT;
        return passesVolume && passesSpread;
      });
      targetSymbols = activeTickers.map((t) => t.symbol);
    }

    logger.info(`📊 Scanning ${targetSymbols.length} high-opportunity pairs for technical entry triggers...`);

    const signals: SignalCandidate[] = [];

    for (const ticker of activeTickers) {
      try {
        const [triggerCandles, trendCandles] = await Promise.all([
          bybitMarketService.getKlines(ticker.symbol, env.TRIGGER_TIMEFRAME, 100),
          bybitMarketService.getKlines(ticker.symbol, env.TREND_TIMEFRAME, 100),
        ]);

        if (triggerCandles.length < 50 || trendCandles.length < 50) continue;

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

    return { signals, tickers: activeTickers };
  }
}

export const scannerService = new ScannerService();

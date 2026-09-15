import chalk from 'chalk';
import { env } from './config/env';
import { logger } from './services/logger';
import { bybitTradeService } from './services/bybit/trade.service';
import { scannerService } from './services/strategy/scanner.service';
import { aiRiskEvaluator } from './services/ai/riskEvaluator';
import { technicalIndicators } from './services/strategy/indicators';
import { bybitMarketService } from './services/bybit/market.service';
import { positionSizer } from './services/risk/positionSizer';
import { storageService } from './services/database/storage';
import { positionManager } from './services/bybit/positionManager';
import { notificationService } from './services/notification/webhook.service';
import { ActiveTrade } from './types';

function printBanner() {
  console.log(
    chalk.cyanBright(`
======================================================================
  _   _                 _____               _         ____        _   
 | \\ | | _____   ____ _|_   _| __ __ _   __| | ___   | __ )  ___ | |_ 
 |  \\| |/ _ \\ \\ / / _\` | | || '__/ _\` | / _\` |/ _ \\  |  _ \\ / _ \\| __|
 | |\\  | (_) \\ V / (_| | | || | | (_| || (_| |  __/  | |_) | (_) | |_ 
 |_| \\_|\\___/ \\_/ \\__,_| |_||_|  \\__,_| \\__,_|\\___|  |____/ \\___/ \\__|
                                                                      
  🚀 Institutional Crypto Trading Bot • Powered by Bybit V5 & AI
======================================================================
`)
  );
  console.log(chalk.yellow(`⚙️  Environment Mode:      ${env.BYBIT_DEMO_TRADING ? 'BYBIT V5 DEMO TRADING (Testnet)' : 'LIVE BYBIT'}`));
  console.log(chalk.yellow(`🤖 AI Risk Model:         ${env.OPENROUTER_PRIMARY_MODEL}`));
  console.log(chalk.yellow(`🎯 AI Minimum Confidence:  ${env.OPENROUTER_MIN_CONFIDENCE}%`));
  console.log(chalk.yellow(`⚖️  Risk per Trade:        ${env.POSITION_RISK_PERCENT}% of Equity`));
  console.log(chalk.yellow(`⚡ Leverage:               ${env.LEVERAGE}x`));
  console.log(chalk.yellow(`📈 Tradable Pairs:        ${env.TRADING_PAIRS.join(', ')}`));
  console.log(chalk.yellow(`⏱️  Scan Timeframe:        Trigger ${env.TRIGGER_TIMEFRAME}m | Trend ${env.TREND_TIMEFRAME}m\n`));
}

export class BotOrchestrator {
  private isScanning: boolean = false;
  private isManagingPositions: boolean = false;

  async start() {
    printBanner();

    // 1. Check Bybit Account & Balance
    logger.info('🔑 Checking Bybit connection and fetching balance...');
    const balance = await bybitTradeService.getAccountBalance();

    if (balance) {
      logger.info(
        `💰 Account Connected! Total Equity: $${balance.totalEquity.toFixed(2)} USDT (Available: $${balance.availableBalance.toFixed(2)})`
      );
    } else {
      logger.warn('⚠️ Could not connect or retrieve wallet balance. Please check your Bybit credentials in .env.');
    }

    // 2. Initial Display of Positions
    const activeTrades = storageService.getActiveTrades();
    notificationService.printActiveTradesTable(activeTrades, balance?.totalEquity || 0);

    // 3. Run initial scan immediately
    await this.runScanCycle();

    // 4. Setup Market Scanner Interval (e.g. every 15 minutes)
    const scanIntervalMs = env.SCAN_INTERVAL_MINUTES * 60 * 1000;
    setInterval(() => {
      this.runScanCycle();
    }, scanIntervalMs);

    // 5. Setup Active Position Tracking Interval (every 15 seconds)
    setInterval(() => {
      this.runPositionManagementCycle();
    }, 15000);

    logger.info(`✨ NovaTrade-Bot is running actively. Market scanner scheduled every ${env.SCAN_INTERVAL_MINUTES}m.`);
  }

  /**
   * Main Market Scanning & Trade Execution Routine
   */
  async runScanCycle() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      logger.info('======================= SCAN CYCLE STARTED =======================');

      const activeTrades = storageService.getActiveTrades();
      const balance = await bybitTradeService.getAccountBalance();
      const equity = balance?.totalEquity || 1000;

      notificationService.printActiveTradesTable(activeTrades, equity);

      if (activeTrades.length >= env.MAX_OPEN_POSITIONS) {
        logger.info(`⏸️ Maximum open positions reached (${activeTrades.length}/${env.MAX_OPEN_POSITIONS}). Skipping new entries.`);
        return;
      }

      // Scan markets for candidates
      const { signals, tickers } = await scannerService.scanMarkets();

      if (signals.length === 0) {
        logger.info('😴 No high-probability setups identified in this scan cycle.');
        return;
      }

      logger.info(`🎯 Identified ${signals.length} candidate setup(s). Passing to AI Risk & Sentiment Evaluator...`);

      for (const signal of signals) {
        // Prevent duplicate positions on same symbol
        const alreadyOpen = activeTrades.some((t) => t.symbol === signal.symbol);
        if (alreadyOpen) {
          logger.info(`Skipping ${signal.symbol}: Already have an active position.`);
          continue;
        }

        // Fetch candle context for AI prompt
        const [triggerCandles, trendCandles] = await Promise.all([
          bybitMarketService.getKlines(signal.symbol, env.TRIGGER_TIMEFRAME, 50),
          bybitMarketService.getKlines(signal.symbol, env.TREND_TIMEFRAME, 50),
        ]);

        const indicators = technicalIndicators.analyzeCandles(triggerCandles, trendCandles);
        if (!indicators) continue;

        const ticker = tickers.find((t) => t.symbol === signal.symbol);
        const fundingRate = ticker?.fundingRate || 0;

        // Run AI Risk & Sentiment Evaluation via OpenRouter
        const aiEvaluation = await aiRiskEvaluator.evaluateTrade(signal, indicators, fundingRate);

        if (!aiEvaluation.approved) {
          logger.warn(
            `🚫 [AI VETOED] Trade on ${signal.symbol} rejected by AI. Reason: ${aiEvaluation.reasoning}`
          );
          continue;
        }

        logger.info(
          `✅ [AI APPROVED] ${signal.direction} on ${signal.symbol} | Confidence: ${aiEvaluation.confidenceScore}% | Multiplier: ${aiEvaluation.riskAdjustmentFactor}x`
        );

        // Calculate Position Sizing
        const sizing = positionSizer.calculatePositionSize({
          totalEquity: equity,
          signal,
          aiEvaluation,
        });

        if (sizing.quantity <= 0) {
          logger.warn(`Calculated quantity for ${signal.symbol} is 0. Skipping.`);
          continue;
        }

        // Execute Bybit Order
        const executionResult = await bybitTradeService.executeSignal(signal, sizing.quantity);

        if (executionResult.success) {
          const newTrade: ActiveTrade = {
            id: `trade_${Date.now()}_${signal.symbol}`,
            symbol: signal.symbol,
            direction: signal.direction,
            side: signal.direction === 'LONG' ? 'Buy' : 'Sell',
            entryPrice: signal.entryPrice,
            initialQty: sizing.quantity,
            currentQty: sizing.quantity,
            slPrice: signal.slPrice,
            tp1Price: signal.tp1Price,
            tp2Price: signal.tp2Price,
            tp1Hit: false,
            status: 'OPEN',
            orderIdEntry: executionResult.orderId,
            realizedPnl: 0,
            aiEvaluation,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          storageService.saveTrade(newTrade);
          await notificationService.notifyTradeEntry(newTrade, signal, aiEvaluation);
        }
      }
    } catch (err: any) {
      logger.error(`Error during scan cycle: ${err.message}`);
    } finally {
      this.isScanning = false;
      logger.info('======================= SCAN CYCLE COMPLETED =======================\n');
    }
  }

  /**
   * Monitor Active Positions (TP1 Partial Close, Breakeven SL, TP2 Exit)
   */
  async runPositionManagementCycle() {
    if (this.isManagingPositions) return;
    this.isManagingPositions = true;

    try {
      await positionManager.manageActivePositions();
    } catch (err: any) {
      logger.error(`Error in position management loop: ${err.message}`);
    } finally {
      this.isManagingPositions = false;
    }
  }
}

// Start the bot
const bot = new BotOrchestrator();
bot.start().catch((err) => {
  logger.error(`Fatal bot error: ${err.message}`);
});

import chalk from 'chalk';
import { env } from '../config/env';
import { scannerService } from '../services/strategy/scanner.service';
import { aiRiskEvaluator } from '../services/ai/riskEvaluator';
import { technicalIndicators } from '../services/strategy/indicators';
import { bybitMarketService } from '../services/bybit/market.service';
import { positionSizer } from '../services/risk/positionSizer';
import { logger } from '../services/logger';

async function main() {
  console.log(chalk.bold.cyan('🧪 Running Single Dry-Run Market Scan & AI Analysis...\n'));
  console.log(chalk.yellow(`Trading Pairs: ${env.TRADING_PAIRS.join(', ')}`));
  console.log(chalk.yellow(`Trigger Timeframe: ${env.TRIGGER_TIMEFRAME}m | Trend Timeframe: ${env.TREND_TIMEFRAME}m`));
  console.log(chalk.yellow(`AI Model: ${env.OPENROUTER_PRIMARY_MODEL}\n`));

  const { signals, tickers } = await scannerService.scanMarkets();

  console.log(chalk.bold(`\n📊 Scan Results: Found ${signals.length} setup candidate(s).\n`));

  for (const signal of signals) {
    console.log(chalk.bold.green(`=================================================================`));
    console.log(chalk.bold.green(`🎯 Candidate: ${signal.direction} on ${signal.symbol}`));
    console.log(`• Entry Price: $${signal.entryPrice}`);
    console.log(`• Stop Loss:   $${signal.slPrice} (Distance: $${signal.riskDistance.toFixed(4)})`);
    console.log(`• TP1 (50%):   $${signal.tp1Price} (${signal.riskRewardRatioTP1}R) -> Breakeven SL`);
    console.log(`• TP2 (100%):  $${signal.tp2Price} (${signal.riskRewardRatioTP2}R)`);
    console.log(`• Technicals:  ${signal.technicalReasons.join(' | ')}`);

    const [triggerCandles, trendCandles] = await Promise.all([
      bybitMarketService.getKlines(signal.symbol, env.TRIGGER_TIMEFRAME, 50),
      bybitMarketService.getKlines(signal.symbol, env.TREND_TIMEFRAME, 50),
    ]);

    const indicators = technicalIndicators.analyzeCandles(triggerCandles, trendCandles);
    if (!indicators) continue;

    const ticker = tickers.find((t) => t.symbol === signal.symbol);
    const fundingRate = ticker?.fundingRate || 0;

    console.log(chalk.cyan(`\n🤖 Sending to OpenRouter AI for Risk Evaluation...`));
    const aiResult = await aiRiskEvaluator.evaluateTrade(signal, indicators, fundingRate);

    console.log(chalk.bold(`• AI Verdict:    ${aiResult.approved ? chalk.green('APPROVED') : chalk.red('VETOED / REJECTED')}`));
    console.log(`• AI Confidence: ${aiResult.confidenceScore}%`);
    console.log(`• AI Sentiment:  ${aiResult.sentiment}`);
    console.log(`• AI Reasoning:  ${aiResult.reasoning}`);
    if (aiResult.warnings?.length) {
      console.log(`• Warnings:      ${aiResult.warnings.join(', ')}`);
    }

    if (aiResult.approved) {
      const sizing = positionSizer.calculatePositionSize({
        totalEquity: 1000, // Simulated $1000 equity
        signal,
        aiEvaluation: aiResult,
      });
      console.log(chalk.magenta(`• Simulated Size: ${sizing.quantity.toFixed(4)} ${signal.symbol} (Risk: $${sizing.riskAmountUsdt.toFixed(2)})`));
    }
    console.log(chalk.bold.green(`=================================================================\n`));
  }
}

main().catch(console.error);

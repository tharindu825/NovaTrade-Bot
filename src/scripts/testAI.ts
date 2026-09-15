import chalk from 'chalk';
import { aiRiskEvaluator } from '../services/ai/riskEvaluator';
import { SignalCandidate, TechnicalIndicators } from '../types';
import { env } from '../config/env';

async function main() {
  console.log(chalk.bold.cyan('🧪 Testing OpenRouter AI Risk & Sentiment Evaluator...\n'));
  console.log(chalk.yellow(`Model: ${env.OPENROUTER_PRIMARY_MODEL}`));
  console.log(chalk.yellow(`API Key Configured: ${env.OPENROUTER_API_KEY ? 'YES (Present)' : 'NO (Empty)'}\n`));

  const mockSignal: SignalCandidate = {
    symbol: 'BTCUSDT',
    direction: 'LONG',
    timeframe: '15m',
    entryPrice: 65000,
    slPrice: 64200,
    tp1Price: 66040,
    tp2Price: 67080,
    riskDistance: 800,
    riskRewardRatioTP1: 1.3,
    riskRewardRatioTP2: 2.6,
    atr: 530,
    technicalReasons: [
      'Higher Timeframe Trend is BULLISH (EMA50 > EMA200)',
      'Healthy Pullback to EMA21 with Bullish Reversal Candle',
      'RSI at 48.5 (Healthy momentum zone)',
    ],
    timestamp: Date.now(),
  };

  const mockIndicators: TechnicalIndicators = {
    ema9: 64950,
    ema21: 64800,
    ema50: 64500,
    ema200: 63200,
    rsi: 48.5,
    macd: { macd: 120, signal: 95, histogram: 25 },
    atr: 530,
    higherTimeframeTrend: 'BULLISH',
    volumeAboveAverage: true,
    regime: 'TRENDING_UP',
  };

  const result = await aiRiskEvaluator.evaluateTrade(mockSignal, mockIndicators, 0.0001);

  console.log(chalk.bold.green('\n📊 AI Evaluation Result:'));
  console.log(JSON.stringify(result, null, 2));

  if (result.approved) {
    console.log(chalk.bold.green(`\n✅ Trade APPROVED by AI with ${result.confidenceScore}% confidence!`));
  } else {
    console.log(chalk.bold.red(`\n🚫 Trade VETOED/REJECTED by AI: ${result.reasoning}`));
  }
}

main().catch(console.error);

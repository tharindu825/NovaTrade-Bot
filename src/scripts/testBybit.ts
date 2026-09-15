import chalk from 'chalk';
import { bybitMarketService } from '../services/bybit/market.service';
import { bybitTradeService } from '../services/bybit/trade.service';
import { env } from '../config/env';

async function main() {
  console.log(chalk.bold.cyan('🧪 Testing Bybit V5 Connection & Market Data...\n'));
  console.log(chalk.yellow(`Environment: ${env.BYBIT_DEMO_TRADING ? 'DEMO TRADING (api-demo.bybit.com)' : 'LIVE'}`));
  console.log(chalk.yellow(`API Key Configured: ${env.BYBIT_API_KEY ? 'YES' : 'NO'}\n`));

  // 1. Fetch Tickers
  console.log(chalk.bold('1. Fetching Top Tickers:'));
  const tickers = await bybitMarketService.getTickers(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  for (const t of tickers) {
    console.log(
      `• ${t.symbol}: Price $${t.lastPrice} | Spread ${t.spreadPercent.toFixed(3)}% | 24h Vol: $${(t.volume24hUsdt / 1e6).toFixed(1)}M | Funding: ${(t.fundingRate * 100).toFixed(4)}%`
    );
  }

  // 2. Fetch Klines
  console.log(chalk.bold('\n2. Fetching 15m Klines for BTCUSDT:'));
  const candles = await bybitMarketService.getKlines('BTCUSDT', '15', 5);
  console.log(`Fetched ${candles.length} candles. Latest Close: $${candles[candles.length - 1]?.close}`);

  // 3. Instrument specifications
  console.log(chalk.bold('\n3. Fetching Instrument Specifications for BTCUSDT:'));
  const info = await bybitMarketService.getInstrumentInfo('BTCUSDT');
  console.log(info);

  // 4. Check Wallet Balance
  console.log(chalk.bold('\n4. Checking Account Balance:'));
  const balance = await bybitTradeService.getAccountBalance();
  if (balance) {
    console.log(chalk.green(`Equity: $${balance.totalEquity} USDT | Available: $${balance.availableBalance} USDT`));
  } else {
    console.log(chalk.yellow('No balance retrieved (ensure demo API keys are set if testing private endpoints).'));
  }
}

main().catch(console.error);

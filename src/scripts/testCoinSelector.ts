import chalk from 'chalk';
import { coinSelectorService } from '../services/strategy/coinSelector.service';
import { scannerService } from '../services/strategy/scanner.service';
import { env } from '../config/env';

async function main() {
  console.log(chalk.bold.cyan('🧪 Testing Multi-Factor Dynamic Coin Selection Engine...\n'));
  console.log(chalk.yellow(`Mode:                     ${env.COIN_SELECTION_MODE}`));
  console.log(chalk.yellow(`Target Top Coins Count:   ${env.DYNAMIC_TOP_COINS_COUNT}`));
  console.log(chalk.yellow(`Min 24h Volume (USDT):    $${(env.DYNAMIC_MIN_24H_VOLUME_USDT / 1e6).toFixed(0)}M`));
  console.log(chalk.yellow(`Max Spread:               ${env.DYNAMIC_MAX_SPREAD_PERCENT}%`));
  console.log(chalk.yellow(`Target Volatility (NATR): ${env.DYNAMIC_MIN_ATR_PERCENT}% - ${env.DYNAMIC_MAX_ATR_PERCENT}%\n`));

  const rankedCoins = await coinSelectorService.rankAndSelectTopCoins(env.DYNAMIC_TOP_COINS_COUNT);

  if (!rankedCoins.length) {
    console.log(chalk.red('❌ No coins qualified under current filters.'));
    return;
  }

  scannerService.printCoinSelectionTable(rankedCoins);

  console.log(chalk.bold.green('🏆 Top 3 High-Opportunity Pairs Breakdown:'));
  rankedCoins.slice(0, 3).forEach((c) => {
    console.log(chalk.cyan(`\n• #${c.rank} ${c.symbol} (Total Score: ${c.scores.totalScore}/100)`));
    console.log(`  - Price: $${c.lastPrice} (24h: ${c.price24hPcnt.toFixed(2)}%)`);
    console.log(`  - Relative Strength vs BTC: ${c.relativeStrengthVsBtc >= 0 ? '+' : ''}${c.relativeStrengthVsBtc}% (Score: ${c.scores.relativeStrengthScore}/30)`);
    console.log(`  - Relative Volume (RVOL): ${c.rvol}x (Score: ${c.scores.volumeSurgeScore}/25)`);
    console.log(`  - Trend Structure: ${c.trendDirection} (Score: ${c.scores.trendStructureScore}/25)`);
    console.log(`  - Normalized ATR: ${c.natrPercent}% (Score: ${c.scores.volatilityHealthScore}/20)`);
  });
}

main().catch(console.error);

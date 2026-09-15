import chalk from 'chalk';
import { newsSentimentService } from '../services/sentiment/news.service';
import { fearGreedService } from '../services/sentiment/fearGreed.service';

async function main() {
  console.log(chalk.bold.cyan('🧪 Testing News & Sentiment Ingestion Pipeline...\n'));

  // 1. Test Fear & Greed Index
  console.log(chalk.bold('1. Testing Crypto Fear & Greed Index:'));
  const fng = await fearGreedService.getFearGreedIndex();
  if (fng) {
    console.log(chalk.green(`• Score: ${fng.value}/100 (${fng.classification})`));
  } else {
    console.log(chalk.red('• Could not fetch Fear & Greed index.'));
  }

  // 2. Test RSS News Fetching
  console.log(chalk.bold('\n2. Testing Free RSS Feeds (CoinTelegraph, CoinDesk):'));
  const articles = await newsSentimentService.getLatestNews();
  console.log(chalk.green(`• Fetched ${articles.length} unique articles.\n`));

  articles.slice(0, 5).forEach((art, i) => {
    console.log(chalk.yellow(`${i + 1}. [${art.source}] ${art.title}`));
    console.log(chalk.gray(`   Link: ${art.link}\n`));
  });

  // 3. Test AI News Formatter
  console.log(chalk.bold('3. Testing AI Digest Formatter for BTCUSDT:'));
  const digest = newsSentimentService.formatNewsSummaryForAI(articles, 'BTCUSDT');
  console.log(chalk.cyan(digest));
}

main().catch(console.error);

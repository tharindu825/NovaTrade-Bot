import chalk from 'chalk';
import Table from 'cli-table3';
import { bybitClient } from '../services/bybit/client';
import { env } from '../config/env';
import fs from 'fs';
import path from 'path';

interface ClosedPnLRecord {
  symbol: string;
  orderId: string;
  side: string; // 'Buy' or 'Sell'
  qty: string;
  orderPrice: string;
  orderType: string;
  execType: string;
  closedSize: string;
  cumEntryValue: string;
  avgEntryPrice: string;
  cumExitValue: string;
  avgExitPrice: string;
  closedPnl: string;
  fillCount: string;
  leverage: string;
  createdTime: string;
  updatedTime: string;
}

async function fetchAllClosedPnL(startTime: number, endTime: number): Promise<ClosedPnLRecord[]> {
  const SEVEN_DAYS_MS = 6.9 * 24 * 60 * 60 * 1000;
  const records: ClosedPnLRecord[] = [];
  let chunkStart = startTime;

  while (chunkStart < endTime) {
    const chunkEnd = Math.min(chunkStart + SEVEN_DAYS_MS, endTime);
    let cursor: string | undefined = undefined;

    do {
      try {
        const res: any = await bybitClient.getClosedPnL({
          category: 'linear',
          startTime: Math.floor(chunkStart),
          endTime: Math.floor(chunkEnd),
          limit: 100,
          cursor,
        });

        if (res.retCode === 0 && res.result?.list) {
          records.push(...res.result.list);
          cursor = res.result.nextPageCursor || undefined;
        } else {
          console.error(chalk.red(`API Error: ${res.retCode} - ${res.retMsg}`));
          break;
        }
      } catch (err: any) {
        console.error(chalk.red(`Fetch error: ${err.message}`));
        break;
      }
    } while (cursor);

    chunkStart = chunkEnd + 1;
  }

  return records;
}

async function main() {
  console.log(chalk.bold.cyan('===================================================='));
  console.log(chalk.bold.cyan('📊 BYBIT DEMO TRADING PERFORMANCE REPORT (FROM SEP 14)'));
  console.log(chalk.bold.cyan('====================================================\n'));

  const now = Date.now();
  const sep14 = new Date('2026-09-14T00:00:00.000Z').getTime();

  console.log(`Querying Bybit Demo platform from: ${new Date(sep14).toISOString()} to ${new Date(now).toISOString()}`);

  const rawRecords = await fetchAllClosedPnL(sep14, now);

  // Filter out any duplicates if orderId + updatedTime duplicate
  const uniqueRecordsMap = new Map<string, ClosedPnLRecord>();
  for (const r of rawRecords) {
    const key = `${r.orderId}_${r.updatedTime}_${r.symbol}`;
    uniqueRecordsMap.set(key, r);
  }
  const records = Array.from(uniqueRecordsMap.values()).sort(
    (a, b) => parseInt(a.updatedTime, 10) - parseInt(b.updatedTime, 10)
  );

  console.log(chalk.green(`Total Unique Closed PnL Transactions: ${records.length}\n`));

  if (records.length === 0) {
    console.log(chalk.yellow('No closed trades found in this timeframe.'));
    return;
  }

  // Load local trades.json for extra metadata if available
  const dbPath = path.resolve(__dirname, '../../data/trades.json');
  let localTrades: any[] = [];
  if (fs.existsSync(dbPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      localTrades = data.historyTrades || [];
    } catch (e) {}
  }

  // Aggregate Metrics
  let totalPnL = 0;
  let totalWinPnL = 0;
  let totalLossPnL = 0;
  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;

  let maxWin = { pnl: 0, symbol: '', date: '' };
  let maxLoss = { pnl: 0, symbol: '', date: '' };

  const symbolStats: Record<
    string,
    {
      trades: number;
      wins: number;
      losses: number;
      totalPnL: number;
      winPnL: number;
      lossPnL: number;
    }
  > = {};

  const dailyStats: Record<
    string,
    {
      trades: number;
      wins: number;
      losses: number;
      pnl: number;
    }
  > = {};

  const detailsTable = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Date / Time (UTC)'),
      chalk.cyan('Symbol'),
      chalk.cyan('Side'),
      chalk.cyan('Closed Qty'),
      chalk.cyan('Entry Price'),
      chalk.cyan('Exit Price'),
      chalk.cyan('PnL (USDT)'),
      chalk.cyan('Result'),
    ],
    colWidths: [4, 22, 12, 8, 14, 13, 13, 14, 10],
  });

  records.forEach((r, idx) => {
    const pnl = parseFloat(r.closedPnl);
    const dateStr = new Date(parseInt(r.updatedTime, 10)).toISOString().replace('T', ' ').substring(0, 19);
    const dayStr = dateStr.substring(0, 10);
    const symbol = r.symbol;

    totalPnL += pnl;

    if (!symbolStats[symbol]) {
      symbolStats[symbol] = { trades: 0, wins: 0, losses: 0, totalPnL: 0, winPnL: 0, lossPnL: 0 };
    }
    symbolStats[symbol].trades += 1;
    symbolStats[symbol].totalPnL += pnl;

    if (!dailyStats[dayStr]) {
      dailyStats[dayStr] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    }
    dailyStats[dayStr].trades += 1;
    dailyStats[dayStr].pnl += pnl;

    let resultTag = '';
    if (pnl > 0.0001) {
      winCount++;
      totalWinPnL += pnl;
      symbolStats[symbol].wins += 1;
      symbolStats[symbol].winPnL += pnl;
      dailyStats[dayStr].wins += 1;
      resultTag = chalk.green('WIN');

      if (pnl > maxWin.pnl) {
        maxWin = { pnl, symbol, date: dateStr };
      }
    } else if (pnl < -0.0001) {
      lossCount++;
      totalLossPnL += Math.abs(pnl);
      symbolStats[symbol].losses += 1;
      symbolStats[symbol].lossPnL += Math.abs(pnl);
      dailyStats[dayStr].losses += 1;
      resultTag = chalk.red('LOSS');

      if (pnl < maxLoss.pnl) {
        maxLoss = { pnl, symbol, date: dateStr };
      }
    } else {
      breakevenCount++;
      resultTag = chalk.gray('BE');
    }

    const pnlDisplay = pnl >= 0 ? chalk.green(`+$${pnl.toFixed(2)}`) : chalk.red(`-$${Math.abs(pnl).toFixed(2)}`);

    detailsTable.push([
      idx + 1,
      dateStr,
      r.symbol,
      r.side,
      parseFloat(r.closedSize).toFixed(4),
      `$${parseFloat(r.avgEntryPrice).toFixed(4)}`,
      `$${parseFloat(r.avgExitPrice).toFixed(4)}`,
      pnlDisplay,
      resultTag,
    ]);
  });

  const totalClosedTrades = records.length;
  const winRate = totalClosedTrades > 0 ? (winCount / totalClosedTrades) * 100 : 0;
  const winRateExcludingBE = winCount + lossCount > 0 ? (winCount / (winCount + lossCount)) * 100 : 0;
  const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? 999 : 0;
  const avgWin = winCount > 0 ? totalWinPnL / winCount : 0;
  const avgLoss = lossCount > 0 ? totalLossPnL / lossCount : 0;
  const rrRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Print Detailed Table (or first/last 20 if long, but let's show all or write full to JSON)
  console.log(chalk.bold('📜 TRADE EXECUTION HISTORY (ALL RECORDS):'));
  console.log(detailsTable.toString());

  // Symbol Breakdown Table
  const symbolTable = new Table({
    head: [
      chalk.cyan('Symbol'),
      chalk.cyan('Trades'),
      chalk.cyan('Wins'),
      chalk.cyan('Losses'),
      chalk.cyan('Win Rate %'),
      chalk.cyan('Profit (USDT)'),
      chalk.cyan('Loss (USDT)'),
      chalk.cyan('Net PnL (USDT)'),
    ],
  });

  Object.entries(symbolStats)
    .sort((a, b) => b[1].totalPnL - a[1].totalPnL)
    .forEach(([sym, stats]) => {
      const symWinRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) + '%' : '0%';
      const netPnlDisplay =
        stats.totalPnL >= 0
          ? chalk.green(`+$${stats.totalPnL.toFixed(2)}`)
          : chalk.red(`-$${Math.abs(stats.totalPnL).toFixed(2)}`);

      symbolTable.push([
        sym,
        stats.trades,
        chalk.green(stats.wins),
        chalk.red(stats.losses),
        symWinRate,
        chalk.green(`+$${stats.winPnL.toFixed(2)}`),
        chalk.red(`-$${stats.lossPnL.toFixed(2)}`),
        netPnlDisplay,
      ]);
    });

  console.log(chalk.bold('\n📈 PERFORMANCE BY SYMBOL:'));
  console.log(symbolTable.toString());

  // Daily Breakdown Table
  const dailyTable = new Table({
    head: [
      chalk.cyan('Date'),
      chalk.cyan('Trades'),
      chalk.cyan('Wins'),
      chalk.cyan('Losses'),
      chalk.cyan('Daily Win Rate %'),
      chalk.cyan('Daily PnL (USDT)'),
    ],
  });

  Object.entries(dailyStats)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([day, stats]) => {
      const dayWinRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) + '%' : '0%';
      const pnlDisplay =
        stats.pnl >= 0
          ? chalk.green(`+$${stats.pnl.toFixed(2)}`)
          : chalk.red(`-$${Math.abs(stats.pnl).toFixed(2)}`);

      dailyTable.push([day, stats.trades, chalk.green(stats.wins), chalk.red(stats.losses), dayWinRate, pnlDisplay]);
    });

  console.log(chalk.bold('\n📅 PERFORMANCE BY DAY:'));
  console.log(dailyTable.toString());

  // Summary Metrics Table
  console.log(chalk.bold.magenta('\n===================================================='));
  console.log(chalk.bold.magenta('🏆 OVERALL PERFORMANCE SUMMARY (Sep 14 - Today)'));
  console.log(chalk.bold.magenta('===================================================='));

  const summaryTable = new Table();
  summaryTable.push(
    { 'Total Closed Trades / Exits': records.length },
    { 'Winning Trades': chalk.green(`${winCount} (${winRate.toFixed(2)}%)`) },
    { 'Losing Trades': chalk.red(`${lossCount} (${((lossCount / totalClosedTrades) * 100).toFixed(2)}%)`) },
    { 'Breakeven Trades': chalk.gray(`${breakevenCount}`) },
    { 'Win Rate (Overall)': chalk.bold.yellow(`${winRate.toFixed(2)}%`) },
    { 'Win Rate (Excl. Breakeven)': chalk.bold.yellow(`${winRateExcludingBE.toFixed(2)}%`) },
    { 'Total Gross Profits': chalk.green(`+$${totalWinPnL.toFixed(2)} USDT`) },
    { 'Total Gross Losses': chalk.red(`-$${totalLossPnL.toFixed(2)} USDT`) },
    {
      'Net Realized PnL':
        totalPnL >= 0
          ? chalk.bold.green(`+$${totalPnL.toFixed(2)} USDT`)
          : chalk.bold.red(`-$${Math.abs(totalPnL).toFixed(2)} USDT`),
    },
    { 'Profit Factor': profitFactor.toFixed(2) },
    { 'Average Win': chalk.green(`+$${avgWin.toFixed(2)} USDT`) },
    { 'Average Loss': chalk.red(`-$${avgLoss.toFixed(2)} USDT`) },
    { 'Reward / Risk Ratio (Win/Loss)': rrRatio.toFixed(2) },
    { 'Largest Winning Trade': chalk.green(`+$${maxWin.pnl.toFixed(2)} (${maxWin.symbol} on ${maxWin.date})`) },
    { 'Largest Losing Trade': chalk.red(`-$${Math.abs(maxLoss.pnl).toFixed(2)} (${maxLoss.symbol} on ${maxLoss.date})`) }
  );

  console.log(summaryTable.toString());

  // Save report data as JSON
  const fullReport = {
    generatedAt: new Date().toISOString(),
    period: {
      from: new Date(sep14).toISOString(),
      to: new Date(now).toISOString(),
    },
    summary: {
      totalClosedTrades,
      winCount,
      lossCount,
      breakevenCount,
      winRate: parseFloat(winRate.toFixed(2)),
      winRateExcludingBE: parseFloat(winRateExcludingBE.toFixed(2)),
      totalPnL: parseFloat(totalPnL.toFixed(2)),
      totalGrossProfit: parseFloat(totalWinPnL.toFixed(2)),
      totalGrossLoss: parseFloat(totalLossPnL.toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      avgWin: parseFloat(avgWin.toFixed(2)),
      avgLoss: parseFloat(avgLoss.toFixed(2)),
      rewardToRisk: parseFloat(rrRatio.toFixed(2)),
      maxWin,
      maxLoss,
    },
    symbolStats,
    dailyStats,
    trades: records.map((r) => ({
      date: new Date(parseInt(r.updatedTime, 10)).toISOString(),
      symbol: r.symbol,
      side: r.side,
      qty: parseFloat(r.closedSize),
      entryPrice: parseFloat(r.avgEntryPrice),
      exitPrice: parseFloat(r.avgExitPrice),
      closedPnl: parseFloat(r.closedPnl),
      orderId: r.orderId,
      orderType: r.orderType,
      leverage: r.leverage,
    })),
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../../data/bybit_demo_pnl_report.json'),
    JSON.stringify(fullReport, null, 2)
  );
  console.log(chalk.cyan(`\n📁 Full structured report saved to data/bybit_demo_pnl_report.json\n`));
}

main().catch(console.error);

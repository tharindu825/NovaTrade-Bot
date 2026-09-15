import axios from 'axios';
import Table from 'cli-table3';
import chalk from 'chalk';
import { ActiveTrade, SignalCandidate, AIRiskEvaluation } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class NotificationService {
  /**
   * Send notification to Discord Webhook
   */
  async sendDiscordAlert(title: string, description: string, color: number = 3447003, fields: any[] = []) {
    if (!env.DISCORD_WEBHOOK_URL) return;

    try {
      await axios.post(env.DISCORD_WEBHOOK_URL, {
        embeds: [
          {
            title,
            description,
            color,
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: 'NovaTrade-Bot • Institutional AI Engine' },
          },
        ],
      });
    } catch (err: any) {
      logger.warn(`Failed to send Discord alert: ${err.message}`);
    }
  }

  /**
   * Send notification to Telegram
   */
  async sendTelegramAlert(text: string) {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

    try {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await axios.post(url, {
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'Markdown',
      });
    } catch (err: any) {
      logger.warn(`Failed to send Telegram alert: ${err.message}`);
    }
  }

  /**
   * Broadcast Trade Entry Alert
   */
  async notifyTradeEntry(trade: ActiveTrade, signal: SignalCandidate, ai?: AIRiskEvaluation) {
    const isLong = trade.direction === 'LONG';
    const directionEmoji = isLong ? '🟢 LONG' : '🔴 SHORT';
    const color = isLong ? 3066993 : 15158332; // Green or Red

    const msg = `🚀 *NovaTrade Entry Executed*\n` +
      `*Symbol:* ${trade.symbol}\n` +
      `*Direction:* ${directionEmoji}\n` +
      `*Entry Price:* $${trade.entryPrice}\n` +
      `*Position Qty:* ${trade.initialQty}\n` +
      `*Stop Loss:* $${trade.slPrice}\n` +
      `*Target 1 (50% + Breakeven):* $${trade.tp1Price}\n` +
      `*Target 2:* $${trade.tp2Price}\n` +
      `*AI Confidence:* ${ai ? `${ai.confidenceScore}% (${ai.sentiment})` : 'N/A'}\n` +
      `*AI Rationale:* ${ai?.reasoning || 'N/A'}`;

    await this.sendTelegramAlert(msg);
    await this.sendDiscordAlert(
      `🚀 Trade Entry: ${trade.symbol} ${directionEmoji}`,
      ai?.reasoning || 'Rule-based setup confirmed.',
      color,
      [
        { name: 'Entry Price', value: `$${trade.entryPrice}`, inline: true },
        { name: 'Stop Loss', value: `$${trade.slPrice}`, inline: true },
        { name: 'Target 1 (1.3R)', value: `$${trade.tp1Price}`, inline: true },
        { name: 'Target 2 (2.6R)', value: `$${trade.tp2Price}`, inline: true },
        { name: 'AI Confidence', value: `${ai?.confidenceScore || 0}%`, inline: true },
        { name: 'AI Sentiment', value: `${ai?.sentiment || 'NEUTRAL'}`, inline: true },
      ]
    );
  }

  /**
   * Broadcast TP1 Hit & Breakeven Alert
   */
  async notifyTP1Hit(trade: ActiveTrade, currentPrice: number) {
    const msg = `🎯 *TP1 Hit! Securing 50% Profit & Setting Breakeven*\n` +
      `*Symbol:* ${trade.symbol}\n` +
      `*Current Price:* $${currentPrice}\n` +
      `*Action:* 50% position closed. Stop Loss moved to Entry ($${trade.entryPrice}). Trade is now 100% RISK-FREE!`;

    await this.sendTelegramAlert(msg);
    await this.sendDiscordAlert(
      `🎯 TP1 Reached: ${trade.symbol}`,
      `Closed 50% position. Stop Loss moved to Breakeven @ $${trade.entryPrice}. Trade is now risk-free!`,
      65280
    );
  }

  /**
   * Broadcast Trade Exit Alert
   */
  async notifyTradeExit(trade: ActiveTrade, reason: string, pnl: number) {
    const isWin = pnl >= 0;
    const msg = `🏁 *Trade Closed: ${trade.symbol}*\n` +
      `*Result:* ${isWin ? '🟢 PROFIT' : '🔴 LOSS'}\n` +
      `*Reason:* ${reason}\n` +
      `*Realized PnL:* $${pnl.toFixed(2)}`;

    await this.sendTelegramAlert(msg);
    await this.sendDiscordAlert(
      `🏁 Trade Closed: ${trade.symbol} (${isWin ? 'PROFIT' : 'LOSS'})`,
      `Reason: ${reason} | Estimated PnL: $${pnl.toFixed(2)}`,
      isWin ? 3066993 : 15158332
    );
  }

  /**
   * Render visually stunning terminal table of active trades & status
   */
  printActiveTradesTable(trades: ActiveTrade[], equity: number) {
    console.log('\n' + chalk.bold.cyan('=================== ACTIVE POSITIONS & BOT STATUS ==================='));
    console.log(chalk.gray(`Account Equity: $${equity.toFixed(2)} USDT | Active Positions: ${trades.length}/${env.MAX_OPEN_POSITIONS}`));

    if (trades.length === 0) {
      console.log(chalk.italic.gray('No active positions currently open. Waiting for high-probability setups...\n'));
      return;
    }

    const table = new Table({
      head: [
        chalk.white('Symbol'),
        chalk.white('Side'),
        chalk.white('Entry'),
        chalk.white('Qty'),
        chalk.white('Stop Loss'),
        chalk.white('TP1 (50%)'),
        chalk.white('TP2 (Final)'),
        chalk.white('Status'),
      ],
      colWidths: [12, 10, 12, 12, 12, 12, 12, 22],
    });

    for (const t of trades) {
      const isLong = t.direction === 'LONG';
      const sideColor = isLong ? chalk.green('LONG') : chalk.red('SHORT');
      const statusColor = t.tp1Hit
        ? chalk.greenBright('TP1 HIT (BREAKEVEN)')
        : chalk.yellow('OPEN (INITIAL SL)');

      table.push([
        chalk.bold(t.symbol),
        sideColor,
        `$${t.entryPrice}`,
        t.currentQty.toString(),
        `$${t.slPrice}`,
        `$${t.tp1Price}`,
        `$${t.tp2Price}`,
        statusColor,
      ]);
    }

    console.log(table.toString() + '\n');
  }
}

export const notificationService = new NotificationService();

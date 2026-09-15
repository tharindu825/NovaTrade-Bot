import { bybitTradeService } from './trade.service';
import { bybitMarketService } from './market.service';
import { storageService } from '../database/storage';
import { notificationService } from '../notification/webhook.service';
import { ActiveTrade } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class PositionManagerService {
  /**
   * Check and manage all active positions (TP1 partial fill, Breakeven SL move, TP2 exit)
   */
  async manageActivePositions(): Promise<void> {
    const activeTrades = storageService.getActiveTrades();
    if (activeTrades.length === 0) return;

    logger.info(`🔍 Monitoring ${activeTrades.length} active trade(s)...`);

    for (const trade of activeTrades) {
      try {
        // Fetch current live ticker for the symbol
        const tickers = await bybitMarketService.getTickers([trade.symbol]);
        if (!tickers.length) continue;

        const currentPrice = tickers[0].lastPrice;
        const isLong = trade.direction === 'LONG';

        // Check if TP1 condition is met and has not been executed yet
        if (!trade.tp1Hit) {
          const tp1Reached = isLong ? currentPrice >= trade.tp1Price : currentPrice <= trade.tp1Price;

          if (tp1Reached) {
            logger.info(`🎯 [TP1 TARGET REACHED] ${trade.symbol} @ $${currentPrice}`);

            const closeQty = trade.initialQty * env.TP1_CLOSE_RATIO;
            const closedPartial = await bybitTradeService.closePartialPosition(
              trade.symbol,
              trade.side,
              closeQty
            );

            if (closedPartial) {
              // Move Stop Loss to Entry Price (Breakeven)
              if (env.MOVE_SL_TO_BREAKEVEN_ON_TP1) {
                await bybitTradeService.moveStopLossToBreakeven(trade.symbol, trade.entryPrice);
              }

              const remainingQty = trade.initialQty - closeQty;
              storageService.updateTrade(trade.id, {
                tp1Hit: true,
                currentQty: remainingQty,
                slPrice: trade.entryPrice, // SL now at breakeven
                status: 'TP1_HIT_BREAKEVEN',
              });

              await notificationService.notifyTP1Hit(trade, currentPrice);
            }
            continue;
          }
        }

        // Check if TP2 (Final target) is reached
        const tp2Reached = isLong ? currentPrice >= trade.tp2Price : currentPrice <= trade.tp2Price;
        if (tp2Reached) {
          logger.info(`🎉 [TP2 FINAL TARGET REACHED] ${trade.symbol} @ $${currentPrice}`);

          const closedFull = await bybitTradeService.closeFullPosition(
            trade.symbol,
            trade.side,
            trade.currentQty
          );

          if (closedFull) {
            const pnl = isLong
              ? (currentPrice - trade.entryPrice) * trade.currentQty
              : (trade.entryPrice - currentPrice) * trade.currentQty;

            storageService.updateTrade(trade.id, {
              status: 'CLOSED_TP2',
              realizedPnl: pnl,
            });

            await notificationService.notifyTradeExit(trade, 'Take Profit 2 Hit (Full Win)', pnl);
          }
          continue;
        }

        // Reconcile with Bybit exchange state: check if position is still open on exchange
        const exchangePositions = await bybitTradeService.getOpenPositions(trade.symbol);
        const activeOnExchange = exchangePositions.some(
          (p: any) => p.symbol === trade.symbol && parseFloat(p.size) > 0
        );

        if (!activeOnExchange) {
          logger.info(`ℹ️ Position for ${trade.symbol} is closed on Bybit (SL or external exit).`);
          const exitPnl = isLong
            ? (currentPrice - trade.entryPrice) * trade.currentQty
            : (trade.entryPrice - currentPrice) * trade.currentQty;

          storageService.updateTrade(trade.id, {
            status: 'CLOSED_SL',
            realizedPnl: exitPnl,
          });

          await notificationService.notifyTradeExit(
            trade,
            trade.tp1Hit ? 'Breakeven SL Hit (Risk-free exit)' : 'Stop Loss Hit',
            exitPnl
          );
        }
      } catch (err: any) {
        logger.error(`Error managing position for ${trade.symbol}: ${err.message}`);
      }
    }
  }
}

export const positionManager = new PositionManagerService();

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

        // Fetch position state from Bybit exchange
        const exchangePositions = await bybitTradeService.getOpenPositions(trade.symbol);
        const exchangePos = exchangePositions.find(
          (p: any) => p.symbol === trade.symbol && parseFloat(p.size) > 0
        );

        // Case 1: Position is closed on exchange (e.g. SL or TP2 filled)
        if (!exchangePos) {
          logger.info(`ℹ️ Position for ${trade.symbol} is closed on Bybit.`);

          await bybitTradeService.cancelOrdersForSymbol(trade.symbol);

          const exitPnl = isLong
            ? (currentPrice - trade.entryPrice) * trade.currentQty
            : (trade.entryPrice - currentPrice) * trade.currentQty;

          const isFullWin = trade.tp1Hit && (isLong ? currentPrice >= trade.tp2Price * 0.99 : currentPrice <= trade.tp2Price * 1.01);
          const finalStatus = isFullWin ? 'CLOSED_TP2' : 'CLOSED_SL';
          const reasonText = isFullWin
            ? 'TP2 Hit (Full Win)'
            : trade.tp1Hit
            ? 'Breakeven SL Hit (Risk-free exit)'
            : 'Stop Loss Hit';

          storageService.updateTrade(trade.id, {
            status: finalStatus,
            realizedPnl: exitPnl,
          });

          await notificationService.notifyTradeExit(trade, reasonText, exitPnl);
          continue;
        }

        const currentExchangeQty = parseFloat(exchangePos.size);

        // Sync check: If Bybit Position Card is missing TP (shows '--'), set it immediately!
        const hasExchangeTP = exchangePos.takeProfit && parseFloat(exchangePos.takeProfit) > 0;
        if (!hasExchangeTP) {
          const targetTP = trade.tp1Hit ? trade.tp2Price : trade.tp1Price;
          const targetSL = trade.tp1Hit ? trade.entryPrice : trade.slPrice;
          logger.info(`⚙️ Syncing missing Take Profit to Bybit Position Card for ${trade.symbol}: TP $${targetTP}`);
          await bybitTradeService.setPositionTradingStop({
            symbol: trade.symbol,
            takeProfit: targetTP,
            stopLoss: targetSL,
          });
        }

        // Case 2: Check if TP1 has been filled on Bybit (position size reduced or price hit TP1)
        if (!trade.tp1Hit) {
          const tp1PriceReached = isLong ? currentPrice >= trade.tp1Price : currentPrice <= trade.tp1Price;
          const positionReducedByTP1 = currentExchangeQty <= trade.initialQty * (1 - env.TP1_CLOSE_RATIO * 0.8);

          if (tp1PriceReached || positionReducedByTP1) {
            logger.info(`🎯 [TP1 TARGET REACHED] ${trade.symbol} @ $${currentPrice} (Current Qty: ${currentExchangeQty})`);

            // Execute 50% partial market close if not already reduced
            if (!positionReducedByTP1) {
              const closeQty = trade.initialQty * env.TP1_CLOSE_RATIO;
              await bybitTradeService.closePartialPosition(trade.symbol, trade.side, closeQty);
            }

            // Move Stop Loss to Entry Price (Breakeven) and update Take Profit to TP2 on Bybit Position Card
            if (env.MOVE_SL_TO_BREAKEVEN_ON_TP1) {
              await bybitTradeService.updateStopLossToBreakevenAndSetTP2(
                trade.symbol,
                trade.entryPrice,
                trade.tp2Price
              );
            }

            const remainingQty = currentExchangeQty > 0 ? currentExchangeQty : trade.initialQty * (1 - env.TP1_CLOSE_RATIO);

            storageService.updateTrade(trade.id, {
              tp1Hit: true,
              currentQty: remainingQty,
              slPrice: trade.entryPrice, // SL now at breakeven
              status: 'TP1_HIT_BREAKEVEN',
            });

            await notificationService.notifyTP1Hit(trade, currentPrice);
            continue;
          }
        }

        // Case 3: Check if TP2 is reached
        const tp2PriceReached = isLong ? currentPrice >= trade.tp2Price : currentPrice <= trade.tp2Price;
        if (tp2PriceReached && currentExchangeQty > 0) {
          logger.info(`🎉 [TP2 FINAL TARGET REACHED] ${trade.symbol} @ $${currentPrice}`);

          const closedFull = await bybitTradeService.closeFullPosition(
            trade.symbol,
            trade.side,
            currentExchangeQty
          );

          if (closedFull) {
            await bybitTradeService.cancelOrdersForSymbol(trade.symbol);

            const pnl = isLong
              ? (currentPrice - trade.entryPrice) * currentExchangeQty
              : (trade.entryPrice - currentPrice) * currentExchangeQty;

            storageService.updateTrade(trade.id, {
              status: 'CLOSED_TP2',
              realizedPnl: pnl,
            });

            await notificationService.notifyTradeExit(trade, 'Take Profit 2 Hit (Full Win)', pnl);
          }
        }
      } catch (err: any) {
        logger.error(`Error managing position for ${trade.symbol}: ${err.message}`);
      }
    }
  }
}

export const positionManager = new PositionManagerService();

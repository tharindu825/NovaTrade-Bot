import { bybitClient } from './client';
import { AccountBalance, ActiveTrade, SignalCandidate, TradeDirection, TradeSide } from '../../types';
import { logger } from '../logger';
import { env } from '../../config/env';
import { bybitMarketService } from './market.service';

export class BybitTradeService {
  /**
   * Fetch USDT Unified/Contract account balance
   */
  async getAccountBalance(): Promise<AccountBalance | null> {
    try {
      // Try UNIFIED account type first
      const res = await bybitClient.getWalletBalance({
        accountType: 'UNIFIED',
        coin: 'USDT',
      });

      if (res.retCode === 0 && res.result?.list?.length) {
        const acc = res.result.list[0];
        const coinInfo = acc.coin?.find((c: any) => c.coin === 'USDT');
        const totalEquity = parseFloat(acc.totalEquity || coinInfo?.equity || '0');
        const availableBalance = parseFloat(
          acc.totalAvailableBalance || coinInfo?.availableToWithdraw || coinInfo?.walletBalance || '0'
        );

        return {
          totalEquity: totalEquity > 0 ? totalEquity : availableBalance,
          availableBalance,
          currency: 'USDT',
        };
      }

      // Fallback to CONTRACT account type for classic accounts
      const fallbackRes = await bybitClient.getWalletBalance({
        accountType: 'CONTRACT',
        coin: 'USDT',
      });

      if (fallbackRes.retCode === 0 && fallbackRes.result?.list?.length) {
        const acc = fallbackRes.result.list[0];
        const coinInfo = acc.coin?.find((c: any) => c.coin === 'USDT');
        return {
          totalEquity: parseFloat(coinInfo?.equity || coinInfo?.walletBalance || '0'),
          availableBalance: parseFloat(coinInfo?.availableToWithdraw || coinInfo?.walletBalance || '0'),
          currency: 'USDT',
        };
      }

      logger.warn(`Could not retrieve USDT balance: ${res.retMsg}`);
      return null;
    } catch (err: any) {
      logger.error(`Error fetching wallet balance: ${err.message}`);
      return null;
    }
  }

  /**
   * Set leverage for a specific symbol
   */
  async setLeverage(symbol: string, leverage: number = env.LEVERAGE): Promise<boolean> {
    try {
      const levStr = leverage.toString();
      const res = await bybitClient.setLeverage({
        category: 'linear',
        symbol,
        buyLeverage: levStr,
        sellLeverage: levStr,
      });

      if (res.retCode === 0 || res.retCode === 110043) {
        // 110043 = Leverage not modified / already set
        return true;
      }
      logger.warn(`Set leverage result for ${symbol}: ${res.retMsg} (Code: ${res.retCode})`);
      return false;
    } catch (err: any) {
      logger.error(`Error setting leverage for ${symbol}: ${err.message}`);
      return false;
    }
  }

  /**
   * Format quantity and price to comply with instrument lotSize / tickSize
   */
  async formatOrderParams(symbol: string, rawQty: number, rawPrice?: number): Promise<{
    formattedQty: string;
    formattedPrice?: string;
  }> {
    const info = await bybitMarketService.getInstrumentInfo(symbol);
    const qtyStep = info?.qtyStep || 0.001;
    const tickSize = info?.tickSize || 0.01;

    // Calculate precision decimals
    const stepDecimals = Math.max(0, (qtyStep.toString().split('.')[1] || '').length);
    const tickDecimals = Math.max(0, (tickSize.toString().split('.')[1] || '').length);

    // Round qty down to step
    const steppedQty = Math.floor(rawQty / qtyStep) * qtyStep;
    const formattedQty = steppedQty.toFixed(stepDecimals);

    let formattedPrice: string | undefined;
    if (rawPrice !== undefined) {
      const steppedPrice = Math.round(rawPrice / tickSize) * tickSize;
      formattedPrice = steppedPrice.toFixed(tickDecimals);
    }

    return { formattedQty, formattedPrice };
  }

  /**
   * Execute Market Entry Order and attach Stop Loss and TP1/TP2
   */
  async executeSignal(
    signal: SignalCandidate,
    calculatedQty: number
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      await this.setLeverage(signal.symbol, env.LEVERAGE);

      const side: TradeSide = signal.direction === 'LONG' ? 'Buy' : 'Sell';
      const { formattedQty, formattedPrice: formattedSL } = await this.formatOrderParams(
        signal.symbol,
        calculatedQty,
        signal.slPrice
      );
      const { formattedPrice: formattedTP1 } = await this.formatOrderParams(
        signal.symbol,
        calculatedQty,
        signal.tp1Price
      );

      logger.info(
        `🚀 Submitting Bybit Market Entry: ${side} ${formattedQty} ${signal.symbol} | SL: ${formattedSL} | TP1: ${formattedTP1}`
      );

      const orderRes = await bybitClient.submitOrder({
        category: 'linear',
        symbol: signal.symbol,
        side,
        orderType: 'Market',
        qty: formattedQty,
        stopLoss: formattedSL,
        slTriggerBy: 'LastPrice',
        tpslMode: 'Full',
        positionIdx: 0, // One-Way Mode
      });

      if (orderRes.retCode !== 0) {
        logger.error(`Failed to submit order for ${signal.symbol}: ${orderRes.retMsg} (Code: ${orderRes.retCode})`);
        return { success: false, error: orderRes.retMsg };
      }

      const orderId = orderRes.result?.orderId;
      logger.info(`✅ Order Placed Successfully! OrderId: ${orderId}`);
      return { success: true, orderId };
    } catch (err: any) {
      logger.error(`Error executing signal for ${signal.symbol}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch open positions from Bybit
   */
  async getOpenPositions(symbol?: string): Promise<any[]> {
    try {
      const res = await bybitClient.getPositionInfo({
        category: 'linear',
        symbol: symbol || undefined,
        settleCoin: 'USDT',
      });

      if (res.retCode !== 0) {
        logger.error(`Failed to fetch positions: ${res.retMsg}`);
        return [];
      }

      const positions = (res.result?.list || []).filter(
        (p: any) => parseFloat(p.size || '0') > 0
      );

      return positions;
    } catch (err: any) {
      logger.error(`Error fetching positions: ${err.message}`);
      return [];
    }
  }

  /**
   * Partial close position (50% on TP1)
   */
  async closePartialPosition(
    symbol: string,
    side: TradeSide,
    closeQty: number
  ): Promise<boolean> {
    try {
      // To close LONG ('Buy'), we place 'Sell' Market order. To close SHORT ('Sell'), place 'Buy' Market order.
      const closeSide: TradeSide = side === 'Buy' ? 'Sell' : 'Buy';
      const { formattedQty } = await this.formatOrderParams(symbol, closeQty);

      logger.info(`🎯 Executing TP1 Partial Close: ${closeSide} ${formattedQty} ${symbol}`);

      const res = await bybitClient.submitOrder({
        category: 'linear',
        symbol,
        side: closeSide,
        orderType: 'Market',
        qty: formattedQty,
        reduceOnly: true,
        positionIdx: 0,
      });

      if (res.retCode !== 0) {
        logger.error(`TP1 Partial close failed for ${symbol}: ${res.retMsg}`);
        return false;
      }

      logger.info(`✅ TP1 Partial Close Filled: ${symbol} (${formattedQty})`);
      return true;
    } catch (err: any) {
      logger.error(`Error in closePartialPosition for ${symbol}: ${err.message}`);
      return false;
    }
  }

  /**
   * Move Stop Loss to Breakeven (Entry Price)
   */
  async moveStopLossToBreakeven(
    symbol: string,
    entryPrice: number
  ): Promise<boolean> {
    try {
      const { formattedPrice } = await this.formatOrderParams(symbol, 1, entryPrice);

      logger.info(`🛡️ Moving Stop Loss to Breakeven for ${symbol} @ ${formattedPrice}`);

      const res = await bybitClient.setTradingStop({
        category: 'linear',
        symbol,
        stopLoss: formattedPrice,
        slTriggerBy: 'LastPrice',
        tpslMode: 'Full',
        positionIdx: 0,
      });

      if (res.retCode !== 0) {
        logger.error(`Failed to move SL to breakeven for ${symbol}: ${res.retMsg}`);
        return false;
      }

      logger.info(`🔒 Breakeven SL Active for ${symbol} @ ${formattedPrice}! Risk is now 0.`);
      return true;
    } catch (err: any) {
      logger.error(`Error moving SL to breakeven for ${symbol}: ${err.message}`);
      return false;
    }
  }

  /**
   * Close Entire Position
   */
  async closeFullPosition(symbol: string, side: TradeSide, qty: number): Promise<boolean> {
    try {
      const closeSide: TradeSide = side === 'Buy' ? 'Sell' : 'Buy';
      const { formattedQty } = await this.formatOrderParams(symbol, qty);

      logger.info(`🚪 Closing Full Position: ${closeSide} ${formattedQty} ${symbol}`);

      const res = await bybitClient.submitOrder({
        category: 'linear',
        symbol,
        side: closeSide,
        orderType: 'Market',
        qty: formattedQty,
        reduceOnly: true,
        positionIdx: 0,
      });

      return res.retCode === 0;
    } catch (err: any) {
      logger.error(`Error closing full position for ${symbol}: ${err.message}`);
      return false;
    }
  }
}

export const bybitTradeService = new BybitTradeService();

import { bybitClient } from './client';
import { Candle, MarketTicker } from '../../types';
import { logger } from '../logger';
import { env } from '../../config/env';

export class BybitMarketService {
  /**
   * Fetch 24h tickers for linear USDT perpetual pairs
   */
  async getTickers(symbols?: string[]): Promise<MarketTicker[]> {
    try {
      const res = await bybitClient.getTickers({
        category: 'linear',
      });

      if (res.retCode !== 0) {
        logger.error(`Failed to fetch tickers: ${res.retMsg}`);
        return [];
      }

      const list = res.result?.list || [];
      const tickers: MarketTicker[] = list
        .filter((item: any) => {
          if (!item.symbol.endsWith('USDT')) return false;
          if (symbols && symbols.length > 0 && !symbols.includes(item.symbol)) {
            return false;
          }
          return true;
        })
        .map((item: any) => {
          const lastPrice = parseFloat(item.lastPrice || '0');
          const bid1Price = parseFloat(item.bid1Price || '0');
          const ask1Price = parseFloat(item.ask1Price || '0');
          const spread = ask1Price > 0 ? ((ask1Price - bid1Price) / ask1Price) * 100 : 0;
          const volume24hUsdt = parseFloat(item.turnover24h || '0');
          const price24hPcnt = parseFloat(item.price24hPcnt || '0') * 100;
          const fundingRate = parseFloat(item.fundingRate || '0');

          return {
            symbol: item.symbol,
            lastPrice,
            bid1Price,
            ask1Price,
            spreadPercent: spread,
            volume24hUsdt,
            price24hPcnt,
            fundingRate,
            openInterest: item.openInterest ? parseFloat(item.openInterest) : undefined,
          };
        });

      return tickers;
    } catch (err: any) {
      logger.error(`Error in getTickers: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch historical candles for a symbol
   * Bybit interval: 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, M, W
   */
  async getKlines(symbol: string, interval: string = '15', limit: number = 200): Promise<Candle[]> {
    try {
      // Bybit Kline API requires interval string as '15', '60', '240', 'D'
      const res = await bybitClient.getKline({
        category: 'linear',
        symbol,
        interval: interval as any,
        limit,
      });

      if (res.retCode !== 0) {
        logger.error(`Failed to fetch klines for ${symbol} (${interval}): ${res.retMsg}`);
        return [];
      }

      const rawList = res.result?.list || [];
      // Bybit returns klines in reverse chronological order [latest, ..., oldest]
      // We reverse so array is [oldest, ..., latest] for standard technical analysis
      const candles: Candle[] = rawList
        .map((k: any) => ({
          timestamp: parseInt(k[0], 10),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
        .reverse();

      return candles;
    } catch (err: any) {
      logger.error(`Error fetching klines for ${symbol}: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch instrument specifications (lot size filters, tick size)
   */
  async getInstrumentInfo(symbol: string): Promise<{
    minQty: number;
    maxQty: number;
    qtyStep: number;
    tickSize: number;
    minPrice: number;
  } | null> {
    try {
      const res = await bybitClient.getInstrumentsInfo({
        category: 'linear',
        symbol,
      });

      if (res.retCode !== 0 || !res.result?.list?.length) {
        return null;
      }

      const info = res.result.list[0];
      const lotSize = info.lotSizeFilter || {};
      const priceFilter = info.priceFilter || {};

      return {
        minQty: parseFloat(lotSize.minOrderQty || '0.001'),
        maxQty: parseFloat(lotSize.maxOrderQty || '1000000'),
        qtyStep: parseFloat(lotSize.qtyStep || '0.001'),
        tickSize: parseFloat(priceFilter.tickSize || '0.01'),
        minPrice: parseFloat(priceFilter.minPrice || '0.01'),
      };
    } catch (err: any) {
      logger.error(`Error fetching instrument info for ${symbol}: ${err.message}`);
      return null;
    }
  }
}

export const bybitMarketService = new BybitMarketService();

import axios from 'axios';
import { FearGreedData } from '../../types';
import { logger } from '../logger';
import { env } from '../../config/env';

export class FearGreedService {
  private cachedData: FearGreedData | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes cache

  /**
   * Fetch latest crypto Fear & Greed index
   */
  async getFearGreedIndex(): Promise<FearGreedData | null> {
    if (!env.ENABLE_FEAR_GREED_INDEX) {
      return null;
    }

    const now = Date.now();
    if (this.cachedData && now - this.lastFetchTime < this.CACHE_DURATION_MS) {
      return this.cachedData;
    }

    try {
      const response = await axios.get('https://api.alternative.me/fng/?limit=1', {
        timeout: 10000,
      });

      if (response.data && response.data.data && response.data.data.length > 0) {
        const item = response.data.data[0];
        this.cachedData = {
          value: parseInt(item.value, 10),
          classification: item.value_classification,
          timestamp: parseInt(item.timestamp, 10) * 1000,
        };
        this.lastFetchTime = now;
        logger.info(
          `📊 Fear & Greed Index: ${this.cachedData.value}/100 (${this.cachedData.classification})`
        );
        return this.cachedData;
      }

      return null;
    } catch (err: any) {
      logger.warn(`Could not fetch Fear & Greed index: ${err.message}`);
      return this.cachedData; // return stale cache if available
    }
  }
}

export const fearGreedService = new FearGreedService();

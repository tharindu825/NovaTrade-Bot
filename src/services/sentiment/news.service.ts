import Parser from 'rss-parser';
import axios from 'axios';
import { NewsArticle } from '../../types';
import { logger } from '../logger';
import { env } from '../../config/env';

export class NewsSentimentService {
  private parser: Parser;
  private cachedArticles: NewsArticle[] = [];
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION_MS = (env.NEWS_FETCH_INTERVAL_MINUTES || 15) * 60 * 1000;

  constructor() {
    this.parser = new Parser({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 15000,
    });
  }

  /**
   * Fetch RSS news from configured feeds
   */
  async fetchRssNews(): Promise<NewsArticle[]> {
    if (!env.ENABLE_RSS_NEWS || !env.RSS_FEED_URLS.length) {
      return [];
    }

    const allArticles: NewsArticle[] = [];

    for (const feedUrl of env.RSS_FEED_URLS) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        const sourceName = feed.title || new URL(feedUrl).hostname;

        for (const item of (feed.items || []).slice(0, 8)) {
          if (item.title) {
            allArticles.push({
              title: item.title.trim(),
              source: sourceName,
              link: item.link || '',
              pubDate: item.pubDate || new Date().toISOString(),
              contentSnippet: item.contentSnippet ? item.contentSnippet.slice(0, 150) : '',
            });
          }
        }
      } catch (err: any) {
        logger.warn(`Could not parse RSS feed from ${feedUrl}: ${err.message}`);
      }
    }

    return allArticles;
  }

  /**
   * Fetch news from CryptoPanic API if API key is provided
   */
  async fetchCryptoPanicNews(): Promise<NewsArticle[]> {
    if (!env.CRYPTOPANIC_API_KEY) {
      return [];
    }

    try {
      const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${env.CRYPTOPANIC_API_KEY}&public=true&filter=hot`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results.slice(0, 10).map((post: any) => ({
          title: post.title,
          source: post.source?.domain || 'CryptoPanic',
          link: post.url,
          pubDate: post.published_at,
          sentimentTag: post.votes?.bullish > post.votes?.bearish ? 'bullish' : post.votes?.bearish > post.votes?.bullish ? 'bearish' : 'neutral',
        }));
      }

      return [];
    } catch (err: any) {
      logger.warn(`Could not fetch CryptoPanic news: ${err.message}`);
      return [];
    }
  }

  /**
   * Retrieve aggregated news with caching
   */
  async getLatestNews(): Promise<NewsArticle[]> {
    const now = Date.now();
    if (this.cachedArticles.length > 0 && now - this.lastFetchTime < this.CACHE_DURATION_MS) {
      return this.cachedArticles;
    }

    logger.info('📰 Ingesting latest crypto news & market headlines...');

    const [rssArticles, cryptoPanicArticles] = await Promise.all([
      this.fetchRssNews(),
      this.fetchCryptoPanicNews(),
    ]);

    const combined = [...cryptoPanicArticles, ...rssArticles];

    // Deduplicate by title similarity
    const seenTitles = new Set<string>();
    const uniqueArticles = combined.filter((art) => {
      const normalized = art.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenTitles.has(normalized)) return false;
      seenTitles.add(normalized);
      return true;
    });

    this.cachedArticles = uniqueArticles.slice(0, 15);
    this.lastFetchTime = now;

    logger.info(`✅ Aggregated ${this.cachedArticles.length} fresh news headlines.`);
    return this.cachedArticles;
  }

  /**
   * Format headlines into a concise text block for OpenRouter AI prompt
   */
  formatNewsSummaryForAI(articles: NewsArticle[], symbol: string): string {
    if (!articles.length) {
      return 'No breaking news detected.';
    }

    // Prioritize symbol-specific news first
    const baseCoin = symbol.replace(/USDT|USDC|USD/g, '').toUpperCase();
    const relevantArticles = articles.filter((a) =>
      a.title.toUpperCase().includes(baseCoin)
    );

    const generalArticles = articles.filter(
      (a) => !a.title.toUpperCase().includes(baseCoin)
    );

    const formattedList = [...relevantArticles, ...generalArticles]
      .slice(0, 10)
      .map((a, idx) => `${idx + 1}. [${a.source}] ${a.title}`)
      .join('\n');

    return formattedList;
  }
}

export const newsSentimentService = new NewsSentimentService();

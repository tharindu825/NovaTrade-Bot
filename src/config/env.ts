import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // 1. Bybit V5 API
  BYBIT_API_KEY: z.string().default(''),
  BYBIT_API_SECRET: z.string().default(''),
  BYBIT_DEMO_TRADING: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  BYBIT_RECV_WINDOW: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  BYBIT_ENABLE_TIME_SYNC: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),

  // 2. OpenRouter AI
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_PRIMARY_MODEL: z
    .string()
    .default('meta-llama/llama-3.3-70b-instruct:free'),
  OPENROUTER_FALLBACK_MODEL: z
    .string()
    .default('google/gemini-2.0-flash-001'),
  OPENROUTER_MIN_CONFIDENCE: z
    .string()
    .default('75')
    .transform((val) => parseFloat(val)),
  OPENROUTER_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform((val) => parseInt(val, 10)),
  AI_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),

  // 3. Trading & Strategy Parameters
  COIN_SELECTION_MODE: z.enum(['DYNAMIC', 'STATIC']).default('DYNAMIC'),
  DYNAMIC_TOP_COINS_COUNT: z
    .string()
    .default('15')
    .transform((val) => parseInt(val, 10)),
  DYNAMIC_MIN_24H_VOLUME_USDT: z
    .string()
    .default('20000000')
    .transform((val) => parseFloat(val)),
  DYNAMIC_MAX_SPREAD_PERCENT: z
    .string()
    .default('0.06')
    .transform((val) => parseFloat(val)),
  DYNAMIC_MIN_ATR_PERCENT: z
    .string()
    .default('1.2')
    .transform((val) => parseFloat(val)),
  DYNAMIC_MAX_ATR_PERCENT: z
    .string()
    .default('7.5')
    .transform((val) => parseFloat(val)),
  DYNAMIC_MIN_RVOL: z
    .string()
    .default('1.1')
    .transform((val) => parseFloat(val)),
  TRADING_PAIRS: z
    .string()
    .default('BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,AVAXUSDT,LINKUSDT,NEARUSDT,SUIUSDT,ADAUSDT')
    .transform((val) =>
      val
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter((p) => p.length > 0)
    ),
  SCAN_INTERVAL_MINUTES: z
    .string()
    .default('15')
    .transform((val) => parseInt(val, 10)),
  TRIGGER_TIMEFRAME: z.string().default('15'),
  TREND_TIMEFRAME: z.string().default('60'),
  LEVERAGE: z
    .string()
    .default('5')
    .transform((val) => parseInt(val, 10)),
  POSITION_RISK_PERCENT: z
    .string()
    .default('1.5')
    .transform((val) => parseFloat(val)),
  MAX_OPEN_POSITIONS: z
    .string()
    .default('3')
    .transform((val) => parseInt(val, 10)),
  MIN_24H_VOLUME_USDT: z
    .string()
    .default('10000000')
    .transform((val) => parseFloat(val)),
  MAX_SPREAD_PERCENT: z
    .string()
    .default('0.08')
    .transform((val) => parseFloat(val)),

  // 4. Take Profit & Stop Loss Automation
  SL_ATR_MULTIPLIER: z
    .string()
    .default('1.5')
    .transform((val) => parseFloat(val)),
  TP1_RR_RATIO: z
    .string()
    .default('1.3')
    .transform((val) => parseFloat(val)),
  TP2_RR_RATIO: z
    .string()
    .default('2.6')
    .transform((val) => parseFloat(val)),
  TP1_CLOSE_RATIO: z
    .string()
    .default('0.5')
    .transform((val) => parseFloat(val)),
  MOVE_SL_TO_BREAKEVEN_ON_TP1: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),

  // 5. News & Macro Sentiment
  NEWS_FETCH_INTERVAL_MINUTES: z
    .string()
    .default('15')
    .transform((val) => parseInt(val, 10)),
  ENABLE_RSS_NEWS: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),
  RSS_FEED_URLS: z
    .string()
    .default('https://cointelegraph.com/rss,https://www.coindesk.com/arc/outboundfeeds/rss/')
    .transform((val) =>
      val
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
    ),
  CRYPTOPANIC_API_KEY: z.string().default(''),
  ENABLE_FEAR_GREED_INDEX: z
    .string()
    .default('true')
    .transform((val) => val.toLowerCase() === 'true'),

  // 6. Notifications & Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STORAGE_FILE_PATH: z.string().default('./data/trades.json'),
  DISCORD_WEBHOOK_URL: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHAT_ID: z.string().default(''),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration in .env');
  }
  return result.data;
}

export const env = loadEnv();

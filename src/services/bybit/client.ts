import { RestClientV5 } from 'bybit-api';
import { env } from '../../config/env';
import { logger } from '../logger';

export const bybitClient = new RestClientV5({
  key: env.BYBIT_API_KEY || undefined,
  secret: env.BYBIT_API_SECRET || undefined,
  demoTrading: env.BYBIT_DEMO_TRADING,
  recv_window: env.BYBIT_RECV_WINDOW,
  enable_time_sync: env.BYBIT_ENABLE_TIME_SYNC,
});

logger.info(
  `Bybit V5 Client initialized [Demo Mode: ${env.BYBIT_DEMO_TRADING ? 'ON (api-demo.bybit.com)' : 'LIVE'}]`
);

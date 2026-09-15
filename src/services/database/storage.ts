import fs from 'fs';
import path from 'path';
import { ActiveTrade } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

interface DatabaseSchema {
  activeTrades: ActiveTrade[];
  historyTrades: ActiveTrade[];
  lastUpdated: number;
}

export class StorageService {
  private filePath: string;
  private data: DatabaseSchema;

  constructor() {
    this.filePath = path.resolve(process.cwd(), env.STORAGE_FILE_PATH);
    this.data = { activeTrades: [], historyTrades: [], lastUpdated: Date.now() };
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.persist();
      }
    } catch (err: any) {
      logger.error(`Error initializing storage at ${this.filePath}: ${err.message}`);
    }
  }

  private persist() {
    try {
      this.data.lastUpdated = Date.now();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err: any) {
      logger.error(`Failed to persist storage to ${this.filePath}: ${err.message}`);
    }
  }

  saveTrade(trade: ActiveTrade) {
    const existingIdx = this.data.activeTrades.findIndex((t) => t.id === trade.id);
    if (existingIdx >= 0) {
      this.data.activeTrades[existingIdx] = trade;
    } else {
      this.data.activeTrades.push(trade);
    }
    this.persist();
  }

  updateTrade(tradeId: string, updates: Partial<ActiveTrade>): ActiveTrade | null {
    const trade = this.data.activeTrades.find((t) => t.id === tradeId);
    if (!trade) return null;

    Object.assign(trade, updates, { updatedAt: Date.now() });

    // If trade reached terminal state, move to history
    if (['CLOSED_TP2', 'CLOSED_SL', 'CANCELLED', 'CLOSED_MANUAL'].includes(trade.status)) {
      this.data.activeTrades = this.data.activeTrades.filter((t) => t.id !== tradeId);
      this.data.historyTrades.push(trade);
    }

    this.persist();
    return trade;
  }

  getActiveTrades(): ActiveTrade[] {
    return this.data.activeTrades;
  }

  getClosedTrades(): ActiveTrade[] {
    return this.data.historyTrades;
  }

  getTradeById(tradeId: string): ActiveTrade | undefined {
    return (
      this.data.activeTrades.find((t) => t.id === tradeId) ||
      this.data.historyTrades.find((t) => t.id === tradeId)
    );
  }
}

export const storageService = new StorageService();

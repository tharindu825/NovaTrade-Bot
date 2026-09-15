import { SignalCandidate, AIRiskEvaluation } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class PositionSizerService {
  /**
   * Calculate exact position size based on account equity, stop loss distance, and AI risk factor
   */
  calculatePositionSize(params: {
    totalEquity: number;
    signal: SignalCandidate;
    aiEvaluation?: AIRiskEvaluation;
  }): {
    quantity: number;
    riskAmountUsdt: number;
    notionalValueUsdt: number;
    leverageUsed: number;
  } {
    const { totalEquity, signal, aiEvaluation } = params;

    // Base risk percentage from .env (e.g. 1.5%)
    const baseRiskPercent = env.POSITION_RISK_PERCENT;
    const aiMultiplier = aiEvaluation?.riskAdjustmentFactor ?? 1.0;
    const effectiveRiskPercent = baseRiskPercent * aiMultiplier;

    // Total USDT risked on this trade if SL hits
    const riskAmountUsdt = totalEquity * (effectiveRiskPercent / 100);

    const slDistance = Math.abs(signal.entryPrice - signal.slPrice);
    if (slDistance <= 0) {
      logger.warn(`Invalid SL distance for ${signal.symbol}: ${slDistance}`);
      return { quantity: 0, riskAmountUsdt: 0, notionalValueUsdt: 0, leverageUsed: 0 };
    }

    // Position quantity = Risk Amount / SL Distance per unit
    let rawQty = riskAmountUsdt / slDistance;

    // Safety checks against max allowed account leverage
    let notionalValue = rawQty * signal.entryPrice;
    const maxAllowedNotional = totalEquity * env.LEVERAGE * 0.95; // 95% buffer to avoid margin calls

    if (notionalValue > maxAllowedNotional) {
      logger.warn(
        `Position notional $${notionalValue.toFixed(2)} exceeds max leverage limit $${maxAllowedNotional.toFixed(2)}. Capping size.`
      );
      rawQty = maxAllowedNotional / signal.entryPrice;
      notionalValue = rawQty * signal.entryPrice;
    }

    const leverageUsed = notionalValue / totalEquity;

    logger.info(
      `⚖️ Position Sizing: Risk $${riskAmountUsdt.toFixed(2)} (${effectiveRiskPercent.toFixed(2)}%) | Qty: ${rawQty.toFixed(4)} | Notional: $${notionalValue.toFixed(2)} | Lev: ${leverageUsed.toFixed(1)}x`
    );

    return {
      quantity: rawQty,
      riskAmountUsdt,
      notionalValueUsdt: notionalValue,
      leverageUsed,
    };
  }
}

export const positionSizer = new PositionSizerService();

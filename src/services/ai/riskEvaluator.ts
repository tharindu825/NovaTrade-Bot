import { openRouterClient } from './openrouter.client';
import { buildRiskEvaluationPrompt } from './prompts';
import { newsSentimentService } from '../sentiment/news.service';
import { fearGreedService } from '../sentiment/fearGreed.service';
import { SignalCandidate, TechnicalIndicators, AIRiskEvaluation } from '../../types';
import { env } from '../../config/env';
import { logger } from '../logger';

export class AIRiskEvaluatorService {
  /**
   * Run full AI risk and sentiment evaluation on a proposed trade signal
   */
  async evaluateTrade(
    signal: SignalCandidate,
    indicators: TechnicalIndicators,
    fundingRate: number = 0
  ): Promise<AIRiskEvaluation> {
    if (!env.AI_ENABLED || !env.OPENROUTER_API_KEY) {
      logger.info('ℹ️ AI evaluation skipped (disabled or no OpenRouter API key provided). Approving on technicals.');
      return {
        approved: true,
        verdict: 'APPROVE',
        confidenceScore: 80,
        sentiment: signal.direction === 'LONG' ? 'BULLISH' : 'BEARISH',
        riskAdjustmentFactor: 1.0,
        reasoning: 'Rule-based setup approved without AI filter.',
        warnings: [],
        modelUsed: 'rule-based-baseline',
      };
    }

    try {
      // Gather latest market news and Fear & Greed index
      const [articles, fearGreed] = await Promise.all([
        newsSentimentService.getLatestNews(),
        fearGreedService.getFearGreedIndex(),
      ]);

      const newsSummary = newsSentimentService.formatNewsSummaryForAI(articles, signal.symbol);

      const { systemPrompt, userPrompt } = buildRiskEvaluationPrompt({
        signal,
        indicators,
        fearGreed,
        fundingRate,
        newsSummary,
      });

      const result = await openRouterClient.getRiskEvaluation(systemPrompt, userPrompt);

      if (!result) {
        logger.warn('⚠️ AI Evaluation unavailable. Falling back to cautious baseline.');
        return {
          approved: true,
          verdict: 'REDUCE_SIZE',
          confidenceScore: 70,
          sentiment: 'NEUTRAL',
          riskAdjustmentFactor: 0.5,
          reasoning: 'AI service unreachable; trade approved with reduced risk multiplier.',
          warnings: ['AI Fallback Active'],
          modelUsed: 'offline-fallback',
        };
      }

      const { evaluation, modelUsed } = result;

      // Determine final approval based on AI verdict and min confidence threshold
      const meetsConfidence = evaluation.confidenceScore >= env.OPENROUTER_MIN_CONFIDENCE;
      const isApproved = evaluation.approved && meetsConfidence && evaluation.verdict !== 'REJECT';

      return {
        approved: isApproved,
        verdict: evaluation.verdict,
        confidenceScore: evaluation.confidenceScore,
        sentiment: evaluation.sentiment,
        riskAdjustmentFactor: evaluation.riskAdjustmentFactor || 1.0,
        reasoning: evaluation.reasoning,
        warnings: evaluation.warnings || [],
        modelUsed,
      };
    } catch (err: any) {
      logger.error(`Error in AIRiskEvaluator: ${err.message}`);
      return {
        approved: false,
        verdict: 'REJECT',
        confidenceScore: 0,
        sentiment: 'NEUTRAL',
        riskAdjustmentFactor: 0.5,
        reasoning: `AI evaluation error: ${err.message}`,
        warnings: ['Error in AI pipeline'],
        modelUsed: 'error',
      };
    }
  }
}

export const aiRiskEvaluator = new AIRiskEvaluatorService();

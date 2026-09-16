import axios from 'axios';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../logger';

// Zod Schema to strictly validate the OpenRouter response
export const aiEvaluationResponseSchema = z.object({
  approved: z.boolean(),
  verdict: z.enum(['APPROVE', 'REJECT', 'REDUCE_SIZE']),
  confidenceScore: z.number().min(0).max(100),
  sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
  riskAdjustmentFactor: z.number().min(0.1).max(1.0).default(1.0),
  reasoning: z.string(),
  warnings: z.array(z.string()).default([]),
});

export type AIEvaluationParsed = z.infer<typeof aiEvaluationResponseSchema>;

export class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = env.OPENROUTER_BASE_URL;
  }

  /**
   * Send a chat completion request to OpenRouter with automatic fallback
   */
  async getRiskEvaluation(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ evaluation: AIEvaluationParsed; modelUsed: string } | null> {
    if (!this.apiKey) {
      logger.warn('⚠️ OPENROUTER_API_KEY is not set. Skipping AI risk evaluation.');
      return null;
    }

    const modelsToTry = [
      env.OPENROUTER_PRIMARY_MODEL,
      env.OPENROUTER_FALLBACK_MODEL,
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
      'z-ai/glm-5.2:free',
      'inclusionai/ling-3.0-flash-fin:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    ].filter(Boolean);

    for (const model of modelsToTry) {
      try {
        logger.info(`🤖 Querying OpenRouter AI model: ${model}...`);

        const response = await axios.post(
          `${this.baseUrl}/chat/completions`,
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1, // Low temperature for deterministic quantitative decisions
            max_tokens: 600,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://github.com/tharindu825/NovaTrade-Bot',
              'X-Title': 'NovaTrade Bot',
            },
            timeout: env.OPENROUTER_TIMEOUT_MS,
          }
        );

        const rawContent = response.data?.choices?.[0]?.message?.content;
        if (!rawContent) {
          throw new Error('Empty response content from OpenRouter');
        }

        // Clean possible markdown code fences (e.g. ```json ... ```)
        const cleanedJson = rawContent
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();

        const parsed = JSON.parse(cleanedJson);
        const validated = aiEvaluationResponseSchema.parse(parsed);

        logger.info(
          `🧠 AI Verdict: ${validated.verdict} | Confidence: ${validated.confidenceScore}% | Sentiment: ${validated.sentiment} [Model: ${model}]`
        );

        return { evaluation: validated, modelUsed: model };
      } catch (err: any) {
        logger.warn(`Failed with OpenRouter model ${model}: ${err.message}. Trying next fallback...`);
      }
    }

    logger.error('❌ All OpenRouter models failed to respond.');
    return null;
  }
}

export const openRouterClient = new OpenRouterClient();

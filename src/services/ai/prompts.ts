import { SignalCandidate, TechnicalIndicators, FearGreedData, NewsArticle } from '../../types';

export function buildRiskEvaluationPrompt(params: {
  signal: SignalCandidate;
  indicators: TechnicalIndicators;
  fearGreed: FearGreedData | null;
  fundingRate: number;
  newsSummary: string;
}): { systemPrompt: string; userPrompt: string } {
  const { signal, indicators, fearGreed, fundingRate, newsSummary } = params;

  const systemPrompt = `You are the Chief Quantitative Risk Officer & Senior Crypto Market Analyst for an algorithmic institutional trading desk.
Your mandate is to ruthlessly filter out low-probability trades, false breakouts, liquidation hunts, macro event traps, and overleveraged setups.
You strictly enforce capital preservation. Only approve trades with high statistical edge, clear market sentiment alignment, and no conflicting breaking news.

You must respond ONLY with a valid, parseable JSON object matching this exact schema:
{
  "approved": boolean,
  "verdict": "APPROVE" | "REJECT" | "REDUCE_SIZE",
  "confidenceScore": number, // Integer from 0 to 100
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "riskAdjustmentFactor": number, // Float between 0.5 (cautious) and 1.0 (full confidence)
  "reasoning": string, // 1-3 concise sentences explaining the rationale
  "warnings": string[] // Array of identified risk factors (e.g. "Overleveraged funding rate", "Approaching major resistance")
}
Do NOT include any markdown code blocks (like \`\`\`json), just the raw JSON object.`;

  const userPrompt = `Evaluate the following cryptocurrency trade proposal:

=== CANDIDATE TRADE SIGNAL ===
• Symbol: ${signal.symbol}
• Proposed Direction: ${signal.direction}
• Trigger Timeframe: ${signal.timeframe}
• Entry Price: $${signal.entryPrice}
• Stop Loss: $${signal.slPrice} (Distance: $${signal.riskDistance.toFixed(4)})
• Take Profit 1 (50% close + SL to Breakeven): $${signal.tp1Price} (${signal.riskRewardRatioTP1}R)
• Take Profit 2 (Close remainder): $${signal.tp2Price} (${signal.riskRewardRatioTP2}R)
• ATR (14): ${signal.atr.toFixed(4)}
• Technical Reasons:
  - ${signal.technicalReasons.join('\n  - ')}

=== TECHNICAL INDICATOR CONTEXT ===
• Higher Timeframe Trend (1h/4h): ${indicators.higherTimeframeTrend}
• Market Regime: ${indicators.regime}
• RSI (14): ${indicators.rsi.toFixed(2)}
• MACD Line: ${indicators.macd.macd.toFixed(4)} | Signal: ${indicators.macd.signal.toFixed(4)} | Histogram: ${indicators.macd.histogram.toFixed(4)}
• EMA 9: $${indicators.ema9.toFixed(2)} | EMA 21: $${indicators.ema21.toFixed(2)} | EMA 50: $${indicators.ema50.toFixed(2)} | EMA 200: $${indicators.ema200.toFixed(2)}
• Volume Above 20-period SMA: ${indicators.volumeAboveAverage ? 'YES (Surge)' : 'NO (Normal/Low)'}

=== DERIVATIVES & MACRO SENTIMENT ===
• 8h Funding Rate: ${(fundingRate * 100).toFixed(4)}% ${fundingRate > 0.03 ? '⚠️ (Extremely crowded longs)' : fundingRate < -0.03 ? '⚠️ (Extremely crowded shorts)' : '(Balanced)'}
• Crypto Fear & Greed Index: ${fearGreed ? `${fearGreed.value}/100 (${fearGreed.classification})` : 'N/A'}

=== BREAKING NEWS & HEADLINES ===
${newsSummary}

CRITERIA TO VETO / REJECT:
1. Direction opposes major macro trend without clear reversal confirmation.
2. Longing when Funding Rate is excessively positive (> +0.05%) or Shorting when excessively negative (< -0.05%).
3. Extreme breaking news that introduces binary macro volatility (e.g. SEC lawsuits, regulatory crackdowns, hacks).
4. Extreme overbought RSI (> 70 for LONG) or oversold RSI (< 30 for SHORT).

Analyze the confluence and return the JSON evaluation.`;

  return { systemPrompt, userPrompt };
}

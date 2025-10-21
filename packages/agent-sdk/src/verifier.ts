import {
  AgentConfig,
  ReasoningResult,
  ToolInvocationResult,
  VerifierResult,
} from './types';

/**
 * Verifier: Compares tool output to baseline to determine if quality improved
 *
 * Uses multi-dimensional scoring:
 * - Completeness: Does output address all requirements?
 * - Accuracy: Is output factually correct?
 * - Clarity: Is output well-structured and understandable?
 * - Relevance: Does output stay on topic?
 */
export class Verifier {
  /**
   * Compare tool output to baseline reasoning result
   */
  async compare(
    baseline: ReasoningResult,
    toolResult: ToolInvocationResult,
    config: AgentConfig
  ): Promise<VerifierResult> {
    // Extract content from tool result
    const toolContent = JSON.stringify(toolResult.output);

    // Score both outputs on multiple dimensions
    const baselineScores = await this.scoreDimensions(baseline.content);
    const toolScores = await this.scoreDimensions(toolContent);

    // Calculate weighted average
    const dimensions = [
      {
        dimension: 'completeness',
        baselineScore: baselineScores.completeness,
        newScore: toolScores.completeness,
        weight: 0.3,
      },
      {
        dimension: 'accuracy',
        baselineScore: baselineScores.accuracy,
        newScore: toolScores.accuracy,
        weight: 0.3,
      },
      {
        dimension: 'clarity',
        baselineScore: baselineScores.clarity,
        newScore: toolScores.clarity,
        weight: 0.2,
      },
      {
        dimension: 'relevance',
        baselineScore: baselineScores.relevance,
        newScore: toolScores.relevance,
        weight: 0.2,
      },
    ];

    const baselineTotal = dimensions.reduce(
      (sum, d) => sum + d.baselineScore * d.weight,
      0
    );
    const toolTotal = dimensions.reduce((sum, d) => sum + d.newScore * d.weight, 0);

    const delta = toolTotal - baselineTotal;
    const improved = delta > 0.5; // Threshold: must improve by at least 0.5 points

    return {
      improved,
      score: toolTotal,
      delta,
      dimensions,
      reasoning: improved
        ? `Tool output improved quality by ${delta.toFixed(1)} points (${baselineTotal.toFixed(1)} → ${toolTotal.toFixed(1)})`
        : `Tool output did not significantly improve quality (delta: ${delta.toFixed(1)})`,
    };
  }

  /**
   * Score content on multiple dimensions using LLM-as-judge
   *
   * Uses OpenAI API to evaluate quality across multiple dimensions:
   * - Completeness: Does output address all requirements?
   * - Accuracy: Is output factually correct?
   * - Clarity: Is output well-structured and understandable?
   * - Relevance: Does output stay on topic?
   */
  private async scoreDimensions(
    content: string
  ): Promise<{
    completeness: number;
    accuracy: number;
    clarity: number;
    relevance: number;
  }> {
    const apiKey = process.env.OPENAI_API_KEY;

    // Use OpenAI API if key is configured
    if (apiKey) {
      try {
        const scores = await this.scoreWithLLM(content, apiKey);
        return scores;
      } catch (error) {
        console.warn('[Verifier] LLM scoring failed, using heuristic fallback:', error);
        return this.scoreWithHeuristics(content);
      }
    }

    // Fallback to heuristic scoring
    console.warn('[Verifier] OPENAI_API_KEY not configured, using heuristic scoring');
    return this.scoreWithHeuristics(content);
  }

  /**
   * Score content using OpenAI LLM-as-judge
   */
  private async scoreWithLLM(
    content: string,
    apiKey: string
  ): Promise<{
    completeness: number;
    accuracy: number;
    clarity: number;
    relevance: number;
  }> {
    const prompt = `You are an expert evaluator. Score the following content on these dimensions (0-100):

1. COMPLETENESS: Does the content address all requirements and cover all necessary aspects?
2. ACCURACY: Is the content factually correct and free from errors?
3. CLARITY: Is the content well-structured, clear, and easy to understand?
4. RELEVANCE: Does the content stay on topic and avoid unnecessary tangents?

Content to evaluate:
---
${content.substring(0, 2000)} ${content.length > 2000 ? '...(truncated)' : ''}
---

Respond ONLY with a JSON object in this exact format (no additional text):
{
  "completeness": <score 0-100>,
  "accuracy": <score 0-100>,
  "clarity": <score 0-100>,
  "relevance": <score 0-100>
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Fast and cost-effective for scoring
        messages: [
          {
            role: 'system',
            content: 'You are a precise evaluator. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Low temperature for consistent scoring
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const messageContent = data.choices[0].message.content.trim();

    // Parse JSON response
    const scores = JSON.parse(messageContent);

    // Validate scores are within range
    const validateScore = (score: number) => Math.max(0, Math.min(100, score));

    return {
      completeness: validateScore(scores.completeness),
      accuracy: validateScore(scores.accuracy),
      clarity: validateScore(scores.clarity),
      relevance: validateScore(scores.relevance),
    };
  }

  /**
   * Score content using heuristic rules (fallback)
   */
  private scoreWithHeuristics(
    content: string
  ): {
    completeness: number;
    accuracy: number;
    clarity: number;
    relevance: number;
  } {
    const length = content.length;
    const wordCount = content.split(/\s+/).length;
    const hasStructure = content.includes('\n') || content.includes('.');
    const hasJson = content.includes('{') && content.includes('}');

    // Heuristic scoring based on simple metrics
    const completeness = Math.min(100, 50 + (wordCount / 10)); // More words = more complete
    const accuracy = hasJson ? 80 : 70; // Structured data likely more accurate
    const clarity = hasStructure ? 75 : 60; // Structure improves clarity
    const relevance = Math.min(100, 60 + (length > 100 ? 30 : 20)); // Longer = more relevant

    return {
      completeness: Math.round(completeness),
      accuracy: Math.round(accuracy),
      clarity: Math.round(clarity),
      relevance: Math.round(relevance),
    };
  }
}

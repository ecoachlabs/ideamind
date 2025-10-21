/**
 * Deliberation Guard - Reasoning quality evaluator
 *
 * Evaluates Chain-of-Thought (CoT) reasoning quality to prevent low-quality outputs.
 * Scores reasoning on depth, coherence, and relevance without storing raw thoughts.
 */
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'deliberation-guard' });

export interface DeliberationScore {
  depth: number; // 0-1: Reasoning depth (steps, breakdown)
  coherence: number; // 0-1: Logical consistency
  relevance: number; // 0-1: On-topic to task
  overall: number; // Weighted average
  thinkingTokens: number;
  recommendation: 'pass' | 'review' | 'fallback' | 'reject';
}

export interface CoTEvaluation {
  reasoningSteps: number;
  logicalIssues: number;
  offTopicSegments: number;
  hasConclusion: boolean;
  hasJustification: boolean;
  averageStepLength: number;
}

export interface DeliberationConfig {
  maxTokens: number; // Default 2000
  minDepthScore: number; // 0.6
  minCoherenceScore: number; // 0.6
  minRelevanceScore: number; // 0.6
  minOverallScore: number; // 0.6
  weights: {
    depth: number; // 0.35
    coherence: number; // 0.35
    relevance: number; // 0.30
  };
}

const DEFAULT_CONFIG: DeliberationConfig = {
  maxTokens: 2000,
  minDepthScore: 0.6,
  minCoherenceScore: 0.6,
  minRelevanceScore: 0.6,
  minOverallScore: 0.6,
  weights: {
    depth: 0.35,
    coherence: 0.35,
    relevance: 0.30,
  },
};

export class DeliberationGuard extends EventEmitter {
  private config: DeliberationConfig;

  constructor(
    private pool: Pool,
    config: Partial<DeliberationConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Score reasoning quality
   */
  async scoreReasoning(
    reasoning: string,
    taskContext: {
      taskId: string;
      runId?: string;
      phase?: string;
      goal?: string;
      modelUsed?: string;
    }
  ): Promise<DeliberationScore> {
    logger.info({ taskId: taskContext.taskId }, 'Evaluating reasoning quality');

    // Estimate tokens (rough: 4 chars per token)
    const tokens = Math.floor(reasoning.length / 4);

    // Evaluate CoT structure
    const evaluation = this.evaluateCoT(reasoning, taskContext);

    // Calculate individual scores
    const depthScore = this.calculateDepthScore(evaluation);
    const coherenceScore = this.calculateCoherenceScore(evaluation);
    const relevanceScore = this.calculateRelevanceScore(reasoning, taskContext);

    // Calculate weighted overall score
    const overallScore =
      depthScore * this.config.weights.depth +
      coherenceScore * this.config.weights.coherence +
      relevanceScore * this.config.weights.relevance;

    // Determine recommendation
    const recommendation = this.getRecommendation(
      depthScore,
      coherenceScore,
      relevanceScore,
      overallScore,
      tokens
    );

    const score: DeliberationScore = {
      depth: Math.round(depthScore * 100) / 100,
      coherence: Math.round(coherenceScore * 100) / 100,
      relevance: Math.round(relevanceScore * 100) / 100,
      overall: Math.round(overallScore * 100) / 100,
      thinkingTokens: tokens,
      recommendation,
    };

    // Store in database (without storing raw reasoning for privacy)
    await this.storeScore(taskContext, score, evaluation);

    // Emit event
    this.emit('deliberation-scored', {
      taskId: taskContext.taskId,
      score,
      recommendation,
    });

    logger.info(
      {
        taskId: taskContext.taskId,
        overall: score.overall,
        recommendation,
        tokens,
      },
      'Reasoning quality evaluated'
    );

    return score;
  }

  /**
   * Evaluate Chain-of-Thought structure
   */
  private evaluateCoT(reasoning: string, taskContext: any): CoTEvaluation {
    // Split into sentences/steps
    const sentences = reasoning
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Count reasoning steps (look for reasoning markers)
    const reasoningMarkers = [
      'first',
      'second',
      'third',
      'next',
      'then',
      'therefore',
      'thus',
      'consequently',
      'because',
      'since',
      'as a result',
      'step',
    ];

    let reasoningSteps = 0;
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (reasoningMarkers.some((marker) => lower.includes(marker))) {
        reasoningSteps++;
      }
    }

    // Detect logical issues (contradictions, non-sequiturs)
    let logicalIssues = 0;

    // Look for contradictions
    const contradictionPatterns = [
      /however.*(?:but|although|though)/i,
      /(?:not|never|no).*(?:always|must|definitely)/i,
      /both.*(?:and|but).*neither/i,
    ];

    for (const pattern of contradictionPatterns) {
      if (pattern.test(reasoning)) {
        logicalIssues++;
      }
    }

    // Look for vague language (reduces quality)
    const vaguePatterns = [
      /maybe|perhaps|possibly|might|could be|seems like/gi,
    ];

    for (const pattern of vaguePatterns) {
      const matches = reasoning.match(pattern);
      if (matches && matches.length > 3) {
        // Too much uncertainty
        logicalIssues++;
      }
    }

    // Count off-topic segments
    let offTopicSegments = 0;
    if (taskContext.goal) {
      const goalKeywords = taskContext.goal
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 3);

      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        const hasKeyword = goalKeywords.some((kw: string) => lower.includes(kw));
        if (!hasKeyword && sentence.length > 50) {
          // Long sentence with no goal keywords
          offTopicSegments++;
        }
      }
    }

    // Check for conclusion
    const hasConclusion =
      /\b(in conclusion|therefore|thus|consequently|as a result|in summary|to sum up)\b/i.test(
        reasoning
      );

    // Check for justification
    const hasJustification =
      /\b(because|since|as|due to|given that|considering|based on)\b/i.test(
        reasoning
      );

    // Calculate average step length
    const averageStepLength =
      sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
        : 0;

    return {
      reasoningSteps: Math.max(reasoningSteps, sentences.length / 3), // At least 1 step per 3 sentences
      logicalIssues,
      offTopicSegments,
      hasConclusion,
      hasJustification,
      averageStepLength,
    };
  }

  /**
   * Calculate depth score (0-1)
   */
  private calculateDepthScore(evaluation: CoTEvaluation): number {
    let score = 0;

    // Base score from reasoning steps (max 0.5)
    const stepsScore = Math.min(evaluation.reasoningSteps / 5, 1) * 0.5;
    score += stepsScore;

    // Bonus for conclusion (0.2)
    if (evaluation.hasConclusion) {
      score += 0.2;
    }

    // Bonus for justification (0.2)
    if (evaluation.hasJustification) {
      score += 0.2;
    }

    // Bonus for detailed steps (0.1)
    if (evaluation.averageStepLength > 50) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate coherence score (0-1)
   */
  private calculateCoherenceScore(evaluation: CoTEvaluation): number {
    let score = 1.0;

    // Deduct for logical issues (each issue -0.15)
    score -= evaluation.logicalIssues * 0.15;

    // Deduct for off-topic segments (each -0.1)
    score -= evaluation.offTopicSegments * 0.1;

    // Ensure minimum 0
    return Math.max(score, 0);
  }

  /**
   * Calculate relevance score (0-1)
   */
  private calculateRelevanceScore(reasoning: string, taskContext: any): number {
    if (!taskContext.goal && !taskContext.phase) {
      return 0.8; // Default if no context
    }

    let score = 0;

    // Check for goal keywords
    if (taskContext.goal) {
      const goalKeywords = taskContext.goal
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 3);

      const reasoningLower = reasoning.toLowerCase();
      const matchedKeywords = goalKeywords.filter((kw: string) =>
        reasoningLower.includes(kw)
      );

      const keywordScore =
        goalKeywords.length > 0
          ? matchedKeywords.length / goalKeywords.length
          : 0.5;
      score += keywordScore * 0.6;
    }

    // Check for phase-specific language
    if (taskContext.phase) {
      const phasePatterns: Record<string, string[]> = {
        plan: ['requirement', 'user story', 'feature', 'goal', 'objective'],
        design: ['architecture', 'api', 'endpoint', 'schema', 'model'],
        build: ['implement', 'code', 'function', 'class', 'module'],
        test: ['test', 'assert', 'validate', 'verify', 'coverage'],
        deploy: ['deploy', 'release', 'production', 'environment'],
      };

      const patterns = phasePatterns[taskContext.phase.toLowerCase()] || [];
      const reasoningLower = reasoning.toLowerCase();
      const matchedPatterns = patterns.filter((p) => reasoningLower.includes(p));

      const phaseScore =
        patterns.length > 0 ? matchedPatterns.length / patterns.length : 0.5;
      score += phaseScore * 0.4;
    }

    return Math.min(score, 1);
  }

  /**
   * Get recommendation based on scores
   */
  private getRecommendation(
    depth: number,
    coherence: number,
    relevance: number,
    overall: number,
    tokens: number
  ): 'pass' | 'review' | 'fallback' | 'reject' {
    // Check token cap
    if (tokens > this.config.maxTokens) {
      logger.warn(
        { tokens, maxTokens: this.config.maxTokens },
        'Exceeded token cap'
      );
      return 'fallback'; // Use simpler model
    }

    // Check if any dimension is critically low
    if (
      depth < 0.3 ||
      coherence < 0.3 ||
      relevance < 0.3 ||
      overall < 0.3
    ) {
      return 'reject';
    }

    // Check if overall score is below threshold
    if (overall < this.config.minOverallScore) {
      return 'review'; // Human review needed
    }

    // Check individual dimensions
    if (
      depth < this.config.minDepthScore ||
      coherence < this.config.minCoherenceScore ||
      relevance < this.config.minRelevanceScore
    ) {
      return 'review';
    }

    return 'pass';
  }

  /**
   * Store score in database (without raw reasoning for privacy)
   */
  private async storeScore(
    taskContext: any,
    score: DeliberationScore,
    evaluation: CoTEvaluation
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO deliberation_scores
         (task_id, run_id, depth_score, coherence_score, relevance_score, overall_score,
          thinking_tokens, max_tokens_allowed, recommendation, reasoning_steps,
          logical_issues, off_topic_segments, model_used, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          taskContext.taskId,
          taskContext.runId || null,
          score.depth,
          score.coherence,
          score.relevance,
          score.overall,
          score.thinkingTokens,
          this.config.maxTokens,
          score.recommendation,
          evaluation.reasoningSteps,
          evaluation.logicalIssues,
          evaluation.offTopicSegments,
          taskContext.modelUsed || null,
          JSON.stringify({
            phase: taskContext.phase,
            hasConclusion: evaluation.hasConclusion,
            hasJustification: evaluation.hasJustification,
          }),
        ]
      );
    } catch (err) {
      logger.error({ err, taskId: taskContext.taskId }, 'Failed to store deliberation score');
      // Don't throw - scoring should not block execution
    }
  }

  /**
   * Get deliberation statistics for a run
   */
  async getRunStats(runId: string): Promise<{
    totalEvaluations: number;
    averageScore: number;
    passRate: number;
    reviewRate: number;
    fallbackRate: number;
    rejectRate: number;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        AVG(overall_score) as avg_score,
        COUNT(*) FILTER (WHERE recommendation = 'pass') as pass_count,
        COUNT(*) FILTER (WHERE recommendation = 'review') as review_count,
        COUNT(*) FILTER (WHERE recommendation = 'fallback') as fallback_count,
        COUNT(*) FILTER (WHERE recommendation = 'reject') as reject_count
       FROM deliberation_scores
       WHERE run_id = $1`,
      [runId]
    );

    const row = result.rows[0];
    const total = parseInt(row.total) || 1;

    return {
      totalEvaluations: total,
      averageScore: parseFloat(row.avg_score) || 0,
      passRate: (parseInt(row.pass_count) || 0) / total,
      reviewRate: (parseInt(row.review_count) || 0) / total,
      fallbackRate: (parseInt(row.fallback_count) || 0) / total,
      rejectRate: (parseInt(row.reject_count) || 0) / total,
    };
  }

  /**
   * Get low-quality reasoning tasks
   */
  async getLowQualityTasks(
    minScore: number = 0.6,
    limit: number = 10
  ): Promise<
    Array<{
      taskId: string;
      overallScore: number;
      recommendation: string;
      evaluatedAt: Date;
    }>
  > {
    const result = await this.pool.query(
      `SELECT task_id, overall_score, recommendation, evaluated_at
       FROM deliberation_scores
       WHERE overall_score < $1
       ORDER BY evaluated_at DESC
       LIMIT $2`,
      [minScore, limit]
    );

    return result.rows.map((row) => ({
      taskId: row.task_id,
      overallScore: parseFloat(row.overall_score),
      recommendation: row.recommendation,
      evaluatedAt: row.evaluated_at,
    }));
  }
}

import pino from 'pino';
import { Guard, GuardResult } from './guard-interface';

const logger = pino({ name: 'coverage-guard' });

/**
 * Coverage Guard
 *
 * Checks if artifacts adequately cover the expected scope
 */
export class CoverageGuard implements Guard {
  readonly type = 'coverage';

  constructor(
    private expectedTopics?: string[],
    private minCoveragePercent: number = 0.8
  ) {}

  async execute(
    artifacts: Array<{ id: string; type: string; content?: any }>,
    context: Record<string, any>
  ): Promise<GuardResult> {
    logger.debug({ artifacts_count: artifacts.length }, 'Running coverage check');

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Combine all artifact content
    const combinedContent = artifacts
      .map((a) => JSON.stringify(a.content || {}))
      .join(' ')
      .toLowerCase();

    let coveredCount = 0;
    const uncoveredTopics: string[] = [];

    // Check topic coverage
    if (this.expectedTopics && this.expectedTopics.length > 0) {
      for (const topic of this.expectedTopics) {
        const topicLower = topic.toLowerCase();
        // Simple keyword matching - in production would use semantic similarity
        if (combinedContent.includes(topicLower)) {
          coveredCount++;
        } else {
          uncoveredTopics.push(topic);
        }
      }

      const coveragePercent = coveredCount / this.expectedTopics.length;

      if (coveragePercent < this.minCoveragePercent) {
        issues.push(
          `Coverage ${(coveragePercent * 100).toFixed(0)}% below minimum ${(
            this.minCoveragePercent * 100
          ).toFixed(0)}%`
        );
        issues.push(`Uncovered topics: ${uncoveredTopics.join(', ')}`);
        recommendations.push(
          `Add content covering: ${uncoveredTopics.join(', ')}`
        );
      }

      const score = Math.max(0, Math.min(1, coveragePercent));
      const pass = coveragePercent >= this.minCoveragePercent;

      logger.info(
        {
          pass,
          score,
          covered: coveredCount,
          total: this.expectedTopics.length,
        },
        'Coverage check complete'
      );

      return {
        type: this.type,
        pass,
        score,
        reasons: issues,
        severity: !pass ? 'medium' : undefined,
        recommendations,
        metadata: {
          covered_topics: coveredCount,
          total_topics: this.expectedTopics.length,
          coverage_percent: coveragePercent * 100,
          uncovered_topics: uncoveredTopics,
        },
        timestamp: new Date().toISOString(),
      };
    }

    // No expected topics defined - pass with full score
    return {
      type: this.type,
      pass: true,
      score: 1.0,
      timestamp: new Date().toISOString(),
    };
  }
}

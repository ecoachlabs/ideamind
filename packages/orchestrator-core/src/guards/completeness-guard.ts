import pino from 'pino';
import { Guard, GuardResult } from './guard-interface';

const logger = pino({ name: 'completeness-guard' });

/**
 * Completeness Guard
 *
 * Checks if all required artifacts are present and complete
 */
export class CompletenessGuard implements Guard {
  readonly type = 'completeness';

  constructor(
    private requiredArtifacts?: string[],
    private minContentSize: number = 100
  ) {}

  async execute(
    artifacts: Array<{ id: string; type: string; content?: any }>,
    context: Record<string, any>
  ): Promise<GuardResult> {
    logger.debug({ artifacts_count: artifacts.length }, 'Running completeness check');

    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 1.0;

    // Check if required artifacts are present
    if (this.requiredArtifacts) {
      const artifactTypes = new Set(artifacts.map((a) => a.type));
      const missing = this.requiredArtifacts.filter(
        (required) => !artifactTypes.has(required)
      );

      if (missing.length > 0) {
        issues.push(`Missing required artifacts: ${missing.join(', ')}`);
        recommendations.push(`Add ${missing.join(', ')} artifacts`);
        score -= 0.3 * (missing.length / this.requiredArtifacts.length);
      }
    }

    // Check artifact content completeness
    const emptyArtifacts: string[] = [];
    const smallArtifacts: string[] = [];

    for (const artifact of artifacts) {
      if (!artifact.content) {
        emptyArtifacts.push(artifact.type);
        continue;
      }

      // Check content size
      const contentStr = JSON.stringify(artifact.content);
      if (contentStr.length < this.minContentSize) {
        smallArtifacts.push(artifact.type);
      }
    }

    if (emptyArtifacts.length > 0) {
      issues.push(`Empty artifacts: ${emptyArtifacts.join(', ')}`);
      recommendations.push('Ensure all artifacts have content');
      score -= 0.4 * (emptyArtifacts.length / artifacts.length);
    }

    if (smallArtifacts.length > 0) {
      issues.push(
        `Artifacts with insufficient content: ${smallArtifacts.join(', ')}`
      );
      recommendations.push('Expand artifact content to meet minimum size requirements');
      score -= 0.2 * (smallArtifacts.length / artifacts.length);
    }

    // Ensure score is in valid range
    score = Math.max(0, Math.min(1, score));

    const pass = issues.length === 0;
    const severity = !pass
      ? emptyArtifacts.length > 0
        ? 'high'
        : 'medium'
      : undefined;

    logger.info(
      {
        pass,
        score,
        issues_count: issues.length,
      },
      'Completeness check complete'
    );

    return {
      type: this.type,
      pass,
      score,
      reasons: issues,
      severity,
      recommendations,
      metadata: {
        total_artifacts: artifacts.length,
        empty_artifacts: emptyArtifacts.length,
        small_artifacts: smallArtifacts.length,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Gatekeeper - Enforce pre/post conditions for quality, security, performance, viability, a11y
 *
 * Implements the gate evaluation logic from the Level-2 microflow specification:
 * - Critique Gate: unresolved criticals = 0; confidence ≥ 0.7; counterfactuals ≥ 5
 * - PRD Gate: AC completeness ≥ 0.85; RTM link coverage ≥ 0.9; NFR coverage ≥ 0.8
 * - Viability Gate: LTV:CAC ≥ 3.0; payback ≤ 12mo; 1+ viable channel
 * - Security Gate: critical vulns = 0; threat mitigations linked; secrets policy pass
 * - Perf Gate: p95 latency within target; error budget burn < 10%/day
 * - A11y Gate: WCAG 2.2 AA automated pass + manual spot checks
 *
 * Each gate produces an Evidence Pack with:
 * - Required artifacts list
 * - Rubric scores
 * - Tool provenance (version, signatures)
 * - Test reports (IDs)
 * - Approvals (who/when)
 * - Decision (pass/fail) + reasons
 */

import { Recorder } from '../recorder/recorder';

export interface GateRubric {
  id: string;
  name: string;
  description: string;
  metrics: GateMetric[];
  minimumScore?: number; // Overall minimum score to pass (0-100)
}

export interface GateMetric {
  id: string;
  name: string;
  description: string;
  type: 'numeric' | 'boolean' | 'percentage' | 'count';
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=';
  threshold: number | boolean;
  weight: number; // 0-1, used for weighted scoring
  required: boolean; // If true, gate fails if this metric fails
}

export interface GateEvaluationInput {
  runId: string;
  phase: string;
  artifacts: any[];
  metrics: Record<string, number | boolean>;
  metadata?: Record<string, any>;
}

export interface GateEvaluationResult {
  gateId: string;
  gateName: string;
  status: 'pass' | 'fail' | 'warn';
  overallScore: number; // 0-100
  metricResults: MetricResult[];
  requiredArtifacts: ArtifactCheck[];
  evidencePack: EvidencePack;
  decision: GateDecision;
  recommendations: string[];
  timestamp: string;
}

export interface MetricResult {
  metricId: string;
  metricName: string;
  actualValue: number | boolean;
  threshold: number | boolean;
  operator: string;
  passed: boolean;
  required: boolean;
  weight: number;
  contributionToScore: number;
}

export interface ArtifactCheck {
  artifactType: string;
  required: boolean;
  present: boolean;
  artifactId?: string;
}

export interface EvidencePack {
  requiredArtifacts: string[];
  presentArtifacts: string[];
  rubricScores: Record<string, number>;
  toolProvenance: ToolProvenance[];
  testReports: string[];
  approvals: Approval[];
  timestamp: string;
}

export interface ToolProvenance {
  toolId: string;
  version: string;
  signature?: string;
  executedAt: string;
  outputArtifacts: string[];
}

export interface Approval {
  approver: string;
  role: string;
  timestamp: string;
  decision: 'approve' | 'reject' | 'conditional';
  conditions?: string[];
}

export interface GateDecision {
  decision: 'pass' | 'fail' | 'escalate';
  reasons: string[];
  requiredActions?: string[];
  escalationReason?: string;
  nextSteps: string[];
}

/**
 * Base Gatekeeper class - extend for specific gates
 */
export abstract class Gatekeeper {
  constructor(
    protected gateId: string,
    protected gateName: string,
    protected rubric: GateRubric,
    protected requiredArtifactTypes: string[],
    protected recorder?: Recorder
  ) {}

  /**
   * Evaluate the gate
   */
  async evaluate(input: GateEvaluationInput): Promise<GateEvaluationResult> {
    const startTime = Date.now();

    // 1. Check required artifacts
    const artifactChecks = this.checkRequiredArtifacts(input.artifacts);
    const missingRequiredArtifacts = artifactChecks.filter((a) => a.required && !a.present);

    // 2. Evaluate metrics against rubric
    const metricResults = this.evaluateMetrics(input.metrics);

    // 3. Calculate overall score (weighted average of passing metrics)
    const overallScore = this.calculateOverallScore(metricResults);

    // 4. Determine pass/fail status
    const status = this.determineStatus(metricResults, overallScore, missingRequiredArtifacts);

    // 5. Build evidence pack
    const evidencePack = this.buildEvidencePack(input, artifactChecks);

    // 6. Make decision
    const decision = this.makeDecision(status, metricResults, missingRequiredArtifacts);

    // 7. Generate recommendations
    const recommendations = this.generateRecommendations(metricResults, missingRequiredArtifacts);

    const result: GateEvaluationResult = {
      gateId: this.gateId,
      gateName: this.gateName,
      status,
      overallScore,
      metricResults,
      requiredArtifacts: artifactChecks,
      evidencePack,
      decision,
      recommendations,
      timestamp: new Date().toISOString(),
    };

    // Record the gate evaluation
    if (this.recorder) {
      await this.recorder.recordDecision({
        runId: input.runId,
        phase: input.phase,
        actor: `Gatekeeper:${this.gateId}`,
        decisionType: 'gate_evaluation',
        inputs: input.metrics,
        outputs: { status, overallScore, decision },
        reasoning: decision.reasons.join('; '),
        confidence: overallScore / 100,
      });

      await this.recorder.recordScore({
        runId: input.runId,
        phase: input.phase,
        scoreType: `gate:${this.gateId}`,
        value: overallScore,
        target: this.rubric.minimumScore || 70,
        status: status === 'pass' ? 'pass' : status === 'warn' ? 'warn' : 'fail',
        details: { metricResults, decision },
      });

      await this.recorder.recordStep({
        runId: input.runId,
        phase: input.phase,
        step: `gate.${this.gateId}.evaluate`,
        actor: `Gatekeeper:${this.gateId}`,
        inputs: input.artifacts.map((a) => a.id || a.type),
        outputs: [result.evidencePack.toString()],
        score: { overallScore },
        cost: { usd: 0, tokens: 0 }, // Gate evaluation has no LLM cost
        latency_ms: Date.now() - startTime,
        gate: this.gateId,
        status: status === 'pass' ? 'succeeded' : status === 'fail' ? 'blocked' : 'succeeded',
      });
    }

    return result;
  }

  /**
   * Check for required artifacts
   */
  protected checkRequiredArtifacts(artifacts: any[]): ArtifactCheck[] {
    return this.requiredArtifactTypes.map((type) => {
      const artifact = artifacts.find((a) => a.type === type);
      return {
        artifactType: type,
        required: true,
        present: !!artifact,
        artifactId: artifact?.id,
      };
    });
  }

  /**
   * Evaluate each metric against its threshold
   */
  protected evaluateMetrics(metrics: Record<string, number | boolean>): MetricResult[] {
    return this.rubric.metrics.map((metric) => {
      const actualValue = metrics[metric.id];
      const passed = this.evaluateMetric(actualValue, metric.operator, metric.threshold);

      // Calculate contribution to overall score
      const contributionToScore = passed ? metric.weight * 100 : 0;

      return {
        metricId: metric.id,
        metricName: metric.name,
        actualValue,
        threshold: metric.threshold,
        operator: metric.operator,
        passed,
        required: metric.required,
        weight: metric.weight,
        contributionToScore,
      };
    });
  }

  /**
   * Evaluate a single metric
   */
  protected evaluateMetric(
    actual: number | boolean,
    operator: string,
    threshold: number | boolean
  ): boolean {
    switch (operator) {
      case '=':
        return actual === threshold;
      case '!=':
        return actual !== threshold;
      case '>':
        return (actual as number) > (threshold as number);
      case '>=':
        return (actual as number) >= (threshold as number);
      case '<':
        return (actual as number) < (threshold as number);
      case '<=':
        return (actual as number) <= (threshold as number);
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Calculate weighted overall score
   */
  protected calculateOverallScore(metricResults: MetricResult[]): number {
    const totalWeight = metricResults.reduce((sum, m) => sum + m.weight, 0);
    const weightedScore = metricResults.reduce((sum, m) => sum + m.contributionToScore, 0);
    return Math.round(weightedScore / totalWeight);
  }

  /**
   * Determine pass/fail/warn status
   */
  protected determineStatus(
    metricResults: MetricResult[],
    overallScore: number,
    missingArtifacts: ArtifactCheck[]
  ): 'pass' | 'fail' | 'warn' {
    // Fail if any required metric fails
    const failedRequiredMetrics = metricResults.filter((m) => m.required && !m.passed);
    if (failedRequiredMetrics.length > 0) {
      return 'fail';
    }

    // Fail if any required artifacts are missing
    if (missingArtifacts.length > 0) {
      return 'fail';
    }

    // Fail if overall score below minimum
    const minimumScore = this.rubric.minimumScore || 70;
    if (overallScore < minimumScore) {
      return 'fail';
    }

    // Warn if score is marginal (between minimum and minimum + 10)
    if (overallScore < minimumScore + 10) {
      return 'warn';
    }

    return 'pass';
  }

  /**
   * Build evidence pack
   */
  protected buildEvidencePack(
    input: GateEvaluationInput,
    artifactChecks: ArtifactCheck[]
  ): EvidencePack {
    return {
      requiredArtifacts: this.requiredArtifactTypes,
      presentArtifacts: artifactChecks
        .filter((a) => a.present)
        .map((a) => a.artifactId || a.artifactType),
      rubricScores: Object.fromEntries(
        Object.entries(input.metrics).map(([key, value]) => [key, Number(value)])
      ),
      toolProvenance: [], // Populated by specific gatekeepers
      testReports: [], // Populated by specific gatekeepers
      approvals: [], // Populated by specific gatekeepers
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Make final decision
   */
  protected makeDecision(
    status: 'pass' | 'fail' | 'warn',
    metricResults: MetricResult[],
    missingArtifacts: ArtifactCheck[]
  ): GateDecision {
    const reasons: string[] = [];
    const requiredActions: string[] = [];
    const nextSteps: string[] = [];

    if (status === 'pass') {
      reasons.push('All required metrics passed');
      reasons.push('All required artifacts present');
      nextSteps.push('Proceed to next phase');
      return {
        decision: 'pass',
        reasons,
        nextSteps,
      };
    }

    if (status === 'warn') {
      reasons.push('Metrics passed but score is marginal');
      nextSteps.push('Consider improvements before proceeding');
      nextSteps.push('Monitor closely in next phase');
    }

    if (status === 'fail') {
      const failedRequired = metricResults.filter((m) => m.required && !m.passed);
      if (failedRequired.length > 0) {
        reasons.push(`${failedRequired.length} required metric(s) failed`);
        failedRequired.forEach((m) => {
          requiredActions.push(
            `Fix ${m.metricName}: ${m.actualValue} ${m.operator} ${m.threshold} (required)`
          );
        });
      }

      if (missingArtifacts.length > 0) {
        reasons.push(`${missingArtifacts.length} required artifact(s) missing`);
        missingArtifacts.forEach((a) => {
          requiredActions.push(`Generate required artifact: ${a.artifactType}`);
        });
      }

      const failedOptional = metricResults.filter((m) => !m.required && !m.passed);
      if (failedOptional.length > 0) {
        reasons.push(`${failedOptional.length} optional metric(s) failed`);
      }

      nextSteps.push('Address all required actions');
      nextSteps.push('Re-run gate evaluation');
      nextSteps.push('Consider escalation if blockers persist');
    }

    return {
      decision: status === 'fail' ? 'fail' : 'pass',
      reasons,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined,
      nextSteps,
    };
  }

  /**
   * Generate recommendations for improvement
   */
  protected generateRecommendations(
    metricResults: MetricResult[],
    missingArtifacts: ArtifactCheck[]
  ): string[] {
    const recommendations: string[] = [];

    // Recommendations for failed metrics
    const failed = metricResults.filter((m) => !m.passed);
    failed.forEach((m) => {
      if (typeof m.threshold === 'number' && typeof m.actualValue === 'number') {
        const gap = Math.abs(m.threshold - m.actualValue);
        const gapPercent = (gap / m.threshold) * 100;
        recommendations.push(
          `Improve ${m.metricName} by ${gapPercent.toFixed(1)}% to meet threshold`
        );
      }
    });

    // Recommendations for missing artifacts
    missingArtifacts.forEach((a) => {
      recommendations.push(`Generate missing artifact: ${a.artifactType}`);
    });

    // General recommendations
    const marginalMetrics = metricResults.filter(
      (m) => m.passed && typeof m.actualValue === 'number' && typeof m.threshold === 'number'
    );
    marginalMetrics.forEach((m) => {
      const value = m.actualValue as number;
      const threshold = m.threshold as number;
      if (m.operator === '>=' && value < threshold * 1.1) {
        recommendations.push(`${m.metricName} is marginal - consider improving for robustness`);
      }
    });

    return recommendations;
  }
}

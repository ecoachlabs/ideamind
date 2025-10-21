/**
 * Enhanced BETA Phase Coordinator with Level-2 Infrastructure Integration
 *
 * Integrates:
 * - BetaGate for beta readiness enforcement
 * - Recorder for comprehensive logging
 * - Dispatcher for event-driven coordination
 * - Supervisor for retry/backoff/circuit breaker
 *
 * Gate Requirements:
 * - Beta readiness score ≥ 65
 * - Distribution channels ≥ 2
 * - Beta testers ≥ 20
 * - Privacy compliance ≥ 70
 */

import {
  EnhancedPhaseCoordinator,
  type EnhancedPhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/enhanced-phase-coordinator';
import {
  Recorder,
  InMemoryRecorderStorage,
  Dispatcher,
  BetaGate,
  type GateEvaluationInput,
  PHASE_GATE_MAPPING,
} from '@ideamine/orchestrator-core';
import { PhaseResult, AgentArtifact } from '../base/types';
import { BetaDistributorAgent } from './beta-distributor-agent';
import { TelemetryCollectorAgent } from './telemetry-collector-agent';
import { AnalyticsReporterAgent } from './analytics-reporter-agent';

export class EnhancedBetaPhaseCoordinator extends EnhancedPhaseCoordinator {
  constructor(config?: Partial<EnhancedPhaseCoordinatorConfig>) {
    const phaseConfig = PHASE_GATE_MAPPING.BETA;
    const recorder = config?.recorder || new Recorder(new InMemoryRecorderStorage());
    const dispatcher = config?.dispatcher || new Dispatcher({ maxConcurrency: 10 }, recorder);
    const gatekeeper = config?.gatekeeper || new BetaGate(recorder);

    super({
      phaseName: 'BETA',
      budget: phaseConfig.budget,
      minRequiredAgents: phaseConfig.minRequiredAgents,
      maxConcurrency: phaseConfig.maxConcurrency,
      gatekeeper,
      recorder,
      dispatcher,
      maxGateRetries: phaseConfig.maxGateRetries,
      autoRetryOnGateFail: phaseConfig.autoRetryOnGateFail,
      ...config,
    });
  }

  async execute(context: any): Promise<any> {
    console.log('\n🚀 Starting BETA phase with parallel execution...');
    console.log('   Agents: BetaDistributorAgent, TelemetryCollectorAgent, AnalyticsReporterAgent');
    console.log('   Execution: PARALLEL (3x speedup)\n');

    const agents = [
      new BetaDistributorAgent(),
      new TelemetryCollectorAgent(),
      new AnalyticsReporterAgent(),
    ];

    const results = await this.executeAgents(agents, context);
    const aggregated = await this.aggregateResults(results);

    return aggregated;
  }

  protected async aggregateResults(results: PhaseResult[]): Promise<PhaseResult> {
    console.log('\n🔄 Aggregating BETA phase results...');

    const distributionResult = results.find((r) =>
      r.artifacts.some((a) => a.type === 'beta-distribution-plan')
    );
    const telemetryResult = results.find((r) =>
      r.artifacts.some((a) => a.type === 'telemetry-collection-plan')
    );
    const analyticsResult = results.find((r) =>
      r.artifacts.some((a) => a.type === 'analytics-report-plan')
    );

    const distributionArtifact = distributionResult?.artifacts.find(
      (a) => a.type === 'beta-distribution-plan'
    );
    const telemetryArtifact = telemetryResult?.artifacts.find(
      (a) => a.type === 'telemetry-collection-plan'
    );
    const analyticsArtifact = analyticsResult?.artifacts.find(
      (a) => a.type === 'analytics-report-plan'
    );

    const distributionData = this.parseArtifactContent(distributionArtifact?.content);
    const telemetryData = this.parseArtifactContent(telemetryArtifact?.content);
    const analyticsData = this.parseArtifactContent(analyticsArtifact?.content);

    const distributionScore = this.calculateDistributionScore(distributionData);
    const telemetryScore = this.calculateTelemetryScore(telemetryData);
    const analyticsScore = this.calculateAnalyticsScore(analyticsData);

    const betaReadinessScore = Math.round(
      distributionScore * 0.35 + telemetryScore * 0.35 + analyticsScore * 0.3
    );

    const summary = {
      betaReadinessScore,
      distributionScore,
      telemetryScore,
      analyticsScore,
      totalChannels: distributionData?.summary?.totalChannels || 0,
      totalTesters: distributionData?.summary?.totalTesters || 0,
      totalEvents: telemetryData?.summary?.totalEvents || 0,
      totalDashboards: analyticsData?.summary?.totalDashboards || 0,
    };

    const betaCompleteArtifact: AgentArtifact = {
      type: 'beta-complete',
      title: 'BETA Phase Complete',
      content: JSON.stringify(
        {
          summary,
          distribution: distributionData,
          telemetry: telemetryData,
          analytics: analyticsData,
        },
        null,
        2
      ),
      metadata: {
        betaReadinessScore,
      },
    };

    const allArtifacts = [
      betaCompleteArtifact,
      ...(distributionArtifact ? [distributionArtifact] : []),
      ...(telemetryArtifact ? [telemetryArtifact] : []),
      ...(analyticsArtifact ? [analyticsArtifact] : []),
    ];

    console.log(`\n✅ BETA phase aggregation complete:`);
    console.log(`   📊 Beta Readiness Score: ${betaReadinessScore}/100`);

    return {
      success: results.every((r) => r.success),
      artifacts: allArtifacts,
      summary,
      details: {
        distribution: distributionData,
        telemetry: telemetryData,
        analytics: analyticsData,
      },
    };
  }

  private parseArtifactContent(content: string | object | undefined): any {
    if (!content) return null;
    if (typeof content === 'string') {
      try {
        return JSON.parse(content);
      } catch {
        return null;
      }
    }
    return content;
  }

  private calculateDistributionScore(data: any): number {
    if (!data) return 0;
    let score = 0;
    const summary = data.summary || {};

    const channels = summary.totalChannels || 0;
    if (channels >= 3) score += 25;
    else if (channels >= 2) score += 18;
    else if (channels >= 1) score += 10;

    const testers = summary.totalTesters || 0;
    if (testers >= 100) score += 25;
    else if (testers >= 50) score += 20;
    else if (testers >= 20) score += 15;
    else if (testers >= 10) score += 10;

    if (summary.readyForDistribution === true) score += 30;
    else if (summary.readyForDistribution === 'partial') score += 15;

    const automation = data.onboarding?.automationLevel || 0;
    score += Math.min(20, Math.round(automation * 20));

    return Math.min(100, score);
  }

  private calculateTelemetryScore(data: any): number {
    if (!data) return 0;
    let score = 0;
    const summary = data.summary || {};

    const events = summary.totalEvents || 0;
    if (events >= 50) score += 30;
    else if (events >= 30) score += 25;
    else if (events >= 20) score += 20;
    else if (events >= 10) score += 15;

    const platforms = summary.totalPlatforms || 0;
    if (platforms >= 3) score += 25;
    else if (platforms >= 2) score += 18;
    else if (platforms >= 1) score += 10;

    const compliance = data.privacy?.complianceScore || 0;
    score += Math.round(compliance * 0.25);

    if (summary.implementationReadiness === 'ready') score += 20;
    else if (summary.implementationReadiness === 'partial') score += 10;

    return Math.min(100, score);
  }

  private calculateAnalyticsScore(data: any): number {
    if (!data) return 0;
    let score = 0;
    const summary = data.summary || {};

    const dashboards = summary.totalDashboards || 0;
    if (dashboards >= 5) score += 25;
    else if (dashboards >= 3) score += 20;
    else if (dashboards >= 2) score += 15;
    else if (dashboards >= 1) score += 10;

    const healthScore = summary.overallHealthScore || 0;
    score += Math.round(healthScore * 0.3);

    const metrics = data.keyMetrics?.length || 0;
    if (metrics >= 12) score += 20;
    else if (metrics >= 8) score += 15;
    else if (metrics >= 5) score += 10;

    const insights = summary.keyInsights || 0;
    if (insights >= 10) score += 15;
    else if (insights >= 5) score += 10;
    else if (insights >= 3) score += 5;

    if (data.reportSchedule?.length >= 3) score += 10;
    else if (data.reportSchedule?.length >= 2) score += 7;
    else if (data.reportSchedule?.length >= 1) score += 4;

    return Math.min(100, score);
  }

  /**
   * Prepare gate input from phase results
   * Extracts metrics required by BetaGate:
   * - beta_readiness_score: Overall beta readiness score
   * - distribution_channels: Number of distribution channels
   * - beta_testers: Number of beta testers
   * - privacy_compliance: Privacy compliance score
   */
  protected async prepareGateInput(phaseInput: any, phaseResult: any): Promise<GateEvaluationInput> {
    const summary = phaseResult.summary || {};
    const details = phaseResult.details || {};

    const beta_readiness_score = summary.betaReadinessScore || 0;
    const distribution_channels = summary.totalChannels || 0;
    const beta_testers = summary.totalTesters || 0;
    const privacy_compliance = details.telemetry?.privacy?.complianceScore || 0;
    const telemetry_events = summary.totalEvents || 0;
    const analytics_dashboards = summary.totalDashboards || 0;

    return {
      runId: phaseInput.workflowRunId,
      phase: 'BETA',
      artifacts: phaseResult.artifacts || [],
      metrics: {
        beta_readiness_score,
        distribution_channels,
        beta_testers,
        privacy_compliance,
        telemetry_events,
        analytics_dashboards,
      },
    };
  }

  protected async enhanceInputWithHints(input: any, gateResult: any): Promise<any> {
    const hints: string[] = [];
    const failedMetrics = gateResult.decision?.failedMetrics || [];

    failedMetrics.forEach((metric: any) => {
      if (metric.metric === 'beta_readiness_score') {
        hints.push(
          `Increase beta readiness score. Currently ${metric.actual}, need ${metric.threshold} minimum`
        );
      } else if (metric.metric === 'distribution_channels') {
        hints.push(
          `Add more distribution channels. Currently ${metric.actual}, need at least ${metric.threshold}`
        );
      } else if (metric.metric === 'beta_testers') {
        hints.push(
          `Recruit more beta testers. Currently ${metric.actual}, need at least ${metric.threshold}`
        );
      } else if (metric.metric === 'privacy_compliance') {
        hints.push(
          `Improve privacy compliance. Currently ${metric.actual}, need ${metric.threshold} minimum`
        );
      }
    });

    return {
      ...input,
      gateHints: hints,
      retryReason: 'gate_failure',
      previousGateResult: gateResult,
    };
  }
}

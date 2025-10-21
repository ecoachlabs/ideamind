/**
 * Enhanced BizDev Phase Coordinator with Level-2 Infrastructure Integration
 *
 * Integrates:
 * - ViabilityGate for business viability enforcement
 * - Recorder for comprehensive logging
 * - Dispatcher for event-driven coordination
 * - Supervisor for retry/backoff/circuit breaker
 *
 * Gate Requirements:
 * - LTV:CAC ratio ≥ 3.0
 * - Payback period ≤ 12 months
 * - At least 1 viable GTM channel
 */

import {
  EnhancedPhaseCoordinator,
  type EnhancedPhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/enhanced-phase-coordinator';
import {
  Recorder,
  InMemoryRecorderStorage,
  Dispatcher,
  ViabilityGate,
  type GateEvaluationInput,
  PHASE_GATE_MAPPING,
} from '@ideamine/orchestrator-core';
import { BaseAgent } from '../base/base-agent';
import { PhaseInput, Artifact } from '../base/types';
import { ViabilityAnalyzerAgent } from './viability-analyzer-agent';
import { GTMPlannerAgent } from './gtm-planner-agent';
import { PricingModelerAgent } from './pricing-modeler-agent';
import { MonetizationAdvisorAgent } from './monetization-advisor-agent';
import { loadAgentConfig } from '../config/config-loader';

export class EnhancedBizDevPhaseCoordinator extends EnhancedPhaseCoordinator {
  private viabilityAgent?: ViabilityAnalyzerAgent;
  private gtmAgent?: GTMPlannerAgent;
  private pricingAgent?: PricingModelerAgent;
  private monetizationAgent?: MonetizationAdvisorAgent;

  constructor(config?: Partial<EnhancedPhaseCoordinatorConfig>) {
    const phaseConfig = PHASE_GATE_MAPPING.BIZDEV;
    const recorder = config?.recorder || new Recorder(new InMemoryRecorderStorage());
    const dispatcher = config?.dispatcher || new Dispatcher({ maxConcurrency: 10 }, recorder);
    const gatekeeper = config?.gatekeeper || new ViabilityGate(recorder);

    super({
      phaseName: 'BIZDEV',
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

  protected async initializeAgents(): Promise<BaseAgent[]> {
    const agents: BaseAgent[] = [];

    const viabilityConfig = await loadAgentConfig('bizdev', 'viability-analyzer');
    const gtmConfig = await loadAgentConfig('bizdev', 'gtm-planner');
    const pricingConfig = await loadAgentConfig('bizdev', 'pricing-modeler');
    const monetizationConfig = await loadAgentConfig('bizdev', 'monetization-advisor');

    this.viabilityAgent = new ViabilityAnalyzerAgent(viabilityConfig);
    agents.push(this.viabilityAgent);

    this.gtmAgent = new GTMPlannerAgent(gtmConfig);
    agents.push(this.gtmAgent);

    this.pricingAgent = new PricingModelerAgent(pricingConfig);
    agents.push(this.pricingAgent);

    this.monetizationAgent = new MonetizationAdvisorAgent(monetizationConfig);
    agents.push(this.monetizationAgent);

    this.logger.info(`Initialized ${agents.length} BIZDEV agents for parallel execution`);
    return agents;
  }

  protected async aggregateResults(
    successes: Array<{ agent: BaseAgent; artifacts: Artifact[] }>,
    failures: Array<{ agent: BaseAgent; error: Error }>,
    phaseInput: PhaseInput
  ): Promise<Artifact[]> {
    const aggregatedArtifacts: Artifact[] = [];

    for (const { artifacts } of successes) {
      aggregatedArtifacts.push(...artifacts);
    }

    const viabilityAnalysis = aggregatedArtifacts.find((a) => a.type === 'viability-analysis');
    const gtmPlan = aggregatedArtifacts.find((a) => a.type === 'gtm-plan');
    const pricingModel = aggregatedArtifacts.find((a) => a.type === 'pricing-model');
    const monetizationStrategy = aggregatedArtifacts.find((a) => a.type === 'monetization-strategy');

    const summary = {
      viabilityScore: viabilityAnalysis?.content?.viabilityScore || 0,
      ltvCacRatio: viabilityAnalysis?.content?.unitEconomics?.ltvCacRatio || 0,
      paybackMonths: viabilityAnalysis?.content?.unitEconomics?.paybackPeriod || 0,
      viableChannels: gtmPlan?.content?.marketingChannels?.filter((c: any) => c.viability === 'high').length || 0,
    };

    const bizdevComplete: Artifact = {
      type: 'bizdev-complete',
      content: {
        viability: viabilityAnalysis?.content || null,
        gtm: gtmPlan?.content || null,
        pricing: pricingModel?.content || null,
        monetization: monetizationStrategy?.content || null,
        summary,
        agentsCompleted: successes.length,
        agentsFailed: failures.length,
      },
      metadata: {
        phaseId: 'BIZDEV',
        projectId: phaseInput.projectId,
        workflowRunId: phaseInput.workflowRunId,
        generatedAt: new Date().toISOString(),
      },
    };

    aggregatedArtifacts.push(bizdevComplete);
    return aggregatedArtifacts;
  }

  /**
   * Prepare gate input from phase results
   * Extracts metrics required by ViabilityGate:
   * - ltv_cac_ratio: Lifetime value to customer acquisition cost ratio
   * - payback_months: CAC payback period in months
   * - viable_channels: Number of viable GTM channels
   */
  protected async prepareGateInput(phaseInput: any, phaseResult: any): Promise<GateEvaluationInput> {
    const artifacts = phaseResult.artifacts || [];

    const viabilityAnalysis = artifacts.find((a: any) => a.type === 'viability-analysis');
    const gtmPlan = artifacts.find((a: any) => a.type === 'gtm-plan');

    const ltv_cac_ratio = viabilityAnalysis?.content?.unitEconomics?.ltvCacRatio || 0;
    const payback_months = viabilityAnalysis?.content?.unitEconomics?.paybackPeriod || 999;
    const viable_channels =
      gtmPlan?.content?.marketingChannels?.filter((c: any) => c.viability === 'high').length || 0;

    return {
      runId: phaseInput.workflowRunId,
      phase: 'BIZDEV',
      artifacts,
      metrics: {
        ltv_cac_ratio,
        payback_months,
        viable_channels,
      },
    };
  }

  protected async enhanceInputWithHints(input: any, gateResult: any): Promise<any> {
    const hints: string[] = [];
    const failedMetrics = gateResult.decision?.failedMetrics || [];

    failedMetrics.forEach((metric: any) => {
      if (metric.metric === 'ltv_cac_ratio') {
        hints.push(
          `Improve LTV:CAC ratio. Currently ${metric.actual.toFixed(2)}, need ${metric.threshold.toFixed(1)} minimum`
        );
      } else if (metric.metric === 'payback_months') {
        hints.push(
          `Reduce CAC payback period. Currently ${metric.actual} months, need ≤ ${metric.threshold} months`
        );
      } else if (metric.metric === 'viable_channels') {
        hints.push(`Identify more viable GTM channels. Currently ${metric.actual}, need at least ${metric.threshold}`);
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

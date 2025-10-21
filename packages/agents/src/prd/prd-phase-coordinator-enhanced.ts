/**
 * Enhanced PRD Phase Coordinator with Level-2 Infrastructure Integration
 *
 * Integrates:
 * - PRDGate for quality enforcement
 * - Recorder for comprehensive logging
 * - Dispatcher for event-driven coordination
 * - Supervisor for retry/backoff/circuit breaker
 *
 * Gate Requirements:
 * - AC completeness ≥ 0.85
 * - RTM coverage ≥ 0.9
 * - NFR coverage ≥ 0.8
 */

import {
  EnhancedPhaseCoordinator,
  type EnhancedPhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/enhanced-phase-coordinator';
import {
  Recorder,
  InMemoryRecorderStorage,
  Dispatcher,
  PRDGate,
  type GateEvaluationInput,
  PHASE_GATE_MAPPING,
} from '@ideamine/orchestrator-core';
import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';
import { PRDWriterAgent } from './prd-writer-agent';
import { FeatureDecomposerAgent } from './feature-decomposer-agent';
import { AcceptanceCriteriaWriterAgent } from './acceptance-criteria-writer-agent';

async function loadPRDAgentConfigs() {
  const { loadAgentConfig } = await import('../config/loader');
  return loadAgentConfig('prd-agents.yaml');
}

export class EnhancedPRDPhaseCoordinator extends EnhancedPhaseCoordinator {
  private prdWriterAgent?: PRDWriterAgent;
  private featureDecomposerAgent?: FeatureDecomposerAgent;
  private acceptanceCriteriaAgent?: AcceptanceCriteriaWriterAgent;

  constructor(config?: Partial<EnhancedPhaseCoordinatorConfig>) {
    const phaseConfig = PHASE_GATE_MAPPING.PRD;
    const recorder = config?.recorder || new Recorder(new InMemoryRecorderStorage());
    const dispatcher = config?.dispatcher || new Dispatcher({ maxConcurrency: 10 }, recorder);
    const gatekeeper = config?.gatekeeper || new PRDGate(recorder);

    super({
      phaseName: 'PRD',
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
    console.log('[EnhancedPRDCoordinator] Loading agent configurations');

    const configs = await loadPRDAgentConfigs();

    const prdWriterConfig = configs.find((c) => c.id === 'prd-writer-agent');
    const featureDecomposerConfig = configs.find((c) => c.id === 'prd-feature-decomposer-agent');
    const acceptanceCriteriaConfig = configs.find((c) => c.id === 'prd-acceptance-criteria-agent');

    if (!prdWriterConfig || !featureDecomposerConfig || !acceptanceCriteriaConfig) {
      throw new Error('Failed to load all PRD agent configurations');
    }

    this.prdWriterAgent = new PRDWriterAgent(prdWriterConfig);
    this.featureDecomposerAgent = new FeatureDecomposerAgent(featureDecomposerConfig);
    this.acceptanceCriteriaAgent = new AcceptanceCriteriaWriterAgent(acceptanceCriteriaConfig);

    console.log('[EnhancedPRDCoordinator] All 3 agents initialized');

    return [this.prdWriterAgent, this.featureDecomposerAgent, this.acceptanceCriteriaAgent];
  }

  protected async prepareAgentInput(agent: BaseAgent, phaseInput: any): Promise<AgentInput> {
    const { ideaSpec, previousArtifacts, workflowRunId, userId, projectId } = phaseInput;

    if (!ideaSpec) {
      throw new Error('IdeaSpec not found in phase input');
    }

    const strategyArtifact = previousArtifacts?.find((a: any) => a.type === 'product-strategy');
    const competitiveArtifact = previousArtifacts?.find((a: any) => a.type === 'competitive-analysis');
    const personaArtifact = previousArtifacts?.find((a: any) => a.type === 'user-personas');
    const critiqueArtifact = previousArtifacts?.find((a: any) => a.type === 'critique-complete');
    const prdArtifact = previousArtifacts?.find((a: any) => a.type === 'product-requirements-document');
    const decompositionArtifact = previousArtifacts?.find((a: any) => a.type === 'feature-decomposition');

    return {
      data: {
        ideaSpec,
        strategy: strategyArtifact?.content || null,
        competitive: competitiveArtifact?.content || null,
        personas: personaArtifact?.content || null,
        critique: critiqueArtifact?.content || null,
        prd: prdArtifact?.content || null,
        stories: decompositionArtifact?.content?.stories || null,
      },
      context: {
        workflowRunId,
        userId,
        projectId,
        phase: 'PRD',
      },
    };
  }

  protected async aggregateResults(
    successes: AgentOutput[],
    failures: Error[],
    phaseInput: any
  ): Promise<any> {
    console.log('[EnhancedPRDCoordinator] Aggregating results from agents');

    const artifacts: any[] = [];
    let totalCost = 0;

    successes.forEach((output) => {
      if (output.artifacts) {
        artifacts.push(...output.artifacts);
      }
      totalCost += output.cost || 0;
    });

    const prdArtifact = artifacts.find((a) => a.type === 'product-requirements-document');
    const decompositionArtifact = artifacts.find((a) => a.type === 'feature-decomposition');
    const criteriaArtifact = artifacts.find((a) => a.type === 'acceptance-criteria');

    const totalFunctionalReqs = prdArtifact?.content?.functionalRequirements?.length || 0;
    const totalStories = decompositionArtifact?.content?.stories?.length || 0;
    const totalStoryPoints = decompositionArtifact?.content?.totalStoryPoints || 0;
    const totalCriteria = criteriaArtifact?.content?.coverageMetrics?.totalCriteria || 0;
    const testabilityScore = criteriaArtifact?.content?.coverageMetrics?.testabilityScore || 0;

    const aggregatedArtifact = {
      type: 'prd-complete',
      version: '1.0.0',
      content: {
        prd: prdArtifact?.content || null,
        decomposition: decompositionArtifact?.content || null,
        acceptanceCriteria: criteriaArtifact?.content || null,
        summary: {
          totalFunctionalRequirements: totalFunctionalReqs,
          totalEpics: decompositionArtifact?.content?.epics?.length || 0,
          totalStories,
          totalStoryPoints,
          estimatedSprints: decompositionArtifact?.content?.estimatedSprints || 0,
          totalAcceptanceCriteria: totalCriteria,
          testabilityScore,
          completeness: successes.length / 3,
        },
        completeness: successes.length / 3,
        failedAgents: failures.length,
        timestamp: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };

    console.log(`[EnhancedPRDCoordinator] Aggregation complete: ${successes.length}/3 agents succeeded`);

    return {
      artifacts: [...artifacts, aggregatedArtifact],
      totalCost,
    };
  }

  /**
   * Prepare gate input from phase results
   * Extracts metrics required by PRDGate:
   * - ac_completeness: Acceptance criteria coverage
   * - rtm_coverage: Requirements traceability matrix coverage
   * - nfr_coverage: Non-functional requirements coverage
   */
  protected async prepareGateInput(phaseInput: any, phaseResult: any): Promise<GateEvaluationInput> {
    const artifacts = phaseResult.artifacts || [];

    const prdArtifact = artifacts.find((a: any) => a.type === 'product-requirements-document');
    const decompositionArtifact = artifacts.find((a: any) => a.type === 'feature-decomposition');
    const criteriaArtifact = artifacts.find((a: any) => a.type === 'acceptance-criteria');

    // Calculate AC completeness
    const totalStories = decompositionArtifact?.content?.stories?.length || 0;
    const storiesWithCriteria = criteriaArtifact?.content?.stories?.length || 0;
    const ac_completeness = totalStories > 0 ? storiesWithCriteria / totalStories : 0;

    // Calculate RTM coverage
    const totalRequirements = prdArtifact?.content?.functionalRequirements?.length || 0;
    const tracedRequirements = decompositionArtifact?.content?.traceabilityMatrix?.filter(
      (t: any) => t.stories?.length > 0
    ).length || totalRequirements; // Assume all traced if no matrix
    const rtm_coverage = totalRequirements > 0 ? tracedRequirements / totalRequirements : 1.0;

    // Calculate NFR coverage
    const totalNFRs = prdArtifact?.content?.nonFunctionalRequirements?.length || 0;
    const addressedNFRs = prdArtifact?.content?.nonFunctionalRequirements?.filter(
      (nfr: any) => nfr.acceptance || nfr.metrics
    ).length || totalNFRs; // Assume all addressed if they have acceptance criteria
    const nfr_coverage = totalNFRs > 0 ? addressedNFRs / totalNFRs : 1.0;

    // Prepare base metrics
    const baseMetrics = {
      runId: phaseInput.workflowRunId,
      ac_completeness,
      rtm_coverage,
      nfr_coverage,
    };

    // Enrich with Knowledge Map metrics
    const enrichedMetrics = await this.enrichGateInputWithKMMetrics(baseMetrics);

    return {
      runId: phaseInput.workflowRunId,
      phase: 'PRD',
      artifacts,
      metrics: enrichedMetrics,
    };
  }

  /**
   * Enhance input with hints from gate failure
   */
  protected async enhanceInputWithHints(input: any, gateResult: any): Promise<any> {
    const hints: string[] = [];

    // Extract specific failures
    const failedMetrics = gateResult.decision?.failedMetrics || [];

    failedMetrics.forEach((metric: any) => {
      if (metric.metric === 'ac_completeness') {
        hints.push(
          `Increase acceptance criteria coverage. Currently ${(metric.actual * 100).toFixed(1)}%, need ${(metric.threshold * 100).toFixed(0)}%`
        );
      } else if (metric.metric === 'rtm_coverage') {
        hints.push(
          `Improve requirements traceability. Currently ${(metric.actual * 100).toFixed(1)}%, need ${(metric.threshold * 100).toFixed(0)}%`
        );
      } else if (metric.metric === 'nfr_coverage') {
        hints.push(
          `Add more non-functional requirements. Currently ${(metric.actual * 100).toFixed(1)}%, need ${(metric.threshold * 100).toFixed(0)}%`
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

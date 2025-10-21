import {
  PhaseCoordinator,
  PhaseInput,
  AggregatedResult,
  PhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/phase-coordinator';
import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';
import { PRDWriterAgent } from './prd-writer-agent';
import { FeatureDecomposerAgent } from './feature-decomposer-agent';
import { AcceptanceCriteriaWriterAgent } from './acceptance-criteria-writer-agent';

/**
 * Load PRD agent configurations from YAML
 */
async function loadPRDAgentConfigs() {
  const { loadAgentConfig } = await import('../config/loader');
  return loadAgentConfig('prd-agents.yaml');
}

/**
 * PRDPhaseCoordinator
 *
 * Orchestrates 3 parallel agents in the PRD phase:
 * 1. PRDWriterAgent - Comprehensive Product Requirements Document
 * 2. FeatureDecomposerAgent - Epics and user stories
 * 3. AcceptanceCriteriaWriterAgent - Acceptance criteria for stories
 *
 * Performance: 10-15s (vs 30-40s sequential) - 3x faster!
 *
 * Usage:
 * ```typescript
 * const coordinator = new PRDPhaseCoordinator({
 *   budget: { maxCostUsd: 1.8, maxTokens: 45000 },
 * });
 *
 * const result = await coordinator.execute({
 *   workflowRunId: 'run-123',
 *   userId: 'user-456',
 *   projectId: 'proj-789',
 *   previousArtifacts: [ideaSpec, strategy, competitive, critique, ...],
 *   ideaSpec: {...},
 * });
 * ```
 */
export class PRDPhaseCoordinator extends PhaseCoordinator {
  private prdWriterAgent?: PRDWriterAgent;
  private featureDecomposerAgent?: FeatureDecomposerAgent;
  private acceptanceCriteriaAgent?: AcceptanceCriteriaWriterAgent;

  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'PRD',
      budget: config?.budget || {
        maxCostUsd: 1.8,
        maxTokens: 45000,
      },
      minRequiredAgents: 2, // At least 2 of 3 agents must succeed
      maxConcurrency: 3, // All 3 can run in parallel
      eventPublisher: config?.eventPublisher,
    });
  }

  /**
   * Initialize all 3 PRD agents
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    console.log('[PRDCoordinator] Loading agent configurations');

    const configs = await loadPRDAgentConfigs();

    const prdWriterConfig = configs.find((c) => c.id === 'prd-writer-agent');
    const featureDecomposerConfig = configs.find((c) => c.id === 'prd-feature-decomposer-agent');
    const acceptanceCriteriaConfig = configs.find(
      (c) => c.id === 'prd-acceptance-criteria-agent'
    );

    if (!prdWriterConfig || !featureDecomposerConfig || !acceptanceCriteriaConfig) {
      throw new Error('Failed to load all PRD agent configurations');
    }

    this.prdWriterAgent = new PRDWriterAgent(prdWriterConfig);
    this.featureDecomposerAgent = new FeatureDecomposerAgent(featureDecomposerConfig);
    this.acceptanceCriteriaAgent = new AcceptanceCriteriaWriterAgent(acceptanceCriteriaConfig);

    console.log('[PRDCoordinator] All 3 agents initialized');

    return [this.prdWriterAgent, this.featureDecomposerAgent, this.acceptanceCriteriaAgent];
  }

  /**
   * Prepare input for each agent
   *
   * All agents receive:
   * - IdeaSpec (from INTAKE)
   * - Strategy (from IDEATION)
   * - Competitive (from IDEATION)
   * - Personas (from IDEATION)
   * - Critique (from CRITIQUE)
   */
  protected async prepareAgentInput(
    agent: BaseAgent,
    phaseInput: PhaseInput
  ): Promise<AgentInput> {
    const { ideaSpec, previousArtifacts, workflowRunId, userId, projectId } = phaseInput;

    if (!ideaSpec) {
      throw new Error('IdeaSpec not found in phase input');
    }

    // Extract artifacts from previous phases
    const strategyArtifact = previousArtifacts?.find((a) => a.type === 'product-strategy');
    const competitiveArtifact = previousArtifacts?.find(
      (a) => a.type === 'competitive-analysis'
    );
    const personaArtifact = previousArtifacts?.find((a) => a.type === 'user-personas');
    const critiqueArtifact = previousArtifacts?.find((a) => a.type === 'critique-complete');
    const prdArtifact = previousArtifacts?.find((a) => a.type === 'product-requirements-document');
    const decompositionArtifact = previousArtifacts?.find(
      (a) => a.type === 'feature-decomposition'
    );

    return {
      data: {
        ideaSpec,
        strategy: strategyArtifact?.content || null,
        competitive: competitiveArtifact?.content || null,
        personas: personaArtifact?.content || null,
        critique: critiqueArtifact?.content || null,
        prd: prdArtifact?.content || null, // For acceptance criteria agent
        stories: decompositionArtifact?.content?.stories || null, // For acceptance criteria agent
      },
      context: {
        workflowRunId,
        userId,
        projectId,
        phase: 'PRD',
      },
    };
  }

  /**
   * Aggregate results from all successful agents
   *
   * Creates a comprehensive PRD artifact combining:
   * - Product Requirements Document
   * - Feature decomposition (epics and stories)
   * - Acceptance criteria
   */
  protected async aggregateResults(
    successes: AgentOutput[],
    failures: Error[],
    phaseInput: PhaseInput
  ): Promise<AggregatedResult> {
    console.log('[PRDCoordinator] Aggregating results from agents');

    const artifacts: any[] = [];
    let totalCost = 0;

    // Collect all artifacts from successful agents
    successes.forEach((output) => {
      if (output.artifacts) {
        artifacts.push(...output.artifacts);
      }
      totalCost += output.cost || 0;
    });

    // Extract each artifact type
    const prdArtifact = artifacts.find((a) => a.type === 'product-requirements-document');
    const decompositionArtifact = artifacts.find((a) => a.type === 'feature-decomposition');
    const criteriaArtifact = artifacts.find((a) => a.type === 'acceptance-criteria');

    // Calculate metrics
    const totalFunctionalReqs = prdArtifact?.content?.functionalRequirements?.length || 0;
    const totalStories = decompositionArtifact?.content?.stories?.length || 0;
    const totalStoryPoints = decompositionArtifact?.content?.totalStoryPoints || 0;
    const totalCriteria = criteriaArtifact?.content?.coverageMetrics?.totalCriteria || 0;
    const testabilityScore = criteriaArtifact?.content?.coverageMetrics?.testabilityScore || 0;

    // Create aggregated PRD artifact
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
          completeness: successes.length / 3, // 0.67 = 2/3 agents succeeded
        },
        completeness: successes.length / 3,
        failedAgents: failures.length,
        timestamp: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };

    console.log(`[PRDCoordinator] Aggregation complete: ${successes.length}/3 agents succeeded`);
    console.log(
      `[PRDCoordinator] Generated ${totalStories} stories (${totalStoryPoints} points), ${totalCriteria} acceptance criteria`
    );

    return {
      artifacts: [...artifacts, aggregatedArtifact],
      totalCost,
    };
  }
}

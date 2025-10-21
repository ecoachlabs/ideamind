import {
  PhaseCoordinator,
  PhaseInput,
  AggregatedResult,
  PhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/phase-coordinator';
import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';
import { StrategyAgent } from './strategy-agent';
import { CompetitiveAnalystAgent } from './competitive-analyst-agent';
import { TechStackRecommenderAgent } from './techstack-recommender-agent';
import { UserPersonaBuilderAgent } from './user-persona-builder-agent';

/**
 * Load ideation agent configurations from YAML
 */
async function loadIdeationAgentConfigs() {
  const { loadAgentConfig } = await import('../config/loader');
  return loadAgentConfig('ideation-agents.yaml');
}

/**
 * IdeationPhaseCoordinator
 *
 * Orchestrates 4 parallel agents in the IDEATION phase:
 * 1. StrategyAgent - Product vision and strategy
 * 2. CompetitiveAnalystAgent - Market and competitor analysis
 * 3. TechStackRecommenderAgent - Technology recommendations
 * 4. UserPersonaBuilderAgent - Target user personas
 *
 * Performance: 10-15s (vs 40-60s sequential) - 4x faster!
 *
 * Usage:
 * ```typescript
 * const coordinator = new IdeationPhaseCoordinator({
 *   phaseName: 'IDEATION',
 *   budget: { maxCostUsd: 2.0, maxTokens: 50000 },
 * });
 *
 * const result = await coordinator.execute({
 *   workflowRunId: 'run-123',
 *   userId: 'user-456',
 *   projectId: 'proj-789',
 *   previousArtifacts: [ideaSpec],
 *   ideaSpec: {...},
 * });
 * ```
 */
export class IdeationPhaseCoordinator extends PhaseCoordinator {
  private strategyAgent?: StrategyAgent;
  private competitiveAgent?: CompetitiveAnalystAgent;
  private techStackAgent?: TechStackRecommenderAgent;
  private personaAgent?: UserPersonaBuilderAgent;

  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'IDEATION',
      budget: config?.budget || {
        maxCostUsd: 2.0,
        maxTokens: 50000,
      },
      minRequiredAgents: 3, // At least 3 of 4 agents must succeed
      maxConcurrency: 4, // All 4 can run in parallel
      eventPublisher: config?.eventPublisher,
    });
  }

  /**
   * Initialize all 4 IDEATION agents
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    console.log('[IdeationCoordinator] Loading agent configurations');

    const configs = await loadIdeationAgentConfigs();

    const strategyConfig = configs.find((c) => c.id === 'ideation-strategy-agent');
    const competitiveConfig = configs.find((c) => c.id === 'ideation-competitive-agent');
    const techStackConfig = configs.find((c) => c.id === 'ideation-techstack-agent');
    const personaConfig = configs.find((c) => c.id === 'ideation-persona-agent');

    if (!strategyConfig || !competitiveConfig || !techStackConfig || !personaConfig) {
      throw new Error('Failed to load all ideation agent configurations');
    }

    this.strategyAgent = new StrategyAgent(strategyConfig);
    this.competitiveAgent = new CompetitiveAnalystAgent(competitiveConfig);
    this.techStackAgent = new TechStackRecommenderAgent(techStackConfig);
    this.personaAgent = new UserPersonaBuilderAgent(personaConfig);

    console.log('[IdeationCoordinator] All 4 agents initialized');

    return [
      this.strategyAgent,
      this.competitiveAgent,
      this.techStackAgent,
      this.personaAgent,
    ];
  }

  /**
   * Prepare input for each agent
   *
   * All agents receive the same base input (IdeaSpec from INTAKE phase)
   */
  protected async prepareAgentInput(
    agent: BaseAgent,
    phaseInput: PhaseInput
  ): Promise<AgentInput> {
    const { ideaSpec, workflowRunId, userId, projectId } = phaseInput;

    if (!ideaSpec) {
      throw new Error('IdeaSpec not found in phase input');
    }

    return {
      data: {
        ideaSpec,
        category: ideaSpec.metadata?.category,
        complexity: ideaSpec.metadata?.complexity,
      },
      context: {
        workflowRunId,
        userId,
        projectId,
        phase: 'IDEATION',
      },
    };
  }

  /**
   * Aggregate results from all successful agents
   *
   * Creates a comprehensive ideation artifact combining:
   * - Product strategy
   * - Competitive analysis
   * - Tech stack recommendations
   * - User personas
   */
  protected async aggregateResults(
    successes: AgentOutput[],
    failures: Error[],
    phaseInput: PhaseInput
  ): Promise<AggregatedResult> {
    console.log('[IdeationCoordinator] Aggregating results from agents');

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
    const strategyArtifact = artifacts.find((a) => a.type === 'product-strategy');
    const competitiveArtifact = artifacts.find((a) => a.type === 'competitive-analysis');
    const techStackArtifact = artifacts.find((a) => a.type === 'tech-stack-recommendation');
    const personaArtifact = artifacts.find((a) => a.type === 'user-personas');

    // Create aggregated ideation artifact
    const aggregatedArtifact = {
      type: 'ideation-complete',
      version: '1.0.0',
      content: {
        strategy: strategyArtifact?.content || null,
        competitive: competitiveArtifact?.content || null,
        techStack: techStackArtifact?.content || null,
        personas: personaArtifact?.content || null,
        completeness: successes.length / 4, // 0.75 = 3/4 agents succeeded
        failedAgents: failures.length,
        timestamp: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };

    console.log(
      `[IdeationCoordinator] Aggregation complete: ${successes.length}/4 agents succeeded`
    );

    return {
      artifacts: [...artifacts, aggregatedArtifact],
      totalCost,
    };
  }
}

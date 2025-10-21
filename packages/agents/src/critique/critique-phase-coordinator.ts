import {
  PhaseCoordinator,
  PhaseInput,
  AggregatedResult,
  PhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/phase-coordinator';
import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';
import { RedTeamAgent } from './redteam-agent';
import { RiskAnalyzerAgent } from './risk-analyzer-agent';
import { AssumptionChallengerAgent } from './assumption-challenger-agent';

/**
 * Load critique agent configurations from YAML
 */
async function loadCritiqueAgentConfigs() {
  const { loadAgentConfig } = await import('../config/loader');
  return loadAgentConfig('critique-agents.yaml');
}

/**
 * CritiquePhaseCoordinator
 *
 * Orchestrates 3 parallel agents in the CRITIQUE phase:
 * 1. RedTeamAgent - Adversarial analysis to find weaknesses
 * 2. RiskAnalyzerAgent - Systematic risk identification and scoring
 * 3. AssumptionChallengerAgent - Challenge implicit/explicit assumptions
 *
 * Performance: 10-15s (vs 30-45s sequential) - 3x faster!
 *
 * Usage:
 * ```typescript
 * const coordinator = new CritiquePhaseCoordinator({
 *   budget: { maxCostUsd: 1.5, maxTokens: 40000 },
 * });
 *
 * const result = await coordinator.execute({
 *   workflowRunId: 'run-123',
 *   userId: 'user-456',
 *   projectId: 'proj-789',
 *   previousArtifacts: [ideaSpec, strategy, competitive, ...],
 *   ideaSpec: {...},
 * });
 * ```
 */
export class CritiquePhaseCoordinator extends PhaseCoordinator {
  private redteamAgent?: RedTeamAgent;
  private riskAgent?: RiskAnalyzerAgent;
  private assumptionAgent?: AssumptionChallengerAgent;

  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'CRITIQUE',
      budget: config?.budget || {
        maxCostUsd: 1.5,
        maxTokens: 40000,
      },
      minRequiredAgents: 2, // At least 2 of 3 agents must succeed
      maxConcurrency: 3, // All 3 can run in parallel
      eventPublisher: config?.eventPublisher,
    });
  }

  /**
   * Initialize all 3 CRITIQUE agents
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    console.log('[CritiqueCoordinator] Loading agent configurations');

    const configs = await loadCritiqueAgentConfigs();

    const redteamConfig = configs.find((c) => c.id === 'critique-redteam-agent');
    const riskConfig = configs.find((c) => c.id === 'critique-risk-agent');
    const assumptionConfig = configs.find((c) => c.id === 'critique-assumption-agent');

    if (!redteamConfig || !riskConfig || !assumptionConfig) {
      throw new Error('Failed to load all critique agent configurations');
    }

    this.redteamAgent = new RedTeamAgent(redteamConfig);
    this.riskAgent = new RiskAnalyzerAgent(riskConfig);
    this.assumptionAgent = new AssumptionChallengerAgent(assumptionConfig);

    console.log('[CritiqueCoordinator] All 3 agents initialized');

    return [this.redteamAgent, this.riskAgent, this.assumptionAgent];
  }

  /**
   * Prepare input for each agent
   *
   * All agents receive:
   * - IdeaSpec (from INTAKE phase)
   * - Strategy (from IDEATION phase)
   * - Competitive analysis (from IDEATION phase)
   * - Tech stack (from IDEATION phase)
   * - Personas (from IDEATION phase)
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
    const techStackArtifact = previousArtifacts?.find(
      (a) => a.type === 'tech-stack-recommendation'
    );
    const personaArtifact = previousArtifacts?.find((a) => a.type === 'user-personas');

    return {
      data: {
        ideaSpec,
        strategy: strategyArtifact?.content || null,
        competitive: competitiveArtifact?.content || null,
        techStack: techStackArtifact?.content || null,
        personas: personaArtifact?.content || null,
      },
      context: {
        workflowRunId,
        userId,
        projectId,
        phase: 'CRITIQUE',
      },
    };
  }

  /**
   * Aggregate results from all successful agents
   *
   * Creates a comprehensive critique artifact combining:
   * - Red team findings (weaknesses and flaws)
   * - Risk analysis (systematic risk identification)
   * - Assumption challenges (questioned assumptions)
   */
  protected async aggregateResults(
    successes: AgentOutput[],
    failures: Error[],
    phaseInput: PhaseInput
  ): Promise<AggregatedResult> {
    console.log('[CritiqueCoordinator] Aggregating results from agents');

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
    const redteamArtifact = artifacts.find((a) => a.type === 'redteam-analysis');
    const riskArtifact = artifacts.find((a) => a.type === 'risk-analysis');
    const assumptionArtifact = artifacts.find((a) => a.type === 'assumption-analysis');

    // Calculate overall critique metrics
    const criticalFindings =
      (redteamArtifact?.content?.findings?.filter(
        (f: any) => f.severity === 'critical' || f.severity === 'high'
      ).length || 0) +
      (riskArtifact?.content?.riskSummary?.criticalRisks || 0) +
      (riskArtifact?.content?.riskSummary?.highRisks || 0);

    const criticalAssumptions =
      assumptionArtifact?.content?.criticalAssumptions?.length || 0;

    // Determine overall recommendation
    const redteamRec = redteamArtifact?.content?.overallAssessment?.recommendation;
    const riskLevel = riskArtifact?.content?.riskSummary?.overallRiskLevel;
    const assumptionHealth = assumptionArtifact?.content?.assumptionHealthScore || 60;

    let overallRecommendation: 'proceed' | 'proceed-with-caution' | 'major-revisions-needed' | 'stop' = 'proceed';

    if (redteamRec === 'stop' || riskLevel === 'critical' || assumptionHealth < 30) {
      overallRecommendation = 'major-revisions-needed';
    } else if (
      redteamRec === 'major-revisions-needed' ||
      riskLevel === 'high' ||
      criticalFindings >= 5 ||
      assumptionHealth < 50
    ) {
      overallRecommendation = 'proceed-with-caution';
    } else if (criticalFindings > 0 || criticalAssumptions > 3) {
      overallRecommendation = 'proceed-with-caution';
    }

    // Create aggregated critique artifact
    const aggregatedArtifact = {
      type: 'critique-complete',
      version: '1.0.0',
      content: {
        redteam: redteamArtifact?.content || null,
        risks: riskArtifact?.content || null,
        assumptions: assumptionArtifact?.content || null,
        summary: {
          overallRecommendation,
          criticalFindings,
          criticalAssumptions,
          redteamViability: redteamArtifact?.content?.overallAssessment?.viabilityScore || 0,
          riskLevel: riskLevel || 'medium',
          assumptionHealth: assumptionHealth,
          reasoning: this.generateSummaryReasoning(
            overallRecommendation,
            criticalFindings,
            criticalAssumptions,
            assumptionHealth
          ),
        },
        completeness: successes.length / 3, // 0.67 = 2/3 agents succeeded
        failedAgents: failures.length,
        timestamp: new Date().toISOString(),
      },
      generatedAt: new Date().toISOString(),
    };

    console.log(
      `[CritiqueCoordinator] Aggregation complete: ${successes.length}/3 agents succeeded`
    );
    console.log(
      `[CritiqueCoordinator] Overall recommendation: ${overallRecommendation}`
    );

    return {
      artifacts: [...artifacts, aggregatedArtifact],
      totalCost,
    };
  }

  /**
   * Generate human-readable summary reasoning
   */
  private generateSummaryReasoning(
    recommendation: string,
    criticalFindings: number,
    criticalAssumptions: number,
    assumptionHealth: number
  ): string {
    if (recommendation === 'major-revisions-needed') {
      return `Critical issues identified (${criticalFindings} high/critical findings, ${criticalAssumptions} critical assumptions). Major revisions required before proceeding.`;
    } else if (recommendation === 'proceed-with-caution') {
      return `Some concerns identified (${criticalFindings} high/critical findings, assumption health: ${assumptionHealth}/100). Proceed with caution and address key issues.`;
    } else {
      return `Overall analysis is positive with manageable risks. Proceed with monitoring identified concerns.`;
    }
  }
}

import { v4 as uuidv4 } from 'uuid';
import {
  BaseAgent,
  AgentConfig,
  AgentInput,
  ExecutionPlan,
  ReasoningResult,
} from '@ideamine/agent-sdk';
import { IdeaSpec, ArtifactType } from '@ideamine/artifact-schemas';

/**
 * Intake Classifier Agent
 *
 * Responsibilities:
 * 1. Parse and validate idea submission
 * 2. Classify idea type (MVP, feature, enhancement, research)
 * 3. Extract key entities (users, problems, solutions)
 * 4. Estimate complexity and timeline
 * 5. Generate intake summary artifact
 *
 * This is an example implementation demonstrating the Analyzer-inside-Agent pattern.
 */
export class IntakeClassifierAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  /**
   * PLANNER: Create execution plan for intake classification
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    console.log('[IntakeClassifierAgent] Planning intake classification...');

    return {
      steps: [
        {
          id: 'parse-idea',
          description: 'Parse and validate idea spec from input',
          estimatedCostUsd: 0.01,
        },
        {
          id: 'classify-type',
          description: 'Classify idea type and scope',
          estimatedCostUsd: 0.02,
        },
        {
          id: 'extract-entities',
          description: 'Extract key entities and concepts',
          estimatedCostUsd: 0.02,
        },
        {
          id: 'estimate-complexity',
          description: 'Estimate complexity and timeline',
          estimatedCostUsd: 0.02,
        },
        {
          id: 'generate-summary',
          description: 'Generate intake summary artifact',
          estimatedCostUsd: 0.01,
        },
      ],
      approach:
        'Use LLM to analyze idea spec, classify type, extract entities, and estimate complexity',
      alternatives: [
        'Use template-based classification (faster but less accurate)',
        'Use hybrid approach with rules + LLM for edge cases',
      ],
    };
  }

  /**
   * REASONING: Initial classification without tools
   */
  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    console.log('[IntakeClassifierAgent] Performing initial reasoning...');

    // TODO: In real implementation, this would:
    // 1. Load idea spec from artifacts
    // 2. Call LLM to classify and analyze
    // 3. Parse LLM response into structured data

    // For now, simulate LLM reasoning
    const simulatedAnalysis = {
      ideaType: 'MVP', // MVP, feature, enhancement, research
      scope: 'medium', // small, medium, large, enterprise
      targetUsers: ['developers', 'product teams'],
      problemDomain: 'software development automation',
      proposedSolution: 'autonomous development platform',
      keyFeatures: [
        '12-phase pipeline',
        'AI agents for each phase',
        'Quality gates',
        'Cost tracking',
      ],
      estimatedComplexity: 'high',
      estimatedTimelineWeeks: 38,
      confidence: 0.75,
      reasoning:
        'This is a complex MVP requiring custom orchestration, multiple agents, and integration with various tools and services. Medium confidence due to lack of specific technical constraints in idea spec.',
    };

    const needsImprovement = simulatedAnalysis.confidence < 0.85;

    return {
      content: JSON.stringify(simulatedAnalysis, null, 2),
      confidence: simulatedAnalysis.confidence,
      needsImprovement,
      reasoning:
        'Initial classification complete. Consider using competitive analysis tool to improve confidence.',
    };
  }

  /**
   * Generate final artifacts from reasoning result
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<Array<{ type: string; content: unknown }>> {
    console.log('[IntakeClassifierAgent] Generating intake summary artifact...');

    // Parse the reasoning result
    const analysis = JSON.parse(result.content);

    // Create intake summary artifact
    const intakeSummary = {
      artifactId: uuidv4(),
      type: ArtifactType.INTAKE_SUMMARY,
      workflowRunId: input.workflowRunId,
      phase: input.phase,
      createdBy: this.config.agentId,
      data: {
        classification: {
          ideaType: analysis.ideaType,
          scope: analysis.scope,
          complexity: analysis.estimatedComplexity,
        },
        analysis: {
          targetUsers: analysis.targetUsers,
          problemDomain: analysis.problemDomain,
          proposedSolution: analysis.proposedSolution,
          keyFeatures: analysis.keyFeatures,
        },
        estimates: {
          timelineWeeks: analysis.estimatedTimelineWeeks,
          confidence: analysis.confidence,
        },
        recommendations: {
          nextPhase: 'ideation',
          requiredTools: ['competitive-analysis', 'tech-stack-analyzer'],
          riskFactors: [
            'Complex distributed system',
            'Multiple integrations',
            'AI/ML components',
          ],
        },
      },
      metadata: {
        agentVersion: '0.1.0',
        timestamp: new Date().toISOString(),
      },
    };

    return [
      {
        type: ArtifactType.INTAKE_SUMMARY,
        content: intakeSummary,
      },
    ];
  }
}

/**
 * Factory function to create IntakeClassifierAgent with default config
 */
export function createIntakeClassifierAgent(): IntakeClassifierAgent {
  const config: AgentConfig = {
    agentId: 'intake-classifier-001',
    agentType: 'IntakeClassifierAgent',
    phase: 'intake',
    toolPolicy: {
      allowedTools: ['competitive-analysis', 'market-research', 'tech-stack-analyzer'],
      maxToolInvocations: 3,
      maxToolCostUsd: 1.0,
      voiThreshold: 0.4,
      requireApproval: false,
    },
    llmConfig: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 2000,
    },
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
    },
  };

  return new IntakeClassifierAgent(config);
}

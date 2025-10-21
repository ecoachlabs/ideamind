/**
 * EnhancedCritiquePhaseCoordinator
 *
 * Complete Level-2 integration example demonstrating:
 * - EnhancedPhaseCoordinator with CritiqueGate
 * - Recorder for comprehensive logging
 * - Dispatcher for event-driven coordination
 * - Automatic retry on gate failure with hints
 *
 * Gate Requirements (CritiqueGate):
 * - unresolved_criticals = 0
 * - confidence ≥ 0.7
 * - counterfactuals ≥ 5
 *
 * Auto-retry behavior:
 * - Gate fails → Extract hints from failed metrics
 * - Re-execute agents with enhanced input
 * - Max 2 retries (3 total attempts)
 */

import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';
import {
  EnhancedPhaseCoordinator,
  type EnhancedPhaseCoordinatorConfig,
  type PhaseInput,
  type PhaseOutput,
  type GateEvaluationInput,
  type GateEvaluationResult,
  CritiqueGate,
  Recorder,
  InMemoryRecorderStorage,
  Dispatcher,
} from '@ideamine/orchestrator-core';
import { RedTeamAgent } from './red-team-agent';
import { RiskAnalyzerAgent } from './risk-analyzer-agent';
import { AssumptionChallengerAgent } from './assumption-challenger-agent';

/**
 * Enhanced Critique Phase Coordinator with full Level-2 integration
 */
export class EnhancedCritiquePhaseCoordinator extends EnhancedPhaseCoordinator {
  constructor(config?: Partial<EnhancedPhaseCoordinatorConfig>) {
    // Setup infrastructure
    const recorder = config?.recorder || new Recorder(new InMemoryRecorderStorage());

    const dispatcher = config?.dispatcher || new Dispatcher(
      {
        maxConcurrency: 10,
        maxQueueSize: 1000,
        deadLetterAfterRetries: 3,
        backPressure: {
          enabled: true,
          threshold: 0.8,
          maxDelay: 5000,
        },
      },
      recorder
    );

    const gatekeeper = config?.gatekeeper || new CritiqueGate(recorder);

    super({
      phaseName: 'CRITIQUE',
      budget: {
        maxCostUsd: config?.budget?.maxCostUsd || 1.5,
        maxTokens: config?.budget?.maxTokens || 40000,
      },
      minRequiredAgents: 3, // All 3 agents must succeed
      maxConcurrency: 3, // Parallel execution
      gatekeeper,
      recorder,
      dispatcher,
      maxGateRetries: 2,
      autoRetryOnGateFail: true,
      ...config,
    });
  }

  /**
   * Initialize CRITIQUE phase agents
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    return [
      new RedTeamAgent({
        id: 'red-team-agent',
        phase: 'CRITIQUE',
        budget: this.getAgentBudget(),
      }),
      new RiskAnalyzerAgent({
        id: 'risk-analyzer-agent',
        phase: 'CRITIQUE',
        budget: this.getAgentBudget(),
      }),
      new AssumptionChallengerAgent({
        id: 'assumption-challenger-agent',
        phase: 'CRITIQUE',
        budget: this.getAgentBudget(),
      }),
    ];
  }

  /**
   * Prepare agent input
   */
  protected async prepareAgentInput(
    agent: BaseAgent,
    phaseInput: PhaseInput
  ): Promise<AgentInput> {
    // Find IdeaSpec from previous phases
    const ideaSpec = phaseInput.previousArtifacts.find((a: any) => a.type === 'idea-spec');

    // Check for gate hints from previous retry
    const gateHints = (phaseInput as any).gateHints;

    return {
      workflowRunId: phaseInput.workflowRunId,
      data: {
        ideaSpec,
        discoveryPack: phaseInput.previousArtifacts.find(
          (a: any) => a.type === 'discovery-pack'
        ),
        gateHints, // Provide hints from gate failure
      },
      budget: {
        maxCostUsd: this.getAgentBudget().maxCostUsd,
        maxTokens: this.getAgentBudget().maxTokens,
        currentCostUsd: 0,
      },
      metadata: {
        userId: phaseInput.userId,
        projectId: phaseInput.projectId,
        phase: 'CRITIQUE',
      },
    };
  }

  /**
   * Aggregate results from all critique agents
   */
  protected async aggregateResults(
    successes: AgentOutput[],
    failures: Error[],
    phaseInput: PhaseInput
  ): Promise<{ artifacts: any[]; totalCost: number }> {
    // Collect all artifacts
    const allArtifacts = successes.flatMap((s) => s.artifacts || []);

    // Extract critique-specific artifacts
    const critiqueReport = allArtifacts.find((a) => a.type === 'critique-report');
    const riskAnalysis = allArtifacts.find((a) => a.type === 'risk-analysis');
    const assumptionChallenge = allArtifacts.find((a) => a.type === 'assumption-challenge');

    // Calculate total cost
    const totalCost = successes.reduce((sum, s) => sum + (s.costUsd || 0), 0);

    // Record aggregation
    await this.getRecorder().recordStep({
      runId: phaseInput.workflowRunId,
      phase: 'CRITIQUE',
      step: 'coordinator.aggregate',
      actor: 'Coordinator:CRITIQUE',
      inputs: allArtifacts.map((a) => a.type),
      outputs: ['critique-complete'],
      cost: { usd: totalCost, tokens: 0 },
      latency_ms: 0,
      status: 'succeeded',
      metadata: {
        successCount: successes.length,
        failureCount: failures.length,
      },
    });

    return {
      artifacts: [
        ...allArtifacts,
        {
          type: 'critique-complete',
          content: {
            critiqueReport,
            riskAnalysis,
            assumptionChallenge,
            summary: {
              totalCritiques: allArtifacts.length,
              successfulAgents: successes.length,
              failedAgents: failures.length,
            },
          },
        },
      ],
      totalCost,
    };
  }

  /**
   * Prepare gate evaluation input
   */
  protected async prepareGateInput(
    phaseInput: PhaseInput,
    phaseResult: PhaseOutput
  ): Promise<GateEvaluationInput> {
    // Extract metrics from artifacts
    const artifacts = phaseResult.artifacts || [];

    const critiqueReport = artifacts.find((a: any) => a.type === 'critique-report');
    const riskAnalysis = artifacts.find((a: any) => a.type === 'risk-analysis');
    const counterfactuals = artifacts.filter(
      (a: any) => a.type === 'counterfactual' || a.type === 'counterfactuals'
    );

    // Calculate metrics for gate evaluation
    const unresolvedCriticals =
      critiqueReport?.content?.criticalIssues?.filter((i: any) => !i.resolved)?.length || 0;

    const confidence =
      (critiqueReport?.content?.confidence || 0.5 +
        riskAnalysis?.content?.confidence || 0.5) / 2;

    const counterfactualCount =
      counterfactuals.length > 0
        ? counterfactuals[0]?.content?.scenarios?.length || 0
        : 0;

    const metrics = {
      unresolved_criticals: unresolvedCriticals,
      confidence: confidence,
      counterfactuals: counterfactualCount,
    };

    console.log(
      `[CritiqueCoordinator] Gate metrics:`,
      `criticals=${unresolvedCriticals}, confidence=${confidence.toFixed(2)}, counterfactuals=${counterfactualCount}`
    );

    return {
      runId: phaseInput.workflowRunId,
      phase: 'CRITIQUE',
      artifacts,
      metrics,
    };
  }

  /**
   * Enhance input with hints from gate failure
   */
  protected async enhanceInputWithHints(
    input: PhaseInput,
    gateResult: GateEvaluationResult
  ): Promise<PhaseInput> {
    const failedMetrics = gateResult.metricResults.filter((m) => !m.passed);

    // Build specific hints for each failed metric
    const hints: any = {
      retryReason: 'Gate evaluation failed - improving specific metrics',
      failedMetrics: failedMetrics.map((m) => ({
        metric: m.metricName,
        actual: m.actualValue,
        required: m.threshold,
        gap: typeof m.threshold === 'number' && typeof m.actualValue === 'number'
          ? m.threshold - (m.actualValue as number)
          : 'N/A',
      })),
      requiredActions: gateResult.decision.requiredActions || [],
      recommendations: gateResult.recommendations,
    };

    // Specific guidance based on failed metrics
    if (failedMetrics.find((m) => m.metricId === 'unresolved_criticals')) {
      hints.criticalsFocus = 'Focus on resolving all critical issues identified';
    }

    if (failedMetrics.find((m) => m.metricId === 'confidence')) {
      hints.confidenceFocus = 'Provide more thorough analysis to increase confidence';
    }

    if (failedMetrics.find((m) => m.metricId === 'counterfactuals')) {
      const current = failedMetrics.find((m) => m.metricId === 'counterfactuals')?.actualValue;
      const required = failedMetrics.find((m) => m.metricId === 'counterfactuals')?.threshold;
      hints.counterfactualsFocus = `Generate ${(required as number) - (current as number)} more counterfactual scenarios`;
    }

    console.log(`[CritiqueCoordinator] Retrying with hints:`, hints);

    // Record retry decision
    await this.getRecorder().recordDecision({
      runId: input.workflowRunId,
      phase: 'CRITIQUE',
      actor: 'Coordinator:CRITIQUE',
      decisionType: 'retry',
      inputs: { gateResult: gateResult.status, failedMetrics: failedMetrics.length },
      outputs: { hints },
      reasoning: `Gate failed: ${gateResult.decision.reasons.join('; ')}. Retrying with specific improvement hints.`,
    });

    return {
      ...input,
      gateHints: hints,
    };
  }
}

/**
 * Usage Example:
 *
 * ```typescript
 * const coordinator = new EnhancedCritiquePhaseCoordinator();
 *
 * const result = await coordinator.execute({
 *   workflowRunId: 'run-123',
 *   userId: 'user-456',
 *   projectId: 'project-789',
 *   previousArtifacts: [ideaSpec, discoveryPack],
 * });
 *
 * if (result.success) {
 *   console.log('Critique phase passed gate!');
 *   console.log('Artifacts:', result.artifacts);
 * } else {
 *   console.log('Critique phase failed:', result.error);
 * }
 *
 * // Query metrics
 * const recorder = coordinator.getRecorder();
 * const summary = await recorder.getRunSummary('run-123');
 * console.log('Total cost:', summary.totalCost);
 * console.log('Phase metrics:', summary.phaseMetrics.CRITIQUE);
 * ```
 */

/**
 * Enhanced Architecture Phase Coordinator with Level-2 Infrastructure Integration
 *
 * Integrates:
 * - ArchitectureGate for architecture quality enforcement
 * - Recorder for comprehensive logging
 * - Dispatcher for event-driven coordination
 * - Supervisor for retry/backoff/circuit breaker
 *
 * Gate Requirements:
 * - ADR completeness ≥ 0.95
 * - Unreviewed tech choices = 0
 * - Schema coverage = 100%
 */

import {
  EnhancedPhaseCoordinator,
  type EnhancedPhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/enhanced-phase-coordinator';
import {
  Recorder,
  InMemoryRecorderStorage,
  Dispatcher,
  ArchitectureGate,
  type GateEvaluationInput,
  PHASE_GATE_MAPPING,
} from '@ideamine/orchestrator-core';
import { BaseAgent } from '../base/base-agent';
import { PhaseInput, Artifact } from '../base/types';
import { SolutionArchitectAgent } from './solution-architect-agent';
import { APIDesignerAgent } from './api-designer-agent';
import { DataModelerAgent } from './data-modeler-agent';
import { InfrastructurePlannerAgent } from './infrastructure-planner-agent';
import { loadAgentConfig } from '../config/config-loader';

export class EnhancedArchPhaseCoordinator extends EnhancedPhaseCoordinator {
  private solutionArchitectAgent?: SolutionArchitectAgent;
  private apiDesignerAgent?: APIDesignerAgent;
  private dataModelerAgent?: DataModelerAgent;
  private infrastructurePlannerAgent?: InfrastructurePlannerAgent;

  constructor(config?: Partial<EnhancedPhaseCoordinatorConfig>) {
    const phaseConfig = PHASE_GATE_MAPPING.ARCH;
    const recorder = config?.recorder || new Recorder(new InMemoryRecorderStorage());
    const dispatcher = config?.dispatcher || new Dispatcher({ maxConcurrency: 10 }, recorder);
    const gatekeeper = config?.gatekeeper || new ArchitectureGate(recorder);

    super({
      phaseName: 'ARCH',
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

    const solutionArchitectConfig = await loadAgentConfig('arch', 'solution-architect');
    const apiDesignerConfig = await loadAgentConfig('arch', 'api-designer');
    const dataModelerConfig = await loadAgentConfig('arch', 'data-modeler');
    const infrastructurePlannerConfig = await loadAgentConfig('arch', 'infrastructure-planner');

    this.solutionArchitectAgent = new SolutionArchitectAgent(solutionArchitectConfig);
    agents.push(this.solutionArchitectAgent);

    this.apiDesignerAgent = new APIDesignerAgent(apiDesignerConfig);
    agents.push(this.apiDesignerAgent);

    this.dataModelerAgent = new DataModelerAgent(dataModelerConfig);
    agents.push(this.dataModelerAgent);

    this.infrastructurePlannerAgent = new InfrastructurePlannerAgent(infrastructurePlannerConfig);
    agents.push(this.infrastructurePlannerAgent);

    this.logger.info(`Initialized ${agents.length} ARCH agents for parallel execution`);
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

    const systemArchitecture = aggregatedArtifacts.find((a) => a.type === 'system-architecture');
    const apiDesign = aggregatedArtifacts.find((a) => a.type === 'api-design');
    const dataModel = aggregatedArtifacts.find((a) => a.type === 'data-model');
    const infrastructurePlan = aggregatedArtifacts.find((a) => a.type === 'infrastructure-plan');

    const summary = {
      architectureStyle: systemArchitecture?.content?.overview?.architectureStyle || 'monolithic',
      totalADRs: systemArchitecture?.content?.architectureDecisionRecords?.length || 0,
      totalComponents: systemArchitecture?.content?.components?.length || 0,
      totalEntities: dataModel?.content?.entities?.length || 0,
      apiEndpoints: apiDesign?.content?.resources?.reduce(
        (total: number, r: any) => total + (r.endpoints?.length || 0),
        0
      ) || 0,
    };

    const archComplete: Artifact = {
      type: 'arch-complete',
      content: {
        systemArchitecture: systemArchitecture?.content || null,
        apiDesign: apiDesign?.content || null,
        dataModel: dataModel?.content || null,
        infrastructurePlan: infrastructurePlan?.content || null,
        summary,
        agentsCompleted: successes.length,
        agentsFailed: failures.length,
      },
      metadata: {
        phaseId: 'ARCH',
        projectId: phaseInput.projectId,
        workflowRunId: phaseInput.workflowRunId,
        generatedAt: new Date().toISOString(),
      },
    };

    aggregatedArtifacts.push(archComplete);
    return aggregatedArtifacts;
  }

  /**
   * Prepare gate input from phase results
   * Extracts metrics required by ArchitectureGate:
   * - adr_completeness: Percentage of architectural decisions documented
   * - unreviewed_tech_choices: Number of technology choices without ADRs
   * - schema_coverage: Percentage of entities with complete schema definitions
   */
  protected async prepareGateInput(phaseInput: any, phaseResult: any): Promise<GateEvaluationInput> {
    const artifacts = phaseResult.artifacts || [];

    const systemArchitecture = artifacts.find((a: any) => a.type === 'system-architecture');
    const dataModel = artifacts.find((a: any) => a.type === 'data-model');

    const adrs = systemArchitecture?.content?.architectureDecisionRecords || [];
    const technologyStack = systemArchitecture?.content?.technologyStack || [];
    const components = systemArchitecture?.content?.components || [];

    // Count total tech choices
    const totalTechChoices = technologyStack.reduce((count: number, layer: any) => {
      return count + (layer.technologies?.length || 0);
    }, 0);

    // Count ADRs covering tech choices
    const documentedTechChoices = adrs.filter((adr: any) =>
      adr.status === 'accepted' && adr.context?.includes('technology')
    ).length;

    const adr_completeness = components.length > 0 ? adrs.length / Math.max(components.length, 5) : 0;
    const unreviewed_tech_choices = Math.max(0, totalTechChoices - documentedTechChoices);

    // Calculate schema coverage
    const entities = dataModel?.content?.entities || [];
    const entitiesWithSchema = entities.filter((e: any) =>
      e.fields && e.fields.length > 0
    ).length;
    const schema_coverage = entities.length > 0 ? entitiesWithSchema / entities.length : 1.0;

    return {
      runId: phaseInput.workflowRunId,
      phase: 'ARCH',
      artifacts,
      metrics: {
        adr_completeness: Math.min(1.0, adr_completeness),
        unreviewed_tech_choices,
        schema_coverage,
      },
    };
  }

  protected async enhanceInputWithHints(input: any, gateResult: any): Promise<any> {
    const hints: string[] = [];
    const failedMetrics = gateResult.decision?.failedMetrics || [];

    failedMetrics.forEach((metric: any) => {
      if (metric.metric === 'adr_completeness') {
        hints.push(
          `Increase ADR documentation. Currently ${(metric.actual * 100).toFixed(1)}%, need ${(metric.threshold * 100).toFixed(0)}%`
        );
      } else if (metric.metric === 'unreviewed_tech_choices') {
        hints.push(
          `Document all technology choices with ADRs. ${metric.actual} tech choices need review`
        );
      } else if (metric.metric === 'schema_coverage') {
        hints.push(
          `Complete all entity schema definitions. Currently ${(metric.actual * 100).toFixed(1)}%, need 100%`
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

import { BaseAgent } from '../base/base-agent';
import { PhaseCoordinator, PhaseInput, PhaseResult } from '../base/phase-coordinator';
import { PhaseCoordinatorConfig } from '../base/phase-coordinator-config';
import { Artifact } from '../base/types';
import { SolutionArchitectAgent } from './solution-architect-agent';
import { APIDesignerAgent } from './api-designer-agent';
import { DataModelerAgent } from './data-modeler-agent';
import { InfrastructurePlannerAgent } from './infrastructure-planner-agent';
import { loadAgentConfig } from '../config/config-loader';

/**
 * ArchPhaseCoordinator
 *
 * Coordinates the Architecture (ARCH) phase by orchestrating 4 specialized agents in parallel:
 * 1. SolutionArchitectAgent - System architecture design with ADRs
 * 2. APIDesignerAgent - API contracts and endpoint specifications
 * 3. DataModelerAgent - Database schema and entity modeling
 * 4. InfrastructurePlannerAgent - Cloud infrastructure and deployment
 *
 * Phase Requirements:
 * - At least 3 of 4 agents must succeed (75% success rate)
 * - All 4 agents run in parallel for 4x speedup
 * - Generates aggregated arch-complete artifact
 *
 * Performance:
 * - Sequential execution: ~48-60 seconds (4 agents × 12-15s each)
 * - Parallel execution: ~12-15 seconds (4x speedup)
 *
 * Input Requirements:
 * - IdeaSpec with technical preferences and constraints
 * - Previous artifacts from PRD phase (prd-complete)
 * - Previous artifacts from BIZDEV phase (bizdev-complete)
 * - Optional: Competitive analysis, user personas
 *
 * Output Artifacts:
 * - system-architecture: Architecture style, components, ADRs, security
 * - api-design: RESTful/GraphQL API with endpoints and schemas
 * - data-model: Database schema with entities, relationships, indexes
 * - infrastructure-plan: Cloud infrastructure with cost estimates
 * - arch-complete: Aggregated architecture documentation
 */
export class ArchPhaseCoordinator extends PhaseCoordinator {
  private solutionArchitectAgent?: SolutionArchitectAgent;
  private apiDesignerAgent?: APIDesignerAgent;
  private dataModelerAgent?: DataModelerAgent;
  private infrastructurePlannerAgent?: InfrastructurePlannerAgent;

  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'ARCH',
      budget: config?.budget || {
        maxCostUsd: 2.0, // Higher budget for 4 agents
        maxTokens: 50000,
      },
      minRequiredAgents: 3, // At least 3 of 4 must succeed
      maxConcurrency: 4, // All 4 agents run in parallel
      eventPublisher: config?.eventPublisher,
    });
  }

  /**
   * Initialize all 4 ARCH agents with their respective configurations
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    const agents: BaseAgent[] = [];

    try {
      // Load agent configurations
      const solutionArchitectConfig = await loadAgentConfig('arch', 'solution-architect');
      const apiDesignerConfig = await loadAgentConfig('arch', 'api-designer');
      const dataModelerConfig = await loadAgentConfig('arch', 'data-modeler');
      const infrastructurePlannerConfig = await loadAgentConfig('arch', 'infrastructure-planner');

      // Initialize SolutionArchitectAgent
      this.solutionArchitectAgent = new SolutionArchitectAgent(solutionArchitectConfig);
      agents.push(this.solutionArchitectAgent);

      // Initialize APIDesignerAgent
      this.apiDesignerAgent = new APIDesignerAgent(apiDesignerConfig);
      agents.push(this.apiDesignerAgent);

      // Initialize DataModelerAgent
      this.dataModelerAgent = new DataModelerAgent(dataModelerConfig);
      agents.push(this.dataModelerAgent);

      // Initialize InfrastructurePlannerAgent
      this.infrastructurePlannerAgent = new InfrastructurePlannerAgent(infrastructurePlannerConfig);
      agents.push(this.infrastructurePlannerAgent);

      this.logger.info(`Initialized ${agents.length} ARCH agents for parallel execution`);
    } catch (error) {
      this.logger.error('Failed to initialize ARCH agents', { error });
      throw error;
    }

    return agents;
  }

  /**
   * Aggregate results from all successful ARCH agents into comprehensive architecture documentation
   */
  protected async aggregateResults(
    successes: Array<{ agent: BaseAgent; artifacts: Artifact[] }>,
    failures: Array<{ agent: BaseAgent; error: Error }>,
    phaseInput: PhaseInput
  ): Promise<Artifact[]> {
    const aggregatedArtifacts: Artifact[] = [];

    // Collect all individual artifacts
    for (const { artifacts } of successes) {
      aggregatedArtifacts.push(...artifacts);
    }

    // Extract specific artifacts
    const systemArchitecture = aggregatedArtifacts.find((a) => a.type === 'system-architecture');
    const apiDesign = aggregatedArtifacts.find((a) => a.type === 'api-design');
    const dataModel = aggregatedArtifacts.find((a) => a.type === 'data-model');
    const infrastructurePlan = aggregatedArtifacts.find((a) => a.type === 'infrastructure-plan');

    // Calculate summary metrics
    const summary = this.calculateSummary(
      systemArchitecture,
      apiDesign,
      dataModel,
      infrastructurePlan,
      successes.length,
      failures.length
    );

    // Create aggregated arch-complete artifact
    const archComplete: Artifact = {
      type: 'arch-complete',
      content: {
        // Core architecture artifacts
        systemArchitecture: systemArchitecture?.content || null,
        apiDesign: apiDesign?.content || null,
        dataModel: dataModel?.content || null,
        infrastructurePlan: infrastructurePlan?.content || null,

        // Summary and metrics
        summary: {
          architectureStyle: summary.architectureStyle,
          apiStyle: summary.apiStyle,
          databaseType: summary.databaseType,
          cloudProvider: summary.cloudProvider,
          totalComponents: summary.totalComponents,
          totalAPIEndpoints: summary.totalAPIEndpoints,
          totalEntities: summary.totalEntities,
          totalADRs: summary.totalADRs,
          estimatedMonthlyCost: summary.estimatedMonthlyCost,
          agentsCompleted: successes.length,
          agentsFailed: failures.length,
        },

        // Executive summary combining all architecture decisions
        executiveSummary: this.generateExecutiveSummary(
          systemArchitecture,
          apiDesign,
          dataModel,
          infrastructurePlan,
          summary
        ),

        // Failed agents info (if any)
        ...(failures.length > 0 && {
          failedAgents: failures.map((f) => ({
            agentName: f.agent.constructor.name,
            error: f.error.message,
          })),
        }),
      },
      metadata: {
        phaseId: 'ARCH',
        projectId: phaseInput.projectId,
        workflowRunId: phaseInput.workflowRunId,
        generatedAt: new Date().toISOString(),
        generatedBy: 'ArchPhaseCoordinator',
        artifactsGenerated: successes.length,
        agentsFailed: failures.length,
      },
    };

    // Add the aggregated artifact
    aggregatedArtifacts.push(archComplete);

    this.logger.info('ARCH phase aggregation complete', {
      totalArtifacts: aggregatedArtifacts.length,
      successfulAgents: successes.length,
      failedAgents: failures.length,
      architectureStyle: summary.architectureStyle,
    });

    return aggregatedArtifacts;
  }

  /**
   * Calculate comprehensive summary from all ARCH artifacts
   */
  private calculateSummary(
    systemArchitecture: Artifact | undefined,
    apiDesign: Artifact | undefined,
    dataModel: Artifact | undefined,
    infrastructurePlan: Artifact | undefined,
    successCount: number,
    failureCount: number
  ) {
    // Extract architecture metrics
    const architectureStyle = systemArchitecture?.content?.overview?.architectureStyle || 'monolithic';
    const components = systemArchitecture?.content?.components || [];
    const adrs = systemArchitecture?.content?.architectureDecisionRecords || [];

    // Extract API metrics
    const apiStyle = apiDesign?.content?.overview?.apiStyle || 'REST';
    const resources = apiDesign?.content?.resources || [];
    const totalAPIEndpoints = resources.reduce((total: number, r: any) => {
      return total + (r.endpoints?.length || 0);
    }, 0);

    // Extract data model metrics
    const databaseType = dataModel?.content?.overview?.databaseType || 'relational';
    const entities = dataModel?.content?.entities || [];

    // Extract infrastructure metrics
    const cloudProvider = infrastructurePlan?.content?.overview?.cloudProvider || 'AWS';
    const estimatedMonthlyCost = infrastructurePlan?.content?.overview?.estimatedMonthlyCost || {
      total: 0,
      currency: 'USD',
    };

    return {
      architectureStyle,
      apiStyle,
      databaseType,
      cloudProvider,
      totalComponents: components.length,
      totalAPIEndpoints,
      totalEntities: entities.length,
      totalADRs: adrs.length,
      estimatedMonthlyCost,
    };
  }

  /**
   * Generate executive summary combining all architecture decisions
   */
  private generateExecutiveSummary(
    systemArchitecture: Artifact | undefined,
    apiDesign: Artifact | undefined,
    dataModel: Artifact | undefined,
    infrastructurePlan: Artifact | undefined,
    summary: any
  ): string {
    const sections: string[] = [];

    // Overall architecture overview
    sections.push('**Architecture Overview**');
    sections.push('');

    // System architecture summary
    if (systemArchitecture) {
      sections.push('**System Architecture:**');
      sections.push(`- Style: ${summary.architectureStyle}`);
      sections.push(`- Components: ${summary.totalComponents} system components`);
      sections.push(`- ADRs: ${summary.totalADRs} architecture decisions documented`);

      const rationale = systemArchitecture.content?.overview?.rationale;
      if (rationale) {
        sections.push(`- Rationale: ${rationale}`);
      }
      sections.push('');
    }

    // API design summary
    if (apiDesign) {
      sections.push('**API Design:**');
      sections.push(`- Style: ${summary.apiStyle}`);
      sections.push(`- Resources: ${apiDesign.content?.resources?.length || 0} API resources`);
      sections.push(`- Endpoints: ${summary.totalAPIEndpoints} total endpoints`);

      const authMechanisms = apiDesign.content?.authentication?.mechanisms || [];
      if (authMechanisms.length > 0) {
        sections.push(`- Authentication: ${authMechanisms.map((m: any) => m.type).join(', ')}`);
      }
      sections.push('');
    }

    // Data model summary
    if (dataModel) {
      sections.push('**Data Model:**');
      sections.push(`- Database: ${summary.databaseType}`);
      sections.push(`- Entities: ${summary.totalEntities} database entities`);

      const normalizationLevel = dataModel.content?.overview?.normalizationLevel;
      if (normalizationLevel) {
        sections.push(`- Normalization: ${normalizationLevel}`);
      }

      const totalRelationships = dataModel.content?.entities?.reduce((total: number, e: any) => {
        return total + (e.relationships?.length || 0);
      }, 0) || 0;
      sections.push(`- Relationships: ${totalRelationships} entity relationships`);
      sections.push('');
    }

    // Infrastructure summary
    if (infrastructurePlan) {
      sections.push('**Infrastructure:**');
      sections.push(`- Cloud Provider: ${summary.cloudProvider}`);
      sections.push(`- Estimated Monthly Cost: $${summary.estimatedMonthlyCost.total?.toLocaleString() || '0'} ${summary.estimatedMonthlyCost.currency}`);

      const regions = infrastructurePlan.content?.overview?.regions;
      if (regions) {
        sections.push(`- Regions: ${regions.primary}${regions.secondary ? `, ${regions.secondary}` : ''}`);
      }

      const containerOrchestration = infrastructurePlan.content?.containerOrchestration;
      if (containerOrchestration?.platform && containerOrchestration.platform !== 'None') {
        sections.push(`- Container Orchestration: ${containerOrchestration.platform}`);
      }

      const cicdPlatform = infrastructurePlan.content?.cicdPipeline?.platform;
      if (cicdPlatform) {
        sections.push(`- CI/CD: ${cicdPlatform}`);
      }
      sections.push('');
    }

    // Key architectural decisions
    if (systemArchitecture?.content?.architectureDecisionRecords) {
      const acceptedADRs = systemArchitecture.content.architectureDecisionRecords
        .filter((adr: any) => adr.status === 'accepted')
        .slice(0, 5);

      if (acceptedADRs.length > 0) {
        sections.push('**Key Architectural Decisions:**');
        acceptedADRs.forEach((adr: any, i: number) => {
          sections.push(`${i + 1}. **${adr.title}**: ${adr.decision}`);
        });
        sections.push('');
      }
    }

    // Technology stack
    if (systemArchitecture?.content?.technologyStack) {
      sections.push('**Technology Stack:**');
      systemArchitecture.content.technologyStack.forEach((layer: any) => {
        const techs = layer.technologies?.slice(0, 3).map((t: any) => t.name).join(', ') || '';
        if (techs) {
          sections.push(`- ${layer.layer}: ${techs}`);
        }
      });
      sections.push('');
    }

    return sections.join('\n');
  }
}

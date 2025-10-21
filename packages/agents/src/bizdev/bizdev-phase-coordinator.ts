import { BaseAgent } from '../base/base-agent';
import { PhaseCoordinator, PhaseInput, PhaseResult } from '../base/phase-coordinator';
import { PhaseCoordinatorConfig } from '../base/phase-coordinator-config';
import { Artifact } from '../base/types';
import { ViabilityAnalyzerAgent } from './viability-analyzer-agent';
import { GTMPlannerAgent } from './gtm-planner-agent';
import { PricingModelerAgent } from './pricing-modeler-agent';
import { MonetizationAdvisorAgent } from './monetization-advisor-agent';
import { loadAgentConfig } from '../config/config-loader';

/**
 * BizDevPhaseCoordinator
 *
 * Coordinates the Business Development (BIZDEV) phase by orchestrating 4 specialized agents in parallel:
 * 1. ViabilityAnalyzerAgent - Analyzes business viability with financial projections and unit economics
 * 2. GTMPlannerAgent - Creates comprehensive go-to-market strategy
 * 3. PricingModelerAgent - Designs pricing model with competitive analysis
 * 4. MonetizationAdvisorAgent - Provides revenue stream diversification strategy
 *
 * Phase Requirements:
 * - At least 3 of 4 agents must succeed (75% success rate)
 * - All 4 agents run in parallel for 4x speedup
 * - Generates aggregated bizdev-complete artifact
 *
 * Performance:
 * - Sequential execution: ~40-60 seconds (4 agents × 10-15s each)
 * - Parallel execution: ~10-15 seconds (4x speedup)
 *
 * Input Requirements:
 * - IdeaSpec with business constraints, success criteria, target users
 * - Previous artifacts from CRITIQUE phase (critique-complete)
 * - Optional: Product strategy, competitive analysis, user personas from earlier phases
 *
 * Output Artifacts:
 * - viability-analysis: Financial projections, unit economics, go/no-go recommendation
 * - gtm-plan: Positioning, channels, launch strategy, partnership opportunities
 * - pricing-model: Pricing tiers, competitive analysis, revenue projections
 * - monetization-strategy: Revenue streams, optimization strategies, growth plan
 * - bizdev-complete: Aggregated business development plan with executive summary
 */
export class BizDevPhaseCoordinator extends PhaseCoordinator {
  private viabilityAgent?: ViabilityAnalyzerAgent;
  private gtmAgent?: GTMPlannerAgent;
  private pricingAgent?: PricingModelerAgent;
  private monetizationAgent?: MonetizationAdvisorAgent;

  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'BIZDEV',
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
   * Initialize all 4 BIZDEV agents with their respective configurations
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    const agents: BaseAgent[] = [];

    try {
      // Load agent configurations
      const viabilityConfig = await loadAgentConfig('bizdev', 'viability-analyzer');
      const gtmConfig = await loadAgentConfig('bizdev', 'gtm-planner');
      const pricingConfig = await loadAgentConfig('bizdev', 'pricing-modeler');
      const monetizationConfig = await loadAgentConfig('bizdev', 'monetization-advisor');

      // Initialize ViabilityAnalyzerAgent
      this.viabilityAgent = new ViabilityAnalyzerAgent(viabilityConfig);
      agents.push(this.viabilityAgent);

      // Initialize GTMPlannerAgent
      this.gtmAgent = new GTMPlannerAgent(gtmConfig);
      agents.push(this.gtmAgent);

      // Initialize PricingModelerAgent
      this.pricingAgent = new PricingModelerAgent(pricingConfig);
      agents.push(this.pricingAgent);

      // Initialize MonetizationAdvisorAgent
      this.monetizationAgent = new MonetizationAdvisorAgent(monetizationConfig);
      agents.push(this.monetizationAgent);

      this.logger.info(`Initialized ${agents.length} BIZDEV agents for parallel execution`);
    } catch (error) {
      this.logger.error('Failed to initialize BIZDEV agents', { error });
      throw error;
    }

    return agents;
  }

  /**
   * Aggregate results from all successful BIZDEV agents into a comprehensive business development plan
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
    const viabilityAnalysis = aggregatedArtifacts.find((a) => a.type === 'viability-analysis');
    const gtmPlan = aggregatedArtifacts.find((a) => a.type === 'gtm-plan');
    const pricingModel = aggregatedArtifacts.find((a) => a.type === 'pricing-model');
    const monetizationStrategy = aggregatedArtifacts.find((a) => a.type === 'monetization-strategy');

    // Calculate summary metrics
    const summary = this.calculateSummary(
      viabilityAnalysis,
      gtmPlan,
      pricingModel,
      monetizationStrategy,
      successes.length,
      failures.length
    );

    // Create aggregated bizdev-complete artifact
    const bizdevComplete: Artifact = {
      type: 'bizdev-complete',
      content: {
        // Core business development artifacts
        viability: viabilityAnalysis?.content || null,
        gtm: gtmPlan?.content || null,
        pricing: pricingModel?.content || null,
        monetization: monetizationStrategy?.content || null,

        // Summary and metrics
        summary: {
          overallRecommendation: summary.overallRecommendation,
          viabilityScore: summary.viabilityScore,
          expectedBreakEvenMonth: summary.expectedBreakEvenMonth,
          year1RevenueProjection: summary.year1RevenueProjection,
          primaryPricingModel: summary.primaryPricingModel,
          primaryRevenueStream: summary.primaryRevenueStream,
          launchTimeframe: summary.launchTimeframe,
          criticalSuccessFactors: summary.criticalSuccessFactors,
          keyRisks: summary.keyRisks,
          agentsCompleted: successes.length,
          agentsFailed: failures.length,
        },

        // Executive summary combining all analyses
        executiveSummary: this.generateExecutiveSummary(
          viabilityAnalysis,
          gtmPlan,
          pricingModel,
          monetizationStrategy,
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
        phaseId: 'BIZDEV',
        projectId: phaseInput.projectId,
        workflowRunId: phaseInput.workflowRunId,
        generatedAt: new Date().toISOString(),
        generatedBy: 'BizDevPhaseCoordinator',
        artifactsGenerated: successes.length,
        agentsFailed: failures.length,
      },
    };

    // Add the aggregated artifact
    aggregatedArtifacts.push(bizdevComplete);

    this.logger.info('BIZDEV phase aggregation complete', {
      totalArtifacts: aggregatedArtifacts.length,
      successfulAgents: successes.length,
      failedAgents: failures.length,
      overallRecommendation: summary.overallRecommendation,
    });

    return aggregatedArtifacts;
  }

  /**
   * Calculate comprehensive summary from all BIZDEV artifacts
   */
  private calculateSummary(
    viabilityAnalysis: Artifact | undefined,
    gtmPlan: Artifact | undefined,
    pricingModel: Artifact | undefined,
    monetizationStrategy: Artifact | undefined,
    successCount: number,
    failureCount: number
  ) {
    // Extract viability metrics
    const viabilityScore = viabilityAnalysis?.content?.viabilityScore || 0;
    const recommendation = viabilityAnalysis?.content?.recommendation?.decision || 'conditional';
    const breakEvenMonth = viabilityAnalysis?.content?.financialProjections?.profitability?.breakEvenMonth || null;
    const year1Revenue = viabilityAnalysis?.content?.financialProjections?.revenue?.year1 || 0;

    // Extract GTM metrics
    const launchPhases = gtmPlan?.content?.launchPlan?.phases || [];
    const launchTimeframe = launchPhases.length > 0
      ? `${launchPhases[0]?.duration || 'N/A'} (${launchPhases.length} phases)`
      : 'Not planned';

    // Extract pricing metrics
    const pricingStrategy = pricingModel?.content?.strategy?.model || 'subscription';

    // Extract monetization metrics
    const revenueStreams = monetizationStrategy?.content?.revenueStreams || [];
    const primaryStream = revenueStreams.find((s: any) => s.priority === 'primary')?.type || 'subscription';

    // Determine overall recommendation
    let overallRecommendation: 'proceed' | 'proceed-with-caution' | 'revise' | 'stop';
    if (viabilityScore >= 80 && recommendation === 'proceed') {
      overallRecommendation = 'proceed';
    } else if (viabilityScore >= 60 || recommendation === 'proceed-with-conditions') {
      overallRecommendation = 'proceed-with-caution';
    } else if (viabilityScore >= 40 || recommendation === 'revise-and-resubmit') {
      overallRecommendation = 'revise';
    } else {
      overallRecommendation = 'stop';
    }

    // Extract critical success factors
    const criticalSuccessFactors: string[] = [];
    if (viabilityAnalysis?.content?.recommendation?.criticalSuccessFactors) {
      criticalSuccessFactors.push(...viabilityAnalysis.content.recommendation.criticalSuccessFactors);
    }
    if (gtmPlan?.content?.positioning?.competitiveDifferentiation) {
      criticalSuccessFactors.push(gtmPlan.content.positioning.competitiveDifferentiation.join(', '));
    }

    // Extract key risks
    const keyRisks: string[] = [];
    if (viabilityAnalysis?.content?.riskAssessment?.risks) {
      const highRisks = viabilityAnalysis.content.riskAssessment.risks
        .filter((r: any) => r.severity === 'high')
        .map((r: any) => r.risk);
      keyRisks.push(...highRisks);
    }

    return {
      overallRecommendation,
      viabilityScore,
      expectedBreakEvenMonth: breakEvenMonth,
      year1RevenueProjection: year1Revenue,
      primaryPricingModel: pricingStrategy,
      primaryRevenueStream: primaryStream,
      launchTimeframe,
      criticalSuccessFactors: criticalSuccessFactors.slice(0, 5), // Top 5
      keyRisks: keyRisks.slice(0, 5), // Top 5 high-severity risks
    };
  }

  /**
   * Generate executive summary combining all BIZDEV analyses
   */
  private generateExecutiveSummary(
    viabilityAnalysis: Artifact | undefined,
    gtmPlan: Artifact | undefined,
    pricingModel: Artifact | undefined,
    monetizationStrategy: Artifact | undefined,
    summary: any
  ): string {
    const sections: string[] = [];

    // Overall recommendation
    sections.push(`**Overall Recommendation: ${summary.overallRecommendation.toUpperCase()}**`);
    sections.push('');

    // Viability summary
    if (viabilityAnalysis) {
      sections.push('**Business Viability:**');
      sections.push(`- Viability Score: ${summary.viabilityScore}/100`);
      sections.push(`- Break-even: Month ${summary.expectedBreakEvenMonth || 'TBD'}`);
      sections.push(`- Year 1 Revenue: $${summary.year1RevenueProjection?.toLocaleString() || '0'}`);

      const unitEcon = viabilityAnalysis.content?.unitEconomics;
      if (unitEcon) {
        sections.push(`- LTV:CAC Ratio: ${unitEcon.ltvCacRatio?.toFixed(2) || 'N/A'}`);
        sections.push(`- CAC Payback: ${unitEcon.paybackPeriod || 'N/A'} months`);
      }
      sections.push('');
    }

    // GTM summary
    if (gtmPlan) {
      sections.push('**Go-to-Market Strategy:**');
      const positioning = gtmPlan.content?.positioning;
      if (positioning?.valueProposition) {
        sections.push(`- Value Proposition: ${positioning.valueProposition}`);
      }
      sections.push(`- Launch Timeline: ${summary.launchTimeframe}`);

      const channels = gtmPlan.content?.marketingChannels || [];
      const primaryChannels = channels.filter((c: any) => c.priority === 'high').map((c: any) => c.channel);
      if (primaryChannels.length > 0) {
        sections.push(`- Primary Channels: ${primaryChannels.slice(0, 3).join(', ')}`);
      }
      sections.push('');
    }

    // Pricing summary
    if (pricingModel) {
      sections.push('**Pricing Strategy:**');
      sections.push(`- Model: ${summary.primaryPricingModel}`);

      const tiers = pricingModel.content?.tiers || [];
      sections.push(`- Tiers: ${tiers.length} pricing tier(s)`);

      const revenueProjection = pricingModel.content?.revenueProjection;
      if (revenueProjection) {
        sections.push(`- Projected MRR (Year 1): $${revenueProjection.year1?.mrr?.toLocaleString() || '0'}`);
      }
      sections.push('');
    }

    // Monetization summary
    if (monetizationStrategy) {
      sections.push('**Monetization Strategy:**');
      sections.push(`- Primary Revenue Stream: ${summary.primaryRevenueStream}`);

      const streams = monetizationStrategy.content?.revenueStreams || [];
      const diversification = monetizationStrategy.content?.overallStrategy?.diversification;
      sections.push(`- Diversification: ${diversification || 'single-stream'} (${streams.length} stream(s))`);

      const opportunities = monetizationStrategy.content?.monetizationOpportunities || [];
      if (opportunities.length > 0) {
        sections.push(`- Future Opportunities: ${opportunities.length} identified`);
      }
      sections.push('');
    }

    // Critical success factors
    if (summary.criticalSuccessFactors.length > 0) {
      sections.push('**Critical Success Factors:**');
      summary.criticalSuccessFactors.forEach((factor: string, i: number) => {
        sections.push(`${i + 1}. ${factor}`);
      });
      sections.push('');
    }

    // Key risks
    if (summary.keyRisks.length > 0) {
      sections.push('**Key Risks:**');
      summary.keyRisks.forEach((risk: string, i: number) => {
        sections.push(`${i + 1}. ${risk}`);
      });
      sections.push('');
    }

    return sections.join('\n');
  }
}

/**
 * Run Planner - Creates Run Plan from IdeaInput
 * Spec: orchestrator.txt:51-53, UNIFIED_IMPLEMENTATION_SPEC.md Section 1.4
 *
 * The RunPlanner aggregates all phase configurations, calculates total budgets,
 * and generates a complete execution plan for an idea-to-GA run.
 */

import {
  RunPlan,
  PhasePlanSummary,
  parseISO8601ToHours
} from '@ideamine/schemas/orchestrator';
import { WorkflowStateMachine } from '../workflow-state';

/**
 * Minimal IdeaInput structure needed for planning
 */
export interface IdeaInput {
  idea: string;
  tenant_id?: string;
  context?: Record<string, any>;
}

/**
 * RunPlanner - Generate execution plan from idea input
 */
export class RunPlanner {
  /**
   * Create a complete run plan for all 12 phases
   */
  async createRunPlan(ideaInput: IdeaInput): Promise<RunPlan> {
    const run_id = this.generateRunId();
    const phases = WorkflowStateMachine.PHASES;

    // Load all phase configs and aggregate budgets
    const phasePlans: PhasePlanSummary[] = [];
    let totalTokens = 0;
    let totalToolsMinutes = 0;
    let totalGpuHours = 0;

    for (const phaseConfig of phases) {
      const phaseId = this.normalizePhaseId(phaseConfig.phaseId);

      // Load YAML config (will be implemented in config loader)
      const yamlConfig = await this.loadPhaseConfig(phaseId);

      phasePlans.push({
        phase: phaseId,
        dependencies: phaseConfig.dependencies || [],
        required_artifacts: this.getRequiredArtifacts(phaseId),
        budgets: {
          tokens: yamlConfig.budgets.tokens,
          tools_minutes: yamlConfig.budgets.tools_minutes
        },
        timebox: yamlConfig.timebox
      });

      totalTokens += yamlConfig.budgets.tokens;
      totalToolsMinutes += yamlConfig.budgets.tools_minutes;
      totalGpuHours += yamlConfig.budgets.gpu_hours || 0;
    }

    // Calculate phase timeouts
    const phaseTimeouts: Record<string, number> = {};
    for (const plan of phasePlans) {
      phaseTimeouts[plan.phase] = parseISO8601ToHours(plan.timebox);
    }

    const totalTimeoutHours = Object.values(phaseTimeouts).reduce((sum, h) => sum + h, 0);

    return {
      run_id,
      tenant_id: ideaInput.tenant_id || 'default',
      phases: phasePlans,
      budgets: {
        total_tokens: totalTokens,
        total_tools_minutes: totalToolsMinutes,
        total_gpu_hours: totalGpuHours
      },
      policies: {
        no_user_interactions: true,
        hallucination_guards_required: true,
        security_gates_required: ['security']
      },
      timeouts: {
        total_timeout_hours: totalTimeoutHours,
        phase_timeouts: phaseTimeouts
      },
      required_evidence: [
        'IdeaSpec',
        'PRD',
        'SecurityPack',
        'TestReports',
        'SBOM',
        'ReleaseNotes'
      ],
      created_at: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Get required artifacts for each phase
   * Maps phase to expected output artifact types
   */
  private getRequiredArtifacts(phase: string): string[] {
    const artifactMap: Record<string, string[]> = {
      intake: ['IdeaSpec', 'Glossary', 'FeasibilityAssessment'],
      ideation: ['DiscoveryPack', 'Personas', 'UseCases', 'TechStack'],
      critique: ['RiskRegister', 'Assumptions', 'FailureModes'],
      prd: ['PRD', 'RTM', 'UserStories', 'UXFlows', 'NFRs'],
      bizdev: ['BizPack', 'PricingModel', 'GTMPlan', 'FinancialModel'],
      architecture: ['ArchOutline', 'OpenAPI', 'ERD', 'DeploymentPlan'],
      build: ['RepoManifest', 'CIPipeline', 'IaCModules', 'Dockerfile'],
      security: [
        'SecurityPack',
        'SBOM',
        'VulnerabilityReport',
        'ThreatModel',
        'DPIA',
        'Signatures'
      ],
      'story-loop': ['CodeArtifacts', 'Tests', 'PullRequests'],
      qa: ['TestReports', 'CoverageReport', 'PerformanceReport'],
      aesthetic: ['A11yAudit', 'DesignTokens', 'WebVitals'],
      release: ['ReleaseNotes', 'DeploymentPlan', 'SignedArtifacts', 'Dossier'],
      beta: ['BetaReport', 'TelemetryConfig', 'AnalyticsEvents']
    };

    return artifactMap[phase] || [];
  }

  /**
   * Normalize phase ID to lowercase-hyphenated format
   */
  private normalizePhaseId(phaseId: string): string {
    return phaseId.toLowerCase().replace(/_/g, '-');
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    const crypto = require('crypto');
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `run-${timestamp}-${random}`;
  }

  /**
   * Load phase configuration using PhaseConfigLoader
   */
  private async loadPhaseConfig(phaseId: string): Promise<any> {
    // Import dynamically to avoid circular dependency
    const { loadPhaseConfig } = await import('../../agents/src/config/phase-config-loader');
    return loadPhaseConfig(phaseId);
  }
}

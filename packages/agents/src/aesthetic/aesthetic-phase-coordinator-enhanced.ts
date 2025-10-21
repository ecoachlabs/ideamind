/**
 * Enhanced Aesthetic Phase Coordinator with Level-2 Infrastructure Integration
 *
 * Integrates:
 * - AestheticGate for aesthetic quality enforcement
 * - Recorder for comprehensive logging
 * - Dispatcher for event-driven coordination
 * - Supervisor for retry/backoff/circuit breaker
 *
 * Gate Requirements:
 * - WCAG compliance ≥ 1.0 (100% WCAG 2.2 AA compliance)
 * - Visual regression pass = true
 * - Brand consistency ≥ 0.95
 */

import {
  EnhancedPhaseCoordinator,
  type EnhancedPhaseCoordinatorConfig,
} from '@ideamine/orchestrator-core/src/base/enhanced-phase-coordinator';
import {
  Recorder,
  InMemoryRecorderStorage,
  Dispatcher,
  AestheticGate,
  type GateEvaluationInput,
  PHASE_GATE_MAPPING,
} from '@ideamine/orchestrator-core';
import { Artifact } from '../base/types';
import { UIAuditorAgent } from './ui-auditor-agent';
import { AccessibilityCheckerAgent } from './accessibility-checker-agent';
import { PolishAgent } from './polish-agent';
import { loadAgentConfig } from '../config/loader';

export class EnhancedAestheticPhaseCoordinator extends EnhancedPhaseCoordinator {
  constructor(config?: Partial<EnhancedPhaseCoordinatorConfig>) {
    const phaseConfig = PHASE_GATE_MAPPING.AESTHETIC;
    const recorder = config?.recorder || new Recorder(new InMemoryRecorderStorage());
    const dispatcher = config?.dispatcher || new Dispatcher({ maxConcurrency: 10 }, recorder);
    const gatekeeper = config?.gatekeeper || new AestheticGate(recorder);

    super({
      phaseName: 'AESTHETIC',
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

  async execute(input: any): Promise<{ success: boolean; artifacts?: Artifact[]; error?: string }> {
    try {
      this.logger.info('Starting AESTHETIC phase with parallel agent execution');

      const { previousArtifacts, ideaSpec } = input;

      const uiAuditorConfig = loadAgentConfig('aesthetic-ui-auditor-agent');
      const accessibilityConfig = loadAgentConfig('aesthetic-accessibility-checker-agent');
      const polishConfig = loadAgentConfig('aesthetic-polish-agent');

      const uiAuditor = new UIAuditorAgent(uiAuditorConfig);
      const accessibilityChecker = new AccessibilityCheckerAgent(accessibilityConfig);
      const polishAgent = new PolishAgent(polishConfig);

      const agentInput = { previousArtifacts, ideaSpec };

      this.logger.info('Executing 3 agents in PARALLEL (UI Auditor, Accessibility, Polish)');
      const startTime = Date.now();

      const results = await Promise.allSettled([
        uiAuditor.execute(agentInput),
        accessibilityChecker.execute(agentInput),
        polishAgent.execute(agentInput),
      ]);

      const duration = Date.now() - startTime;
      this.logger.info(`Parallel execution completed in ${duration}ms`);

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        this.logger.error(`${failures.length} agent(s) failed`, { failures });
        return {
          success: false,
          error: `${failures.length} agent(s) failed in AESTHETIC phase`,
        };
      }

      const allArtifacts: Artifact[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success && result.value.artifacts) {
          allArtifacts.push(...result.value.artifacts);
        }
      });

      const uiAuditReport = allArtifacts.find((a) => a.type === 'ui-audit-report');
      const accessibilityReport = allArtifacts.find((a) => a.type === 'accessibility-report');
      const polishReport = allArtifacts.find((a) => a.type === 'polish-report');

      if (!uiAuditReport || !accessibilityReport || !polishReport) {
        return {
          success: false,
          error: 'Missing required artifacts',
        };
      }

      const aggregatedArtifacts = this.aggregateResults(allArtifacts);

      return {
        success: true,
        artifacts: [...allArtifacts, ...aggregatedArtifacts],
      };
    } catch (error) {
      this.logger.error('AESTHETIC phase execution failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  protected aggregateResults(artifacts: Artifact[]): Artifact[] {
    const uiAudit = artifacts.find((a) => a.type === 'ui-audit-report')?.content;
    const accessibility = artifacts.find((a) => a.type === 'accessibility-report')?.content;
    const polish = artifacts.find((a) => a.type === 'polish-report')?.content;

    const uiQualityScore = uiAudit?.summary?.uiQualityScore || 0;
    const accessibilityScore = accessibility?.summary?.accessibilityScore || 0;
    const polishScore = polish?.summary?.polishScore || 0;

    const overallAestheticScore = Math.round(
      uiQualityScore * 0.3 + accessibilityScore * 0.4 + polishScore * 0.3
    );

    const aggregated = {
      summary: {
        overallAestheticScore,
        uiQualityScore,
        accessibilityScore,
        polishScore,
        wcagAACompliance: accessibility?.summary?.wcagAACompliance || 0,
      },
      uiDesign: uiAudit,
      accessibility: accessibility,
      polish: polish,
    };

    return [
      {
        type: 'aesthetic-complete',
        content: aggregated,
        metadata: {
          generatedAt: new Date().toISOString(),
          overallScore: overallAestheticScore,
        },
      },
    ];
  }

  /**
   * Prepare gate input from phase results
   * Extracts metrics required by AestheticGate:
   * - wcag_compliance: WCAG 2.2 AA compliance percentage (as decimal)
   * - visual_regression_pass: Whether visual regression tests passed
   * - brand_consistency: Brand consistency score (as decimal)
   */
  protected async prepareGateInput(phaseInput: any, phaseResult: any): Promise<GateEvaluationInput> {
    const artifacts = phaseResult.artifacts || [];

    const uiAuditReport = artifacts.find((a: any) => a.type === 'ui-audit-report');
    const accessibilityReport = artifacts.find((a: any) => a.type === 'accessibility-report');
    const polishReport = artifacts.find((a: any) => a.type === 'polish-report');

    const wcagAACompliance = accessibilityReport?.content?.summary?.wcagAACompliance || 0;
    const wcag_compliance = wcagAACompliance / 100; // Convert percentage to decimal

    // Visual regression pass if no critical UI issues
    const criticalUIIssues = uiAuditReport?.content?.summary?.criticalIssues || 0;
    const visual_regression_pass = criticalUIIssues === 0;

    // Brand consistency from UI audit
    const brandConsistencyItems = uiAuditReport?.content?.brandConsistency || [];
    const passedBrandItems = brandConsistencyItems.filter((item: any) => item.compliant).length;
    const brand_consistency = brandConsistencyItems.length > 0
      ? passedBrandItems / brandConsistencyItems.length
      : 1.0;

    return {
      runId: phaseInput.workflowRunId,
      phase: 'AESTHETIC',
      artifacts,
      metrics: {
        wcag_compliance,
        visual_regression_pass,
        brand_consistency,
      },
    };
  }

  protected async enhanceInputWithHints(input: any, gateResult: any): Promise<any> {
    const hints: string[] = [];
    const failedMetrics = gateResult.decision?.failedMetrics || [];

    failedMetrics.forEach((metric: any) => {
      if (metric.metric === 'wcag_compliance') {
        hints.push(
          `Improve WCAG 2.2 AA compliance. Currently ${(metric.actual * 100).toFixed(1)}%, need ${(metric.threshold * 100).toFixed(0)}%`
        );
      } else if (metric.metric === 'visual_regression_pass') {
        hints.push(
          `Fix critical UI issues to pass visual regression tests`
        );
      } else if (metric.metric === 'brand_consistency') {
        hints.push(
          `Improve brand consistency. Currently ${(metric.actual * 100).toFixed(1)}%, need ${(metric.threshold * 100).toFixed(0)}%`
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

import { PhaseCoordinator, PhaseCoordinatorConfig } from '../base/phase-coordinator';
import { Artifact } from '../base/types';
import { UIAuditorAgent } from './ui-auditor-agent';
import { AccessibilityCheckerAgent } from './accessibility-checker-agent';
import { PolishAgent } from './polish-agent';
import { loadAgentConfig } from '../config/loader';

/**
 * AestheticPhaseCoordinator
 *
 * Coordinates the AESTHETIC phase with 3 agents running in PARALLEL:
 * 1. UIAuditorAgent - Design consistency, spacing, typography, color
 * 2. AccessibilityCheckerAgent - WCAG 2.1 compliance, a11y
 * 3. PolishAgent - Animations, transitions, micro-interactions
 *
 * This phase evaluates the visual quality, accessibility, and polish
 * of the user interface, providing comprehensive recommendations for
 * achieving production-ready aesthetic excellence.
 *
 * Parallel execution provides 3-4x speedup over sequential execution:
 * - Sequential: ~40 seconds (14s + 13s + 13s)
 * - Parallel: ~14 seconds (longest agent runtime)
 *
 * Input: Visual regression suite + Story loop complete + PRD
 * Output: Comprehensive aesthetic evaluation with quality gates
 */
export class AestheticPhaseCoordinator extends PhaseCoordinator {
  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'AESTHETIC',
      minRequiredAgents: 3, // All 3 must succeed
      maxConcurrency: 3, // All run in parallel
      ...config,
    });
  }

  async execute(input: any): Promise<{ success: boolean; artifacts?: Artifact[]; error?: string }> {
    try {
      this.logger.info('Starting AESTHETIC phase with parallel agent execution');

      const { previousArtifacts, ideaSpec } = input;

      // Load agent configurations
      const uiAuditorConfig = loadAgentConfig('aesthetic-ui-auditor-agent');
      const accessibilityConfig = loadAgentConfig('aesthetic-accessibility-checker-agent');
      const polishConfig = loadAgentConfig('aesthetic-polish-agent');

      // Instantiate agents
      const uiAuditor = new UIAuditorAgent(uiAuditorConfig);
      const accessibilityChecker = new AccessibilityCheckerAgent(accessibilityConfig);
      const polishAgent = new PolishAgent(polishConfig);

      const agentInput = { previousArtifacts, ideaSpec };

      this.logger.info('Executing 3 agents in PARALLEL (UI Auditor, Accessibility, Polish)');
      const startTime = Date.now();

      // Execute all 3 agents in PARALLEL using Promise.allSettled
      const results = await Promise.allSettled([
        uiAuditor.execute(agentInput),
        accessibilityChecker.execute(agentInput),
        polishAgent.execute(agentInput),
      ]);

      const duration = Date.now() - startTime;
      this.logger.info(`Parallel execution completed in ${duration}ms (~${Math.round(duration / 1000)}s)`);

      // Check for failures
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        this.logger.error(`${failures.length} agent(s) failed`, { failures });
        return {
          success: false,
          error: `${failures.length} agent(s) failed in AESTHETIC phase`,
        };
      }

      // Extract artifacts from successful results
      const allArtifacts: Artifact[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.success && result.value.artifacts) {
          allArtifacts.push(...result.value.artifacts);
        }
      });

      // Verify we have all required artifact types
      const uiAuditReport = allArtifacts.find((a) => a.type === 'ui-audit-report');
      const accessibilityReport = allArtifacts.find((a) => a.type === 'accessibility-report');
      const polishReport = allArtifacts.find((a) => a.type === 'polish-report');

      if (!uiAuditReport || !accessibilityReport || !polishReport) {
        this.logger.error('Missing required artifacts from AESTHETIC agents');
        return {
          success: false,
          error: 'Missing required artifacts (ui-audit-report, accessibility-report, or polish-report)',
        };
      }

      // Aggregate results into comprehensive aesthetic-complete artifact
      const aggregatedArtifacts = this.aggregateResults(allArtifacts);

      this.logger.info('AESTHETIC phase completed successfully', {
        totalArtifacts: allArtifacts.length + aggregatedArtifacts.length,
        duration,
      });

      return {
        success: true,
        artifacts: [...allArtifacts, ...aggregatedArtifacts],
      };
    } catch (error) {
      this.logger.error('AESTHETIC phase execution failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in AESTHETIC phase',
      };
    }
  }

  protected aggregateResults(artifacts: Artifact[]): Artifact[] {
    this.logger.info('Aggregating AESTHETIC phase results');

    const uiAudit = artifacts.find((a) => a.type === 'ui-audit-report')?.content;
    const accessibility = artifacts.find((a) => a.type === 'accessibility-report')?.content;
    const polish = artifacts.find((a) => a.type === 'polish-report')?.content;

    // Calculate comprehensive aesthetic scores
    const uiQualityScore = uiAudit?.summary?.uiQualityScore || 0;
    const accessibilityScore = accessibility?.summary?.accessibilityScore || 0;
    const polishScore = polish?.summary?.polishScore || 0;
    const delightScore = polish?.summary?.delightScore || 0;

    // Weighted overall score (UI: 30%, A11y: 40%, Polish: 30%)
    const overallAestheticScore = Math.round(
      uiQualityScore * 0.3 + accessibilityScore * 0.4 + polishScore * 0.3
    );

    // Count total issues across all areas
    const totalIssues =
      (uiAudit?.summary?.totalIssues || 0) +
      (accessibility?.summary?.totalViolations || 0) +
      (polish?.summary?.totalIssues || 0);

    const criticalIssues =
      (uiAudit?.summary?.criticalIssues || 0) +
      (accessibility?.summary?.criticalViolations || 0) +
      (polish?.summary?.criticalIssues || 0);

    const highIssues =
      (uiAudit?.summary?.highIssues || 0) +
      (accessibility?.summary?.seriousViolations || 0) +
      (polish?.summary?.highIssues || 0);

    // Determine aesthetic status and gate evaluation
    const aestheticStatus = this.determineAestheticStatus({
      overallAestheticScore,
      criticalIssues,
      highIssues,
      accessibilityScore,
      wcagAACompliance: accessibility?.summary?.wcagAACompliance || 0,
    });

    const gateEvaluation = this.evaluateAestheticGate({
      aestheticStatus,
      overallAestheticScore,
      criticalIssues,
      highIssues,
      accessibilityScore,
      wcagAACompliance: accessibility?.summary?.wcagAACompliance || 0,
    });

    // Combine top recommendations from all agents
    const topRecommendations = [
      ...(uiAudit?.recommendations?.slice(0, 3) || []),
      ...(accessibility?.recommendations?.slice(0, 3) || []),
      ...(polish?.recommendations?.slice(0, 3) || []),
    ].sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    const aggregated = {
      summary: {
        totalIssues,
        criticalIssues,
        highIssues,
        overallAestheticScore,
        uiQualityScore,
        accessibilityScore,
        polishScore,
        delightScore,
        wcagAACompliance: accessibility?.summary?.wcagAACompliance || 0,
        wcagAAACompliance: accessibility?.summary?.wcagAAACompliance || 0,
      },
      uiDesign: {
        qualityScore: uiQualityScore,
        designSystemScore: uiAudit?.summary?.designSystemScore || 0,
        totalIssues: uiAudit?.summary?.totalIssues || 0,
        criticalIssues: uiAudit?.summary?.criticalIssues || 0,
        topIssues: uiAudit?.issues?.slice(0, 5) || [],
        qualityMetrics: uiAudit?.qualityMetrics || {},
        designSystemCompliance: uiAudit?.designSystemCompliance || [],
        brandConsistency: uiAudit?.brandConsistency || [],
      },
      accessibility: {
        wcagAACompliance: accessibility?.summary?.wcagAACompliance || 0,
        wcagAAACompliance: accessibility?.summary?.wcagAAACompliance || 0,
        accessibilityScore: accessibilityScore,
        totalViolations: accessibility?.summary?.totalViolations || 0,
        criticalViolations: accessibility?.summary?.criticalViolations || 0,
        topViolations: accessibility?.violations?.slice(0, 5) || [],
        wcagCompliance: accessibility?.wcagCompliance || [],
        keyboardNavigation: accessibility?.keyboardNavigation || [],
        screenReaderSupport: accessibility?.screenReaderSupport || [],
        colorContrast: accessibility?.colorContrast || [],
      },
      polish: {
        polishScore,
        delightScore,
        totalIssues: polish?.summary?.totalIssues || 0,
        criticalIssues: polish?.summary?.criticalIssues || 0,
        topIssues: polish?.issues?.slice(0, 5) || [],
        qualityMetrics: polish?.qualityMetrics || {},
        animations: polish?.animations || [],
        microInteractions: polish?.microInteractions || [],
        loadingStates: polish?.loadingStates || [],
        emptyStates: polish?.emptyStates || [],
        errorStates: polish?.errorStates || [],
        performance: polish?.performance || {},
      },
      aestheticStatus,
      gateEvaluation,
      topRecommendations,
      metrics: {
        designConsistency: uiAudit?.qualityMetrics?.breakdown?.consistency || 0,
        spacing: uiAudit?.qualityMetrics?.breakdown?.spacing || 0,
        typography: uiAudit?.qualityMetrics?.breakdown?.typography || 0,
        colorUsage: uiAudit?.qualityMetrics?.breakdown?.colorUsage || 0,
        responsiveness: uiAudit?.qualityMetrics?.breakdown?.responsiveness || 0,
        visualHierarchy: uiAudit?.qualityMetrics?.breakdown?.visualHierarchy || 0,
        wcagCompliance: accessibilityScore,
        animations: polish?.qualityMetrics?.breakdown?.animations || 0,
        transitions: polish?.qualityMetrics?.breakdown?.transitions || 0,
        microInteractions: polish?.qualityMetrics?.breakdown?.microInteractions || 0,
      },
    };

    return [
      {
        type: 'aesthetic-complete',
        content: aggregated,
        metadata: {
          phaseCoordinator: 'AestheticPhaseCoordinator',
          generatedAt: new Date().toISOString(),
          agentCount: 3,
          overallScore: overallAestheticScore,
          status: aestheticStatus,
        },
      },
    ];
  }

  private determineAestheticStatus(summary: any): 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK' | 'CRITICAL' {
    const { overallAestheticScore, criticalIssues, highIssues, accessibilityScore, wcagAACompliance } = summary;

    // Critical: Critical a11y violations or very low scores
    if (criticalIssues > 0 || accessibilityScore < 60 || wcagAACompliance < 70) {
      return 'CRITICAL';
    }

    // Needs work: High issues or low scores
    if (highIssues > 5 || overallAestheticScore < 70 || accessibilityScore < 75) {
      return 'NEEDS_WORK';
    }

    // Excellent: High scores across all areas
    if (overallAestheticScore >= 85 && accessibilityScore >= 90 && wcagAACompliance >= 95) {
      return 'EXCELLENT';
    }

    // Good: Acceptable scores
    return 'GOOD';
  }

  private evaluateAestheticGate(summary: any): {
    passed: boolean;
    reasons: string[];
    recommendations: string[];
    requiredActions: string[];
  } {
    const { aestheticStatus, overallAestheticScore, criticalIssues, accessibilityScore, wcagAACompliance } =
      summary;

    const reasons: string[] = [];
    const recommendations: string[] = [];
    const requiredActions: string[] = [];

    // Gate criteria: No critical issues, WCAG AA >= 80%, overall score >= 75
    let passed = true;

    if (criticalIssues > 0) {
      passed = false;
      reasons.push(`${criticalIssues} critical aesthetic/accessibility issue(s) must be resolved`);
      requiredActions.push('Fix all critical issues before proceeding');
    }

    if (wcagAACompliance < 80) {
      passed = false;
      reasons.push(`WCAG AA compliance is ${wcagAACompliance}% (minimum 80% required)`);
      requiredActions.push('Improve accessibility to meet WCAG AA standards');
    }

    if (accessibilityScore < 70) {
      passed = false;
      reasons.push(`Accessibility score is ${accessibilityScore}/100 (minimum 70 required)`);
      requiredActions.push('Address accessibility violations');
    }

    if (overallAestheticScore < 75) {
      passed = false;
      reasons.push(`Overall aesthetic score is ${overallAestheticScore}/100 (minimum 75 required)`);
      requiredActions.push('Improve UI quality, polish, or accessibility');
    }

    // Recommendations based on status
    if (aestheticStatus === 'EXCELLENT') {
      recommendations.push('Aesthetic quality is excellent! Ready for production.');
    } else if (aestheticStatus === 'GOOD') {
      recommendations.push('Aesthetic quality is good. Consider minor improvements for excellence.');
    } else if (aestheticStatus === 'NEEDS_WORK') {
      recommendations.push('Aesthetic quality needs improvement. Focus on high-priority issues.');
    } else if (aestheticStatus === 'CRITICAL') {
      recommendations.push('Critical aesthetic/accessibility issues must be resolved immediately.');
    }

    if (passed) {
      reasons.push('All aesthetic quality gates passed');
      reasons.push(`Overall score: ${overallAestheticScore}/100`);
      reasons.push(`WCAG AA compliance: ${wcagAACompliance}%`);
    }

    return {
      passed,
      reasons,
      recommendations,
      requiredActions,
    };
  }
}

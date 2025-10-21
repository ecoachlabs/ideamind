/**
 * Concrete Gate Implementations
 *
 * Implements all gates from the Level-2 microflow specification
 * Plus M1-M9 Autonomous Innovation gates
 */

import { Gatekeeper, GateRubric } from './gatekeeper';
import { Recorder } from '../recorder/recorder';

// Re-export BetaGate
export { BetaGate } from './beta-gate';

// M2: API Breakage Gate (from governance module)
export { APIBreakageGate } from '../governance/api-breakage';

/**
 * Critique Gate
 * Requirements:
 * - unresolved criticals = 0
 * - confidence ≥ 0.7
 * - counterfactuals ≥ 5
 */
export class CritiqueGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'critique-gate',
      name: 'Critique Gate',
      description: 'Validates critique quality and coverage',
      minimumScore: 70,
      metrics: [
        {
          id: 'unresolved_criticals',
          name: 'Unresolved Critical Issues',
          description: 'Number of unresolved critical issues',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'confidence',
          name: 'Critique Confidence',
          description: 'Confidence in critique analysis',
          type: 'percentage',
          operator: '>=',
          threshold: 0.7,
          weight: 0.15,
          required: true,
        },
        {
          id: 'counterfactuals',
          name: 'Counterfactual Scenarios',
          description: 'Number of counterfactual scenarios explored',
          type: 'count',
          operator: '>=',
          threshold: 5,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75,
          weight: 0.10,
          required: false,
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.05,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['critique-report', 'pre-mortem', 'counterfactuals'];

    super('critique-gate', 'Critique Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * PRD Gate
 * Requirements:
 * - AC completeness ≥ 0.85
 * - RTM link coverage ≥ 0.9
 * - NFR coverage ≥ 0.8
 */
export class PRDGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'prd-gate',
      name: 'PRD Gate',
      description: 'Validates PRD completeness and quality',
      minimumScore: 80,
      metrics: [
        {
          id: 'ac_completeness',
          name: 'Acceptance Criteria Completeness',
          description: 'Percentage of stories with complete acceptance criteria',
          type: 'percentage',
          operator: '>=',
          threshold: 0.85,
          weight: 0.175,
          required: true,
        },
        {
          id: 'rtm_coverage',
          name: 'Requirements Traceability Matrix Coverage',
          description: 'Percentage of requirements linked in RTM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.9,
          weight: 0.175,
          required: true,
        },
        {
          id: 'nfr_coverage',
          name: 'Non-Functional Requirements Coverage',
          description: 'Coverage of NFRs (performance, security, a11y, etc.)',
          type: 'percentage',
          operator: '>=',
          threshold: 0.8,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75,
          weight: 0.10,
          required: false,
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.05,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['prd', 'user-stories', 'rtm', 'nfr-pack'];

    super('prd-gate', 'PRD Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Viability Gate
 * Requirements:
 * - LTV:CAC ≥ 3.0
 * - payback ≤ 12 months
 * - 1+ viable channel
 */
export class ViabilityGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'viability-gate',
      name: 'Viability Gate',
      description: 'Validates business model viability',
      minimumScore: 70,
      metrics: [
        {
          id: 'ltv_cac_ratio',
          name: 'LTV:CAC Ratio',
          description: 'Lifetime Value to Customer Acquisition Cost ratio',
          type: 'numeric',
          operator: '>=',
          threshold: 3.0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'payback_months',
          name: 'Payback Period (months)',
          description: 'Time to recover customer acquisition cost',
          type: 'numeric',
          operator: '<=',
          threshold: 12,
          weight: 0.15,
          required: true,
        },
        {
          id: 'viable_channels',
          name: 'Viable GTM Channels',
          description: 'Number of viable go-to-market channels',
          type: 'count',
          operator: '>=',
          threshold: 1,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75,
          weight: 0.10,
          required: false,
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.05,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['ltv-cac-model', 'gtm-plan', 'unit-economics'];

    super('viability-gate', 'Viability Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Architecture Gate
 * Requirements:
 * - ADR completeness ≥ 0.95
 * - Unreviewed tech choices = 0
 * - All entities have schemas
 */
export class ArchitectureGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'architecture-gate',
      name: 'Architecture Gate',
      description: 'Validates architecture completeness and quality',
      minimumScore: 85,
      metrics: [
        {
          id: 'adr_completeness',
          name: 'ADR Completeness',
          description: 'Percentage of architecture decisions recorded',
          type: 'percentage',
          operator: '>=',
          threshold: 0.95,
          weight: 0.175,
          required: true,
        },
        {
          id: 'unreviewed_tech_choices',
          name: 'Unreviewed Tech Choices',
          description: 'Number of unreviewed technology choices',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.15,
          required: true,
        },
        {
          id: 'schema_coverage',
          name: 'Schema Coverage',
          description: 'Percentage of entities with defined schemas',
          type: 'percentage',
          operator: '>=',
          threshold: 1.0,
          weight: 0.175,
          required: true,
        },
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75,
          weight: 0.10,
          required: false,
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.05,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['architecture-plan', 'api-spec', 'data-model', 'threat-model'];

    super('architecture-gate', 'Architecture Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Security Gate
 * Requirements:
 * - critical vulns = 0
 * - threat mitigations linked
 * - secrets policy pass
 */
export class SecurityGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'security-gate',
      name: 'Security Gate',
      description: 'Validates security posture',
      minimumScore: 90,
      metrics: [
        {
          id: 'critical_vulnerabilities',
          name: 'Critical Vulnerabilities',
          description: 'Number of critical security vulnerabilities',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.5,
          required: true,
        },
        {
          id: 'threat_mitigation_coverage',
          name: 'Threat Mitigation Coverage',
          description: 'Percentage of threats with linked mitigations',
          type: 'percentage',
          operator: '>=',
          threshold: 1.0,
          weight: 0.3,
          required: true,
        },
        {
          id: 'secrets_policy_pass',
          name: 'Secrets Policy Compliance',
          description: 'Secrets management policy compliance',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.2,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['security-scan', 'threat-model', 'secrets-audit'];

    super('security-gate', 'Security Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Performance Gate
 * Requirements:
 * - p95 latency within target
 * - error budget burn < 10%/day
 */
export class PerformanceGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'performance-gate',
      name: 'Performance Gate',
      description: 'Validates performance and reliability',
      minimumScore: 80,
      metrics: [
        {
          id: 'p95_latency_pass',
          name: 'P95 Latency Target',
          description: 'P95 latency meets target SLO',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.5,
          required: true,
        },
        {
          id: 'error_budget_burn_rate',
          name: 'Error Budget Burn Rate',
          description: 'Daily error budget burn rate (percentage)',
          type: 'percentage',
          operator: '<',
          threshold: 0.1,
          weight: 0.5,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['load-test-report', 'performance-profile'];

    super('performance-gate', 'Performance Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * QA Gate
 * Requirements:
 * - test coverage ≥ 0.9
 * - critical security vulnerabilities = 0
 * - performance targets met
 */
export class QAGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'qa-gate',
      name: 'QA Gate',
      description: 'Validates quality assurance coverage',
      minimumScore: 85,
      metrics: [
        {
          id: 'test_coverage',
          name: 'Test Coverage',
          description: 'Code coverage from automated tests',
          type: 'percentage',
          operator: '>=',
          threshold: 0.9,
          weight: 0.20,
          required: true,
        },
        {
          id: 'critical_vulnerabilities',
          name: 'Critical Vulnerabilities',
          description: 'Number of critical security vulnerabilities',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.15,
          required: true,
        },
        {
          id: 'performance_targets_met',
          name: 'Performance Targets Met',
          description: 'All performance targets met',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75,
          weight: 0.10,
          required: false,
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.05,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['e2e-test-report', 'coverage-report', 'dast-report', 'load-test-report'];

    super('qa-gate', 'QA Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Accessibility Gate
 * Requirements:
 * - WCAG 2.2 AA automated pass
 * - manual spot checks
 */
export class AccessibilityGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'accessibility-gate',
      name: 'Accessibility Gate',
      description: 'Validates accessibility compliance (WCAG 2.2 AA)',
      minimumScore: 90,
      metrics: [
        {
          id: 'wcag_aa_automated_pass',
          name: 'WCAG 2.2 AA Automated Tests',
          description: 'Automated WCAG 2.2 AA tests pass',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.6,
          required: true,
        },
        {
          id: 'manual_spot_checks_pass',
          name: 'Manual Spot Checks',
          description: 'Manual accessibility spot checks pass',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.4,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['axe-report', 'contrast-audit', 'manual-a11y-checklist'];

    super('accessibility-gate', 'Accessibility Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Aesthetic Gate
 * Requirements:
 * - WCAG 2.2 AA compliance
 * - Visual regression tests pass
 * - Brand consistency checks
 */
export class AestheticGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'aesthetic-gate',
      name: 'Aesthetic Gate',
      description: 'Validates aesthetic quality and brand consistency',
      minimumScore: 80,
      metrics: [
        {
          id: 'wcag_compliance',
          name: 'WCAG 2.2 AA Compliance',
          description: 'WCAG 2.2 AA compliance score',
          type: 'percentage',
          operator: '>=',
          threshold: 1.0,
          weight: 0.4,
          required: true,
        },
        {
          id: 'visual_regression_pass',
          name: 'Visual Regression Tests',
          description: 'Visual regression tests pass',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.3,
          required: false,
        },
        {
          id: 'brand_consistency',
          name: 'Brand Consistency',
          description: 'Brand consistency checks pass',
          type: 'percentage',
          operator: '>=',
          threshold: 0.95,
          weight: 0.3,
          required: false,
        },
      ],
    };

    const requiredArtifacts = ['axe-report', 'visual-diff-report', 'lighthouse-report'];

    super('aesthetic-gate', 'Aesthetic Gate', rubric, requiredArtifacts, recorder);
  }
}

// ============================================================================
// M1-M9 Autonomous Innovation Gates
// ============================================================================

/**
 * Cost Budget Gate (M3)
 * Requirements:
 * - Budget not exceeded
 * - Cost per phase within limits
 * - Optimization recommendations reviewed
 */
export class CostBudgetGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'cost-budget-gate',
      name: 'Cost Budget Gate',
      description: 'Validates cost budget compliance',
      minimumScore: 90,
      metrics: [
        {
          id: 'budget_exceeded',
          name: 'Budget Not Exceeded',
          description: 'Total cost within budget',
          type: 'boolean',
          operator: '=',
          threshold: false,
          weight: 0.5,
          required: true,
        },
        {
          id: 'cost_per_phase_within_limits',
          name: 'Cost Per Phase Within Limits',
          description: 'Each phase cost within allocated limits',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.3,
          required: true,
        },
        {
          id: 'optimization_recommendations_reviewed',
          name: 'Optimization Recommendations Reviewed',
          description: 'Cost optimization recommendations reviewed',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.2,
          required: false,
        },
      ],
    };

    const requiredArtifacts = ['cost-report', 'budget-tracking'];

    super('cost-budget-gate', 'Cost Budget Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * RAG Quality Gate (M4)
 * Requirements:
 * - Citation coverage ≥ 90%
 * - Retrieval precision ≥ 0.8
 * - Corpus freshness ≤ 30 days
 */
export class RAGQualityGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'rag-quality-gate',
      name: 'RAG Quality Gate',
      description: 'Validates RAG quality metrics',
      minimumScore: 85,
      metrics: [
        {
          id: 'citation_coverage',
          name: 'Citation Coverage',
          description: 'Percentage of claims with citations',
          type: 'percentage',
          operator: '>=',
          threshold: 0.9,
          weight: 0.4,
          required: true,
        },
        {
          id: 'retrieval_precision',
          name: 'Retrieval Precision',
          description: 'Precision of retrieval results',
          type: 'percentage',
          operator: '>=',
          threshold: 0.8,
          weight: 0.3,
          required: true,
        },
        {
          id: 'corpus_freshness',
          name: 'Corpus Freshness',
          description: 'Maximum document staleness (days)',
          type: 'numeric',
          operator: '<=',
          threshold: 30,
          weight: 0.3,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['rag-quality-report', 'citation-coverage'];

    super('rag-quality-gate', 'RAG Quality Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Compliance Gate (M7)
 * Requirements:
 * - License compliance pass
 * - ToS violations = 0
 * - IP provenance tracked
 */
export class ComplianceGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'compliance-gate',
      name: 'Compliance Gate',
      description: 'Validates compliance with licenses and ToS',
      minimumScore: 95,
      metrics: [
        {
          id: 'license_compliance',
          name: 'License Compliance',
          description: 'All dependencies license-compliant',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.4,
          required: true,
        },
        {
          id: 'tos_violations',
          name: 'ToS Violations',
          description: 'Number of Terms of Service violations',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.4,
          required: true,
        },
        {
          id: 'ip_provenance_tracked',
          name: 'IP Provenance Tracked',
          description: 'All code has provenance tracked',
          type: 'percentage',
          operator: '>=',
          threshold: 1.0,
          weight: 0.2,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['license-scan', 'tos-scan', 'provenance-report'];

    super('compliance-gate', 'Compliance Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Code Quality Gate (M8)
 * Requirements:
 * - Dead code identified and removed
 * - Circular dependencies = 0
 * - Change size ≤ 10% for refactors
 */
export class CodeQualityGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'code-quality-gate',
      name: 'Code Quality Gate',
      description: 'Validates code quality metrics',
      minimumScore: 80,
      metrics: [
        {
          id: 'dead_code_removed',
          name: 'Dead Code Removed',
          description: 'Identified dead code has been removed',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.3,
          required: false,
        },
        {
          id: 'circular_dependencies',
          name: 'Circular Dependencies',
          description: 'Number of circular dependencies',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.4,
          required: true,
        },
        {
          id: 'change_size_acceptable',
          name: 'Change Size Acceptable',
          description: 'Refactor change size ≤ 10%',
          type: 'boolean',
          operator: '=',
          threshold: true,
          weight: 0.3,
          required: false,
        },
      ],
    };

    const requiredArtifacts = ['code-graph-report', 'delta-analysis'];

    super('code-quality-gate', 'Code Quality Gate', rubric, requiredArtifacts, recorder);
  }
}

/**
 * Design Gate (Extended)
 * Requirements:
 * - Critical issues = 0
 * - High issues < 3
 * - Design score ≥ 70
 */
export class DesignGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'design-gate',
      name: 'Design Gate',
      description: 'Validates UX/product design quality',
      minimumScore: 70,
      metrics: [
        {
          id: 'critical_issues',
          name: 'Critical Design Issues',
          description: 'Number of critical UX/product issues',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.25,
          required: true,
        },
        {
          id: 'high_issues',
          name: 'High Severity Issues',
          description: 'Number of high severity design issues',
          type: 'count',
          operator: '<',
          threshold: 3,
          weight: 0.15,
          required: true,
        },
        {
          id: 'design_score',
          name: 'Overall Design Score',
          description: 'Design quality score (0-100)',
          type: 'numeric',
          operator: '>=',
          threshold: 70,
          weight: 0.10,
          required: true,
        },
        {
          id: 'km_coverage_ratio',
          name: 'Knowledge Map Coverage',
          description: 'Percentage of priority themes documented in KM',
          type: 'percentage',
          operator: '>=',
          threshold: 0.70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'km_high_priority_open',
          name: 'Critical Unanswered Questions',
          description: 'Count of high-priority questions without answers',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.20,
          required: true,
        },
        {
          id: 'km_acceptance_rate',
          name: 'Knowledge Map Quality',
          description: 'Percentage of Q/A pairs that passed validation',
          type: 'percentage',
          operator: '>=',
          threshold: 0.75,
          weight: 0.10,
          required: false,
        },
        {
          id: 'km_critical_conflicts',
          name: 'Unresolved KM Conflicts',
          description: 'Count of contradictions in Knowledge Map',
          type: 'count',
          operator: '=',
          threshold: 0,
          weight: 0.05,
          required: true,
        },
      ],
    };

    const requiredArtifacts = ['design-critique', 'prd'];

    super('design-gate', 'Design Gate', rubric, requiredArtifacts, recorder);
  }
}

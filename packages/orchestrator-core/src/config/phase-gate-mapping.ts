/**
 * Phase-Gate Mapping Configuration
 *
 * Defines which gates apply to which phases, along with:
 * - Required metrics
 * - Retry policies
 * - Budget allocations
 * - Event topics
 */

import {
  CritiqueGate,
  PRDGate,
  ViabilityGate,
  ArchitectureGate,
  SecurityGate,
  PerformanceGate,
  QAGate,
  AccessibilityGate,
  AestheticGate,
  BetaGate,
} from '../gatekeeper/gates';
import { Gatekeeper } from '../gatekeeper/gatekeeper';
import { Recorder } from '../recorder/recorder';
import { EventTopic } from '../dispatcher/dispatcher';

export interface PhaseGateConfig {
  phaseName: string;
  gateConstructor?: new (recorder?: Recorder) => Gatekeeper;
  budget: {
    maxCostUsd: number;
    maxTokens: number;
  };
  minRequiredAgents: number;
  maxConcurrency: number;
  maxGateRetries: number;
  autoRetryOnGateFail: boolean;
  completionEvent: EventTopic | string;
  description: string;
}

/**
 * Master phase-gate mapping for all 12 phases
 */
export const PHASE_GATE_MAPPING: Record<string, PhaseGateConfig> = {
  INTAKE: {
    phaseName: 'INTAKE',
    gateConstructor: undefined, // No quality gate for intake (validation is inline)
    budget: {
      maxCostUsd: 0.5,
      maxTokens: 15000,
    },
    minRequiredAgents: 3, // All 3 intake agents must succeed
    maxConcurrency: 3,
    maxGateRetries: 0,
    autoRetryOnGateFail: false,
    completionEvent: EventTopic.INTAKE_READY,
    description: 'Intake & Project Spin-Up - Parse, clarify, validate idea',
  },

  IDEATION: {
    phaseName: 'IDEATION',
    gateConstructor: undefined, // No formal gate (quality is subjective)
    budget: {
      maxCostUsd: 2.0,
      maxTokens: 50000,
    },
    minRequiredAgents: 4, // All 4 ideation agents
    maxConcurrency: 4,
    maxGateRetries: 0,
    autoRetryOnGateFail: false,
    completionEvent: EventTopic.IDEATION_READY,
    description: 'Deep Ideation & Strategy - Use cases, personas, KPIs',
  },

  CRITIQUE: {
    phaseName: 'CRITIQUE',
    gateConstructor: CritiqueGate,
    budget: {
      maxCostUsd: 1.5,
      maxTokens: 40000,
    },
    minRequiredAgents: 3, // RedTeam, RiskAnalyzer, AssumptionChallenger
    maxConcurrency: 3,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.CRITIQUE_READY,
    description: 'Red-Team Critique - Unresolved criticals = 0, confidence ≥ 0.7, counterfactuals ≥ 5',
  },

  PRD: {
    phaseName: 'PRD',
    gateConstructor: PRDGate,
    budget: {
      maxCostUsd: 1.8,
      maxTokens: 45000,
    },
    minRequiredAgents: 3, // PRDWriter, FeatureDecomposer, AcceptanceCriteriaWriter
    maxConcurrency: 3,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.PRD_READY,
    description: 'Product Definition - AC ≥ 0.85, RTM ≥ 0.9, NFR ≥ 0.8',
  },

  BIZDEV: {
    phaseName: 'BIZDEV',
    gateConstructor: ViabilityGate,
    budget: {
      maxCostUsd: 2.0,
      maxTokens: 50000,
    },
    minRequiredAgents: 4, // ViabilityAnalyzer, GTMPlanner, PricingModeler, MonetizationAdvisor
    maxConcurrency: 4,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.BIZDEV_READY,
    description: 'BizDev Refinement - LTV:CAC ≥ 3.0, payback ≤ 12mo, 1+ viable channel',
  },

  ARCH: {
    phaseName: 'ARCH',
    gateConstructor: ArchitectureGate,
    budget: {
      maxCostUsd: 2.0,
      maxTokens: 50000,
    },
    minRequiredAgents: 4, // SolutionArchitect, APIDesigner, DataModeler, InfrastructurePlanner
    maxConcurrency: 4,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.ARCH_READY,
    description: 'Architecture & Planning - ADR ≥ 0.95, unreviewed tech = 0, schema coverage = 100%',
  },

  BUILD: {
    phaseName: 'BUILD',
    gateConstructor: undefined, // No gate (success = env deployable)
    budget: {
      maxCostUsd: 1.5,
      maxTokens: 40000,
    },
    minRequiredAgents: 3, // RepoCreator, CICDBuilder, EnvProvisioner
    maxConcurrency: 3,
    maxGateRetries: 0,
    autoRetryOnGateFail: false,
    completionEvent: EventTopic.BUILD_READY,
    description: 'Build Setup & Environments - Repo, CI/CD, IaC, secrets, fixtures',
  },

  STORY_LOOP: {
    phaseName: 'STORY_LOOP',
    gateConstructor: undefined, // Quality gates per story (inline)
    budget: {
      maxCostUsd: 10.0,
      maxTokens: 200000,
    },
    minRequiredAgents: 1, // Sequential story processing (not parallel)
    maxConcurrency: 1, // One story at a time
    maxGateRetries: 0,
    autoRetryOnGateFail: false,
    completionEvent: EventTopic.STORY_DONE,
    description: 'Story Execution Loop - Coder → Reviewer → Test Writer (sequential per story)',
  },

  QA: {
    phaseName: 'QA',
    gateConstructor: QAGate,
    budget: {
      maxCostUsd: 2.0,
      maxTokens: 50000,
    },
    minRequiredAgents: 4, // E2ETestRunner, LoadTester, SecurityScanner, VisualRegressionTester
    maxConcurrency: 4,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.QA_READY,
    description: 'System QA & Reliability - Coverage ≥ 0.9, critical vulns = 0, perf targets met',
  },

  AESTHETIC: {
    phaseName: 'AESTHETIC',
    gateConstructor: AestheticGate,
    budget: {
      maxCostUsd: 1.5,
      maxTokens: 40000,
    },
    minRequiredAgents: 3, // UIAuditor, AccessibilityChecker, PolishAgent
    maxConcurrency: 3,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.AESTHETIC_READY,
    description: 'Aesthetic & Experience - WCAG 2.2 AA, visual regression, brand consistency',
  },

  RELEASE: {
    phaseName: 'RELEASE',
    gateConstructor: undefined, // Security + Performance gates applied inline
    budget: {
      maxCostUsd: 2.0,
      maxTokens: 50000,
    },
    minRequiredAgents: 3, // Packager, Deployer, ReleaseNotesWriter
    maxConcurrency: 3,
    maxGateRetries: 0,
    autoRetryOnGateFail: false,
    completionEvent: EventTopic.RELEASE_READY,
    description: 'Package & Deploy - Docker, SBOM, signatures, migrations, rollout',
  },

  BETA: {
    phaseName: 'BETA',
    gateConstructor: BetaGate,
    budget: {
      maxCostUsd: 2.0,
      maxTokens: 50000,
    },
    minRequiredAgents: 3, // BetaDistributor, TelemetryCollector, AnalyticsReporter
    maxConcurrency: 3,
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
    completionEvent: EventTopic.BETA_READY,
    description: 'Beta & Telemetry - Readiness ≥ 65, channels ≥ 2, testers ≥ 20, privacy ≥ 70',
  },
};

/**
 * Get phase configuration
 */
export function getPhaseConfig(phaseName: string): PhaseGateConfig | undefined {
  return PHASE_GATE_MAPPING[phaseName.toUpperCase()];
}

/**
 * Get all phases with gates
 */
export function getPhasesWithGates(): PhaseGateConfig[] {
  return Object.values(PHASE_GATE_MAPPING).filter((config) => config.gateConstructor);
}

/**
 * Get total budget across all phases
 */
export function getTotalBudget(): { maxCostUsd: number; maxTokens: number } {
  return Object.values(PHASE_GATE_MAPPING).reduce(
    (total, config) => ({
      maxCostUsd: total.maxCostUsd + config.budget.maxCostUsd,
      maxTokens: total.maxTokens + config.budget.maxTokens,
    }),
    { maxCostUsd: 0, maxTokens: 0 }
  );
}

/**
 * Validate phase exists
 */
export function isValidPhase(phaseName: string): boolean {
  return phaseName.toUpperCase() in PHASE_GATE_MAPPING;
}

/**
 * Get phase order
 */
export function getPhaseOrder(): string[] {
  return [
    'INTAKE',
    'IDEATION',
    'CRITIQUE',
    'PRD',
    'BIZDEV',
    'ARCH',
    'BUILD',
    'STORY_LOOP',
    'QA',
    'AESTHETIC',
    'RELEASE',
    'BETA',
  ];
}

/**
 * Get next phase
 */
export function getNextPhase(currentPhase: string): string | null {
  const order = getPhaseOrder();
  const currentIndex = order.indexOf(currentPhase.toUpperCase());

  if (currentIndex === -1 || currentIndex === order.length - 1) {
    return null; // Invalid or last phase
  }

  return order[currentIndex + 1];
}

/**
 * Get previous phase
 */
export function getPreviousPhase(currentPhase: string): string | null {
  const order = getPhaseOrder();
  const currentIndex = order.indexOf(currentPhase.toUpperCase());

  if (currentIndex <= 0) {
    return null; // Invalid or first phase
  }

  return order[currentIndex - 1];
}

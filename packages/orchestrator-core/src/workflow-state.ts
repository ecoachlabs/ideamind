import { WorkflowState } from '@ideamine/event-schemas';
import { PhaseConfig } from './types';

/**
 * Workflow state machine configuration
 *
 * Defines the 12-phase pipeline and valid state transitions
 */
export class WorkflowStateMachine {
  /**
   * Phase configurations for the 12-phase pipeline
   */
  static readonly PHASES: PhaseConfig[] = [
    {
      phaseId: 'intake',
      phaseName: 'Intake & Project Spin-Up',
      state: WorkflowState.INTAKE,
      agents: ['intake-classifier', 'intake-expander', 'intake-validator'],
      isMandatory: true,
      dependencies: [],
    },
    {
      phaseId: 'ideation',
      phaseName: 'Deep Ideation & Strategy',
      state: WorkflowState.IDEATION,
      agents: [
        'strategy-agent',
        'competitive-analyst',
        'tech-stack-recommender',
        'user-persona-builder',
      ],
      isMandatory: true,
      dependencies: ['intake'],
    },
    {
      phaseId: 'critique',
      phaseName: 'Critique Layer (Red-Team)',
      state: WorkflowState.CRITIQUE,
      agents: ['red-team-agent', 'risk-analyzer', 'assumption-challenger'],
      gates: ['critique-gate'],
      isMandatory: true,
      dependencies: ['ideation'],
    },
    {
      phaseId: 'prd',
      phaseName: 'Product Definition (PRD)',
      state: WorkflowState.PRD,
      agents: ['prd-writer', 'feature-decomposer', 'acceptance-criteria-writer'],
      gates: ['prd-completeness-gate'],
      isMandatory: true,
      dependencies: ['critique'],
    },
    {
      phaseId: 'bizdev',
      phaseName: 'BizDev Refinement',
      state: WorkflowState.BIZDEV,
      agents: [
        'viability-analyzer',
        'gtm-planner',
        'pricing-modeler',
        'monetization-advisor',
      ],
      gates: ['viability-gate'],
      isMandatory: true,
      dependencies: ['prd'],
    },
    {
      phaseId: 'architecture',
      phaseName: 'Architecture & Planning',
      state: WorkflowState.ARCHITECTURE,
      agents: [
        'solution-architect',
        'api-designer',
        'data-modeler',
        'infrastructure-planner',
      ],
      gates: ['architecture-review-gate'],
      isMandatory: true,
      dependencies: ['bizdev'],
    },
    {
      phaseId: 'build',
      phaseName: 'Build Setup & Environments',
      state: WorkflowState.BUILD,
      agents: ['repo-creator', 'ci-cd-builder', 'env-provisioner'],
      isMandatory: true,
      dependencies: ['architecture'],
    },
    {
      phaseId: 'security',
      phaseName: 'Security & Privacy Assurance',
      state: WorkflowState.SECURITY,
      agents: [
        'secrets-hygiene-agent',
        'sca-agent',
        'sast-agent',
        'iac-policy-agent',
        'container-hardening-agent',
        'privacy-dpia-agent',
        'threat-model-agent',
        'dast-agent',
        'supply-chain-agent',
      ],
      gates: ['security-gate'],
      isMandatory: true,
      dependencies: ['build'],
    },
    {
      phaseId: 'story-loop',
      phaseName: 'Story Execution Loop',
      state: WorkflowState.STORY_LOOP,
      agents: ['story-coder', 'code-reviewer', 'unit-test-writer'],
      isMandatory: true,
      dependencies: ['build'], // Runs in parallel with security, but both depend on build
    },
    {
      phaseId: 'qa',
      phaseName: 'System QA & Reliability',
      state: WorkflowState.QA,
      agents: [
        'e2e-test-runner',
        'load-tester',
        'security-scanner',
        'visual-regression-tester',
      ],
      gates: ['qa-gate'],
      isMandatory: true,
      dependencies: ['security', 'story-loop'], // Wait for BOTH security gate and story loop
    },
    {
      phaseId: 'aesthetic',
      phaseName: 'Aesthetic & Experience',
      state: WorkflowState.AESTHETIC,
      agents: ['ui-auditor', 'accessibility-checker', 'polish-agent'],
      gates: ['aesthetic-gate'],
      isMandatory: true,
      dependencies: ['qa'],
    },
    {
      phaseId: 'release',
      phaseName: 'Package & Deploy',
      state: WorkflowState.RELEASE,
      agents: ['packager', 'deployer', 'release-notes-writer'],
      isMandatory: true,
      dependencies: ['aesthetic'],
    },
    {
      phaseId: 'beta',
      phaseName: 'Beta Distribution & Telemetry',
      state: WorkflowState.BETA,
      agents: ['beta-distributor', 'telemetry-collector', 'analytics-reporter'],
      isMandatory: true,
      dependencies: ['release'],
    },
  ];

  /**
   * Get phase configuration by ID
   */
  static getPhase(phaseId: string): PhaseConfig | undefined {
    return this.PHASES.find(p => p.phaseId === phaseId);
  }

  /**
   * Get phase by workflow state
   */
  static getPhaseByState(state: WorkflowState): PhaseConfig | undefined {
    return this.PHASES.find(p => p.state === state);
  }

  /**
   * Get next phase
   */
  static getNextPhase(currentPhaseId: string): PhaseConfig | undefined {
    const currentIndex = this.PHASES.findIndex(p => p.phaseId === currentPhaseId);
    if (currentIndex === -1 || currentIndex === this.PHASES.length - 1) {
      return undefined;
    }
    return this.PHASES[currentIndex + 1];
  }

  /**
   * Check if transition is valid
   */
  static isValidTransition(from: WorkflowState, to: WorkflowState): boolean {
    // Allow pausing from any active state
    if (to === WorkflowState.PAUSED) {
      return ![WorkflowState.FAILED, WorkflowState.CLOSED].includes(from);
    }

    // Allow resuming from paused
    if (from === WorkflowState.PAUSED) {
      return true;
    }

    // Allow failing from any active state
    if (to === WorkflowState.FAILED) {
      return from !== WorkflowState.CLOSED;
    }

    // Allow closing from failed or completed
    if (to === WorkflowState.CLOSED) {
      return [WorkflowState.FAILED, WorkflowState.GA].includes(from);
    }

    // Otherwise, follow sequential phase progression
    const fromPhase = this.getPhaseByState(from);
    const toPhase = this.getPhaseByState(to);

    if (!fromPhase || !toPhase) {
      return false;
    }

    const nextPhase = this.getNextPhase(fromPhase.phaseId);
    return nextPhase?.phaseId === toPhase.phaseId;
  }
}

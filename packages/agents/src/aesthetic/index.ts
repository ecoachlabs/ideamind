/**
 * AESTHETIC Phase (Phase 10)
 *
 * Evaluates UI/UX quality, accessibility compliance, and visual polish.
 * Runs 3 agents in PARALLEL for ~3x speedup:
 * - UIAuditorAgent: Design consistency, spacing, typography, color
 * - AccessibilityCheckerAgent: WCAG 2.1 compliance (A, AA, AAA)
 * - PolishAgent: Animations, transitions, micro-interactions
 *
 * Generates comprehensive aesthetic evaluation with quality gates.
 */

export { UIAuditorAgent } from './ui-auditor-agent';
export { AccessibilityCheckerAgent } from './accessibility-checker-agent';
export { PolishAgent } from './polish-agent';
export { AestheticPhaseCoordinator } from './aesthetic-phase-coordinator';

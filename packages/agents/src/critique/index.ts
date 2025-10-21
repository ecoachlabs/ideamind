/**
 * CRITIQUE Phase Agents and Coordinator
 *
 * Phase 3: Critical analysis of product strategy, risks, and assumptions
 *
 * Agents:
 * - RedTeamAgent: Adversarial analysis to find weaknesses
 * - RiskAnalyzerAgent: Systematic risk identification and scoring
 * - AssumptionChallengerAgent: Challenge implicit/explicit assumptions
 *
 * All agents run in PARALLEL for 3x performance improvement.
 */

export { RedTeamAgent } from './redteam-agent';
export { RiskAnalyzerAgent } from './risk-analyzer-agent';
export { AssumptionChallengerAgent } from './assumption-challenger-agent';
export { CritiquePhaseCoordinator } from './critique-phase-coordinator';

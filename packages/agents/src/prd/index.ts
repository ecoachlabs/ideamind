/**
 * PRD Phase Agents and Coordinator
 *
 * Phase 4: Product Requirements Document generation
 *
 * Agents:
 * - PRDWriterAgent: Comprehensive Product Requirements Document
 * - FeatureDecomposerAgent: Epics and user stories
 * - AcceptanceCriteriaWriterAgent: Acceptance criteria for stories
 *
 * All agents run in PARALLEL for 3x performance improvement.
 */

export { PRDWriterAgent } from './prd-writer-agent';
export { FeatureDecomposerAgent } from './feature-decomposer-agent';
export { AcceptanceCriteriaWriterAgent } from './acceptance-criteria-writer-agent';
export { PRDPhaseCoordinator } from './prd-phase-coordinator';

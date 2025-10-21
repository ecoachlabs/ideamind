/**
 * BETA Phase Agents
 *
 * Phase 12 (Final) - Beta testing program management
 *
 * This phase manages the beta testing program with comprehensive
 * distribution, telemetry collection, and analytics reporting.
 *
 * Agents:
 * - BetaDistributorAgent: Multi-channel beta distribution and tester management
 * - TelemetryCollectorAgent: Privacy-compliant telemetry and analytics collection
 * - AnalyticsReporterAgent: Comprehensive analytics reporting and insights
 *
 * Coordinator:
 * - BetaPhaseCoordinator: Orchestrates parallel execution of all BETA agents
 *
 * Execution: PARALLEL (3x speedup)
 * - Sequential: ~40 seconds
 * - Parallel: ~14 seconds
 */

export { BetaDistributorAgent } from './beta-distributor-agent';
export { TelemetryCollectorAgent } from './telemetry-collector-agent';
export { AnalyticsReporterAgent } from './analytics-reporter-agent';
export { BetaPhaseCoordinator } from './beta-phase-coordinator';

// Type exports
export type { BetaStatus, BetaPhaseResult } from './beta-phase-coordinator';

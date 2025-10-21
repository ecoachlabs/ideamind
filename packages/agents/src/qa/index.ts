/**
 * QA Phase (Phase 9)
 *
 * Comprehensive quality assurance testing with 4 specialized agents
 * running in PARALLEL for maximum efficiency.
 *
 * Agents:
 * - E2ETestRunnerAgent: End-to-end user journey tests
 * - LoadTesterAgent: Performance and load testing
 * - SecurityScannerAgent: Security vulnerability scanning
 * - VisualRegressionTesterAgent: UI visual regression testing
 *
 * Pattern: All 4 agents run in parallel (~16s total vs ~58s sequential)
 * Speedup: ~3.6x
 */

export { E2ETestRunnerAgent } from './e2e-test-runner-agent';
export { LoadTesterAgent } from './load-tester-agent';
export { SecurityScannerAgent } from './security-scanner-agent';
export { VisualRegressionTesterAgent } from './visual-regression-tester-agent';
export { QAPhaseCoordinator } from './qa-phase-coordinator';

/**
 * RELEASE Phase (Phase 11)
 *
 * Prepares production-ready deployment packages with comprehensive documentation.
 * Runs 3 agents in PARALLEL for ~3x speedup:
 * - PackagerAgent: Build artifacts, Docker images, NPM packages
 * - DeployerAgent: Deployment strategy, infrastructure, CI/CD
 * - ReleaseNotesWriterAgent: Release notes, changelogs, migration guides
 *
 * Generates complete release package ready for deployment.
 */

export { PackagerAgent } from './packager-agent';
export { DeployerAgent } from './deployer-agent';
export { ReleaseNotesWriterAgent } from './release-notes-writer-agent';
export { ReleasePhaseCoordinator } from './release-phase-coordinator';

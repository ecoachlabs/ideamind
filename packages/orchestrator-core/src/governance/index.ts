/**
 * Governance Module
 *
 * Roadmap: M2 - Governance I
 *
 * Components:
 * - API Breakage: Detect breaking API changes
 * - DB Migrator: Plan/run/rollback database migrations
 */

// API Breakage
export {
  APIBreakageGuard,
  APIDiffTestTool,
  APIBreakageGate,
  type OpenAPISpec,
  type BreakingChange,
  type APIBreakageResult,
  type DiffTestResult,
} from './api-breakage';

// DB Migrator
export {
  DatabaseMigratorAgent,
  type Migration,
  type MigrationPlan,
  type RehearsalReport,
  type DataLossGuard,
  DB_MIGRATOR_MIGRATION,
} from './db-migrator';

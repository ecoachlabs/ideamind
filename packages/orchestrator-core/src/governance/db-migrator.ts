/**
 * Database Migrator Agent
 *
 * Roadmap: M2 - Governance I
 *
 * Agent: agent.db.migrator
 *
 * Plans/runs migrations; generates rollback; rehearses on staging dump.
 *
 * Outputs:
 * - Migration plan
 * - Up/down scripts
 * - Rehearsal report
 *
 * Acceptance:
 * - Rollback rehearsal passes
 * - Data loss guard OK
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';
import crypto from 'crypto';

const logger = pino({ name: 'db-migrator' });

// ============================================================================
// Types
// ============================================================================

export interface Migration {
  id: string;
  name: string;
  upSQL: string;
  downSQL: string;
  checksum: string;
  createdAt: Date;
  appliedAt?: Date;
  rolledBackAt?: Date;
}

export interface MigrationPlan {
  migrations: Migration[];
  targetVersion: string;
  currentVersion: string;
  estimatedDuration: number;
  riskLevel: 'low' | 'medium' | 'high';
  dataLossRisk: boolean;
  affectedTables: string[];
}

export interface RehearsalReport {
  migrationId: string;
  success: boolean;
  upDuration: number;
  downDuration: number;
  errors: string[];
  dataIntegrity: {
    rowCountsBefore: Record<string, number>;
    rowCountsAfter: Record<string, number>;
    checksumsBefore: Record<string, string>;
    checksumsAfter: Record<string, string>;
  };
  rpo: number; // Recovery Point Objective (seconds)
  rto: number; // Recovery Time Objective (seconds)
}

export interface DataLossGuard {
  type: 'column_drop' | 'table_drop' | 'data_modification';
  table: string;
  column?: string;
  estimatedRowsAffected: number;
  severity: 'critical' | 'warning';
}

// ============================================================================
// Database Migrator Agent
// ============================================================================

export class DatabaseMigratorAgent extends EventEmitter {
  private migrationsDir: string;

  constructor(
    private db: Pool,
    baseDir: string = './migrations'
  ) {
    super();
    this.migrationsDir = baseDir;
  }

  /**
   * Plan migrations from current to target version
   */
  async planMigrations(targetVersion?: string): Promise<MigrationPlan> {
    logger.info({ targetVersion }, 'Planning migrations');

    // Get current version
    const currentVersion = await this.getCurrentVersion();

    // Load all migration files
    const allMigrations = await this.loadMigrations();

    // Filter unapplied migrations
    const unapplied = allMigrations.filter((m) => !m.appliedAt);

    if (targetVersion) {
      // Filter to target version
      const targetIndex = unapplied.findIndex((m) => m.id === targetVersion);
      if (targetIndex === -1) {
        throw new Error(`Target version ${targetVersion} not found`);
      }
      unapplied.splice(targetIndex + 1);
    }

    // Analyze migrations for risk
    const affectedTables = this.extractAffectedTables(unapplied);
    const dataLossRisk = await this.checkDataLossRisk(unapplied);
    const riskLevel = this.assessRiskLevel(unapplied, dataLossRisk);

    const plan: MigrationPlan = {
      migrations: unapplied,
      targetVersion: targetVersion || unapplied[unapplied.length - 1]?.id || 'latest',
      currentVersion,
      estimatedDuration: unapplied.length * 5000, // 5s per migration (rough estimate)
      riskLevel,
      dataLossRisk: dataLossRisk.length > 0,
      affectedTables,
    };

    logger.info(
      {
        count: unapplied.length,
        riskLevel,
        dataLossRisk: plan.dataLossRisk,
      },
      'Migration plan created'
    );

    return plan;
  }

  /**
   * Apply migrations
   */
  async applyMigrations(plan: MigrationPlan): Promise<void> {
    logger.info({ count: plan.migrations.length }, 'Applying migrations');

    for (const migration of plan.migrations) {
      await this.applyMigration(migration);
    }

    logger.info('All migrations applied successfully');
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: Migration): Promise<void> {
    logger.info({ migrationId: migration.id }, 'Applying migration');

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Execute up migration
      await client.query(migration.upSQL);

      // Record migration
      await client.query(
        `
        INSERT INTO schema_migrations (id, name, checksum, applied_at)
        VALUES ($1, $2, $3, NOW())
      `,
        [migration.id, migration.name, migration.checksum]
      );

      await client.query('COMMIT');

      this.emit('migration.applied', { migrationId: migration.id });

      logger.info({ migrationId: migration.id }, 'Migration applied');
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error({ migrationId: migration.id, err }, 'Migration failed');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Rollback last migration
   */
  async rollbackLast(): Promise<void> {
    logger.info('Rolling back last migration');

    // Get last applied migration
    const result = await this.db.query(
      `SELECT id, name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      throw new Error('No migrations to rollback');
    }

    const lastMigration = result.rows[0];

    // Load migration
    const migrations = await this.loadMigrations();
    const migration = migrations.find((m) => m.id === lastMigration.id);

    if (!migration) {
      throw new Error(`Migration ${lastMigration.id} not found`);
    }

    await this.rollbackMigration(migration);
  }

  /**
   * Rollback a specific migration
   */
  private async rollbackMigration(migration: Migration): Promise<void> {
    logger.info({ migrationId: migration.id }, 'Rolling back migration');

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Execute down migration
      await client.query(migration.downSQL);

      // Remove migration record
      await client.query(
        `DELETE FROM schema_migrations WHERE id = $1`,
        [migration.id]
      );

      await client.query('COMMIT');

      this.emit('migration.rolled_back', { migrationId: migration.id });

      logger.info({ migrationId: migration.id }, 'Migration rolled back');
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.error({ migrationId: migration.id, err }, 'Rollback failed');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Rehearse migration on staging dump
   */
  async rehearse(
    migration: Migration,
    stagingDb: Pool
  ): Promise<RehearsalReport> {
    logger.info({ migrationId: migration.id }, 'Rehearsing migration');

    const report: RehearsalReport = {
      migrationId: migration.id,
      success: false,
      upDuration: 0,
      downDuration: 0,
      errors: [],
      dataIntegrity: {
        rowCountsBefore: {},
        rowCountsAfter: {},
        checksumsBefore: {},
        checksumsAfter: {},
      },
      rpo: 0,
      rto: 0,
    };

    try {
      // Capture data before migration
      const before = await this.captureDataSnapshot(stagingDb);
      report.dataIntegrity.rowCountsBefore = before.rowCounts;
      report.dataIntegrity.checksumsBefore = before.checksums;

      // Apply up migration
      const upStart = Date.now();
      await stagingDb.query(migration.upSQL);
      report.upDuration = Date.now() - upStart;

      // Capture data after up
      const afterUp = await this.captureDataSnapshot(stagingDb);

      // Apply down migration
      const downStart = Date.now();
      await stagingDb.query(migration.downSQL);
      report.downDuration = Date.now() - downStart;

      // Capture data after down
      const afterDown = await this.captureDataSnapshot(stagingDb);
      report.dataIntegrity.rowCountsAfter = afterDown.rowCounts;
      report.dataIntegrity.checksumsAfter = afterDown.checksums;

      // Verify data integrity (before should match afterDown)
      const integrityOk = this.verifyDataIntegrity(before, afterDown);

      if (!integrityOk) {
        report.errors.push('Data integrity check failed after rollback');
      }

      // Calculate RPO/RTO
      report.rpo = report.downDuration / 1000; // Recovery point in seconds
      report.rto = (report.upDuration + report.downDuration) / 1000; // Recovery time

      report.success = integrityOk && report.errors.length === 0;

      logger.info(
        {
          migrationId: migration.id,
          success: report.success,
          rpo: report.rpo,
          rto: report.rto,
        },
        'Rehearsal complete'
      );

      return report;
    } catch (err: any) {
      report.errors.push(err.message);
      logger.error({ migrationId: migration.id, err }, 'Rehearsal failed');
      return report;
    }
  }

  /**
   * Check for data loss risks
   */
  async checkDataLossRisk(migrations: Migration[]): Promise<DataLossGuard[]> {
    const guards: DataLossGuard[] = [];

    for (const migration of migrations) {
      const sql = migration.upSQL.toLowerCase();

      // Check for DROP TABLE
      const dropTableMatch = sql.match(/drop\s+table\s+(\w+)/gi);
      if (dropTableMatch) {
        for (const match of dropTableMatch) {
          const table = match.split(/\s+/)[2];
          const rowCount = await this.getRowCount(table);

          guards.push({
            type: 'table_drop',
            table,
            estimatedRowsAffected: rowCount,
            severity: rowCount > 0 ? 'critical' : 'warning',
          });
        }
      }

      // Check for DROP COLUMN
      const dropColumnMatch = sql.match(/alter\s+table\s+(\w+)\s+drop\s+column\s+(\w+)/gi);
      if (dropColumnMatch) {
        for (const match of dropColumnMatch) {
          const parts = match.split(/\s+/);
          const table = parts[2];
          const column = parts[5];
          const rowCount = await this.getRowCount(table);

          guards.push({
            type: 'column_drop',
            table,
            column,
            estimatedRowsAffected: rowCount,
            severity: rowCount > 0 ? 'critical' : 'warning',
          });
        }
      }

      // Check for DELETE/UPDATE without WHERE
      if (sql.includes('delete from') && !sql.includes('where')) {
        guards.push({
          type: 'data_modification',
          table: 'unknown',
          estimatedRowsAffected: -1,
          severity: 'critical',
        });
      }
    }

    return guards;
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  /**
   * Get current schema version
   */
  private async getCurrentVersion(): Promise<string> {
    const result = await this.db.query(
      `SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`
    );

    return result.rows[0]?.id || 'none';
  }

  /**
   * Load all migration files
   */
  private async loadMigrations(): Promise<Migration[]> {
    const files = await fs.readdir(this.migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

    const migrations: Migration[] = [];

    for (const file of sqlFiles) {
      const filePath = path.join(this.migrationsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse migration file (expect -- UP and -- DOWN markers)
      const [upSQL, downSQL] = this.parseMigrationFile(content);

      const id = file.replace('.sql', '');
      const checksum = crypto.createHash('md5').update(content).digest('hex');

      // Check if applied
      const result = await this.db.query(
        `SELECT applied_at FROM schema_migrations WHERE id = $1`,
        [id]
      );

      migrations.push({
        id,
        name: file,
        upSQL,
        downSQL,
        checksum,
        createdAt: new Date(), // TODO: Get from file stats
        appliedAt: result.rows[0]?.applied_at,
      });
    }

    return migrations;
  }

  /**
   * Parse migration file into up/down SQL
   */
  private parseMigrationFile(content: string): [string, string] {
    const upMatch = content.match(/-- UP\s+([\s\S]*?)(?:-- DOWN|$)/i);
    const downMatch = content.match(/-- DOWN\s+([\s\S]*?)$/i);

    const upSQL = upMatch ? upMatch[1].trim() : content.trim();
    const downSQL = downMatch ? downMatch[1].trim() : '';

    return [upSQL, downSQL];
  }

  /**
   * Extract affected tables from migrations
   */
  private extractAffectedTables(migrations: Migration[]): string[] {
    const tables = new Set<string>();

    for (const migration of migrations) {
      const sql = migration.upSQL.toLowerCase();

      // Extract table names from CREATE/ALTER/DROP statements
      const createMatch = sql.match(/create\s+table\s+(\w+)/gi);
      const alterMatch = sql.match(/alter\s+table\s+(\w+)/gi);
      const dropMatch = sql.match(/drop\s+table\s+(\w+)/gi);

      [createMatch, alterMatch, dropMatch].forEach((matches) => {
        if (matches) {
          matches.forEach((match) => {
            const parts = match.split(/\s+/);
            tables.add(parts[2]);
          });
        }
      });
    }

    return Array.from(tables);
  }

  /**
   * Assess risk level
   */
  private assessRiskLevel(
    migrations: Migration[],
    dataLossGuards: DataLossGuard[]
  ): 'low' | 'medium' | 'high' {
    if (dataLossGuards.some((g) => g.severity === 'critical')) {
      return 'high';
    }

    if (migrations.length > 10) {
      return 'high';
    }

    if (migrations.length > 5 || dataLossGuards.length > 0) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get row count for a table
   */
  private async getRowCount(table: string): Promise<number> {
    try {
      const result = await this.db.query(`SELECT COUNT(*) FROM ${table}`);
      return parseInt(result.rows[0].count);
    } catch {
      return 0;
    }
  }

  /**
   * Capture data snapshot for integrity check
   */
  private async captureDataSnapshot(
    db: Pool
  ): Promise<{
    rowCounts: Record<string, number>;
    checksums: Record<string, string>;
  }> {
    const snapshot = {
      rowCounts: {} as Record<string, number>,
      checksums: {} as Record<string, string>,
    };

    // Get all tables
    const result = await db.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
    `);

    for (const row of result.rows) {
      const table = row.tablename;

      try {
        // Row count
        const countResult = await db.query(`SELECT COUNT(*) FROM ${table}`);
        snapshot.rowCounts[table] = parseInt(countResult.rows[0].count);

        // Checksum (simplified - hash of all row IDs)
        const checksumResult = await db.query(`
          SELECT MD5(STRING_AGG(id::TEXT, ',' ORDER BY id)) as checksum
          FROM ${table}
        `);
        snapshot.checksums[table] = checksumResult.rows[0]?.checksum || '';
      } catch (err) {
        // Skip tables without 'id' column
        logger.debug({ table, err }, 'Skipped table in snapshot');
      }
    }

    return snapshot;
  }

  /**
   * Verify data integrity between snapshots
   */
  private verifyDataIntegrity(
    before: { rowCounts: Record<string, number>; checksums: Record<string, string> },
    after: { rowCounts: Record<string, number>; checksums: Record<string, string> }
  ): boolean {
    // Check row counts match
    for (const table in before.rowCounts) {
      if (before.rowCounts[table] !== after.rowCounts[table]) {
        logger.warn(
          {
            table,
            before: before.rowCounts[table],
            after: after.rowCounts[table],
          },
          'Row count mismatch'
        );
        return false;
      }
    }

    // Check checksums match
    for (const table in before.checksums) {
      if (before.checksums[table] !== after.checksums[table]) {
        logger.warn({ table }, 'Checksum mismatch');
        return false;
      }
    }

    return true;
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const DB_MIGRATOR_MIGRATION = `
-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  checksum VARCHAR(32) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
  rolled_back_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied ON schema_migrations(applied_at);

COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations';
`;

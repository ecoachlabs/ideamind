/**
 * Workflow Versioner - Mid-Run Workflow Upgrades
 *
 * Spec: orchestrator.txt:6 (Execution Model)
 * "Versioning: new workflow versions can roll forward;
 * MO supports non-breaking upgrades mid-run"
 *
 * **Purpose:**
 * Support evolving workflow definitions without disrupting
 * active runs. Enable non-breaking upgrades mid-run.
 *
 * **Use Cases:**
 * - Add new phase to workflow
 * - Update phase configuration (budgets, guards, etc.)
 * - Fix bugs in phase coordinators
 * - Improve prompts/tools mid-run
 * - Rollback to previous version on issues
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { Recorder } from '../recorder/recorder';
import * as semver from 'semver';

const logger = pino({ name: 'workflow-versioner' });

/**
 * Workflow version definition
 */
export interface WorkflowVersion {
  version: string; // Semver (e.g., "1.2.3")
  workflowId: string; // e.g., "idea-to-ga"
  description: string;
  phases: string[]; // Phase IDs in order
  phaseConfigs: Record<string, any>; // Phase configurations
  breakingChanges: boolean; // Is this a breaking change?
  migrationNotes?: string;
  deprecated?: boolean;
  createdAt: Date;
  createdBy: string;
  metadata?: Record<string, any>;
}

/**
 * Version upgrade path
 */
export interface UpgradePath {
  fromVersion: string;
  toVersion: string;
  safe: boolean; // Can upgrade mid-run?
  migrationSteps: MigrationStep[];
  rollbackSteps: MigrationStep[];
  estimatedDurationMs: number;
}

/**
 * Migration step
 */
export interface MigrationStep {
  id: string;
  description: string;
  action: (runId: string, currentPhase: string) => Promise<void>;
  rollback: (runId: string, currentPhase: string) => Promise<void>;
  safe: boolean; // Can execute mid-run?
}

/**
 * Version compatibility result
 */
export interface CompatibilityCheck {
  compatible: boolean;
  breakingChanges: string[];
  warnings: string[];
  canUpgradeMidRun: boolean;
  recommendedAction: 'upgrade' | 'wait' | 'reject';
}

/**
 * Workflow Versioner
 *
 * Manages workflow versions and enables safe mid-run upgrades.
 */
export class WorkflowVersioner extends EventEmitter {
  private versions: Map<string, WorkflowVersion> = new Map();
  private upgradePaths: Map<string, UpgradePath> = new Map();

  constructor(
    private db: Pool,
    private recorder: Recorder
  ) {
    super();
    this.loadVersionsFromDatabase();
  }

  /**
   * Register a new workflow version
   */
  async registerVersion(version: WorkflowVersion): Promise<void> {
    // Validate semver
    if (!semver.valid(version.version)) {
      throw new Error(`Invalid semver: ${version.version}`);
    }

    logger.info(
      {
        version: version.version,
        workflowId: version.workflowId,
        breakingChanges: version.breakingChanges,
      },
      'Registering workflow version'
    );

    // Store in memory
    const key = `${version.workflowId}:${version.version}`;
    this.versions.set(key, version);

    // Persist to database
    await this.db.query(
      `
      INSERT INTO workflow_versions (
        version, workflow_id, description, phases, phase_configs,
        breaking_changes, migration_notes, deprecated, created_at, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (workflow_id, version) DO UPDATE SET
        description = EXCLUDED.description,
        phases = EXCLUDED.phases,
        phase_configs = EXCLUDED.phase_configs,
        breaking_changes = EXCLUDED.breaking_changes,
        migration_notes = EXCLUDED.migration_notes,
        deprecated = EXCLUDED.deprecated,
        updated_at = NOW()
    `,
      [
        version.version,
        version.workflowId,
        version.description,
        version.phases,
        JSON.stringify(version.phaseConfigs),
        version.breakingChanges,
        version.migrationNotes,
        version.deprecated || false,
        version.createdAt,
        version.createdBy,
        JSON.stringify(version.metadata || {}),
      ]
    );

    this.emit('version.registered', {
      version: version.version,
      workflowId: version.workflowId,
    });

    logger.info({ version: version.version }, 'Workflow version registered');
  }

  /**
   * Upgrade a running workflow to a new version
   *
   * @param runId - Run identifier
   * @param currentPhase - Current phase being executed
   * @param targetVersion - Target version to upgrade to
   * @returns Upgrade result
   */
  async upgradeWorkflow(
    runId: string,
    currentPhase: string,
    targetVersion: string
  ): Promise<{
    success: boolean;
    fromVersion: string;
    toVersion: string;
    durationMs: number;
    stepsExecuted: string[];
    error?: string;
  }> {
    const startTime = Date.now();

    logger.info(
      {
        runId,
        currentPhase,
        targetVersion,
      },
      'Starting workflow upgrade'
    );

    // Get current version for this run
    const currentVersion = await this.getCurrentVersion(runId);

    if (!currentVersion) {
      throw new Error(`No version found for run: ${runId}`);
    }

    if (currentVersion === targetVersion) {
      logger.info({ version: currentVersion }, 'Already at target version');
      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        durationMs: 0,
        stepsExecuted: [],
      };
    }

    // Check compatibility
    const compatibility = await this.checkCompatibility(
      currentVersion,
      targetVersion,
      currentPhase
    );

    if (!compatibility.compatible) {
      throw new Error(
        `Incompatible versions: ${currentVersion} -> ${targetVersion}. Breaking changes: ${compatibility.breakingChanges.join(', ')}`
      );
    }

    if (!compatibility.canUpgradeMidRun) {
      throw new Error(
        `Cannot upgrade mid-run from ${currentVersion} to ${targetVersion}. Please wait for run to complete.`
      );
    }

    // Get upgrade path
    const upgradePath = this.getUpgradePath(currentVersion, targetVersion);

    if (!upgradePath) {
      throw new Error(
        `No upgrade path found: ${currentVersion} -> ${targetVersion}`
      );
    }

    this.emit('upgrade.started', {
      runId,
      fromVersion: currentVersion,
      toVersion: targetVersion,
      steps: upgradePath.migrationSteps.length,
    });

    const stepsExecuted: string[] = [];

    try {
      // Execute migration steps
      for (const step of upgradePath.migrationSteps) {
        logger.debug({ stepId: step.id, stepDescription: step.description }, 'Executing migration step');

        const stepStartTime = Date.now();

        await step.action(runId, currentPhase);

        const stepDuration = Date.now() - stepStartTime;

        stepsExecuted.push(step.id);

        logger.debug(
          { stepId: step.id, durationMs: stepDuration },
          'Migration step completed'
        );

        this.emit('upgrade.step.completed', {
          runId,
          stepId: step.id,
          durationMs: stepDuration,
        });
      }

      // Update run version
      await this.db.query(
        `UPDATE runs SET workflow_version = $1, updated_at = NOW() WHERE id = $2`,
        [targetVersion, runId]
      );

      const totalDuration = Date.now() - startTime;

      // Record upgrade
      await this.recorder.recordStep({
        runId,
        phase: currentPhase,
        step: 'workflow.upgraded',
        actor: 'WorkflowVersioner',
        outputs: [targetVersion],
        cost: { usd: 0, tokens: 0 },
        latency_ms: totalDuration,
        status: 'succeeded',
        metadata: {
          fromVersion: currentVersion,
          toVersion: targetVersion,
          stepsExecuted: stepsExecuted.length,
        },
      });

      this.emit('upgrade.completed', {
        runId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        durationMs: totalDuration,
      });

      logger.info(
        {
          runId,
          fromVersion: currentVersion,
          toVersion: targetVersion,
          durationMs: totalDuration,
        },
        'Workflow upgrade completed'
      );

      return {
        success: true,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        durationMs: totalDuration,
        stepsExecuted,
      };
    } catch (error: any) {
      logger.error(
        {
          error,
          runId,
          fromVersion: currentVersion,
          toVersion: targetVersion,
          stepsExecuted,
        },
        'Workflow upgrade failed, rolling back'
      );

      // Rollback migration steps in reverse order
      const rollbackSteps = upgradePath.rollbackSteps
        .filter((step) => stepsExecuted.includes(step.id))
        .reverse();

      for (const step of rollbackSteps) {
        try {
          await step.rollback(runId, currentPhase);
          logger.debug({ stepId: step.id }, 'Rollback step completed');
        } catch (rollbackError: any) {
          logger.error(
            { rollbackError, stepId: step.id },
            'Rollback step failed'
          );
        }
      }

      this.emit('upgrade.failed', {
        runId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        error: error.message,
      });

      // Record upgrade failure
      await this.recorder.recordStep({
        runId,
        phase: currentPhase,
        step: 'workflow.upgrade_failed',
        actor: 'WorkflowVersioner',
        cost: { usd: 0, tokens: 0 },
        latency_ms: Date.now() - startTime,
        status: 'failed',
        metadata: {
          fromVersion: currentVersion,
          toVersion: targetVersion,
          error: error.message,
          stepsExecuted: stepsExecuted.length,
        },
      });

      return {
        success: false,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        durationMs: Date.now() - startTime,
        stepsExecuted,
        error: error.message,
      };
    }
  }

  /**
   * Check compatibility between two versions
   */
  async checkCompatibility(
    fromVersion: string,
    toVersion: string,
    currentPhase?: string
  ): Promise<CompatibilityCheck> {
    const fromVersionData = await this.getVersion('idea-to-ga', fromVersion);
    const toVersionData = await this.getVersion('idea-to-ga', toVersion);

    if (!fromVersionData || !toVersionData) {
      return {
        compatible: false,
        breakingChanges: ['Version not found'],
        warnings: [],
        canUpgradeMidRun: false,
        recommendedAction: 'reject',
      };
    }

    const breakingChanges: string[] = [];
    const warnings: string[] = [];

    // Check if target version is marked as breaking
    if (toVersionData.breakingChanges) {
      breakingChanges.push('Target version contains breaking changes');
    }

    // Check phase compatibility
    const fromPhases = new Set(fromVersionData.phases);
    const toPhases = new Set(toVersionData.phases);

    // Check for removed phases
    for (const phase of fromPhases) {
      if (!toPhases.has(phase)) {
        breakingChanges.push(`Phase removed: ${phase}`);
      }
    }

    // Check for added phases
    for (const phase of toPhases) {
      if (!fromPhases.has(phase)) {
        warnings.push(`Phase added: ${phase}`);
      }
    }

    // Check if current phase exists in target version
    if (currentPhase && !toPhases.has(currentPhase)) {
      breakingChanges.push(`Current phase ${currentPhase} does not exist in target version`);
    }

    const compatible = breakingChanges.length === 0;
    const canUpgradeMidRun = compatible && !toVersionData.breakingChanges;

    let recommendedAction: 'upgrade' | 'wait' | 'reject';
    if (!compatible) {
      recommendedAction = 'reject';
    } else if (!canUpgradeMidRun) {
      recommendedAction = 'wait';
    } else {
      recommendedAction = 'upgrade';
    }

    return {
      compatible,
      breakingChanges,
      warnings,
      canUpgradeMidRun,
      recommendedAction,
    };
  }

  /**
   * Get current version for a run
   */
  private async getCurrentVersion(runId: string): Promise<string | null> {
    const result = await this.db.query(
      `SELECT workflow_version FROM runs WHERE id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].workflow_version || '1.0.0'; // Default to 1.0.0
  }

  /**
   * Get workflow version
   */
  async getVersion(
    workflowId: string,
    version: string
  ): Promise<WorkflowVersion | null> {
    const key = `${workflowId}:${version}`;

    // Check in-memory cache
    const cached = this.versions.get(key);
    if (cached) {
      return cached;
    }

    // Query database
    const result = await this.db.query(
      `SELECT * FROM workflow_versions WHERE workflow_id = $1 AND version = $2`,
      [workflowId, version]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const versionData: WorkflowVersion = {
      version: row.version,
      workflowId: row.workflow_id,
      description: row.description,
      phases: row.phases,
      phaseConfigs: row.phase_configs,
      breakingChanges: row.breaking_changes,
      migrationNotes: row.migration_notes,
      deprecated: row.deprecated,
      createdAt: row.created_at,
      createdBy: row.created_by,
      metadata: row.metadata,
    };

    // Cache it
    this.versions.set(key, versionData);

    return versionData;
  }

  /**
   * Get latest version for a workflow
   */
  async getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const result = await this.db.query(
      `
      SELECT * FROM workflow_versions
      WHERE workflow_id = $1 AND deprecated = false
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [workflowId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      version: row.version,
      workflowId: row.workflow_id,
      description: row.description,
      phases: row.phases,
      phaseConfigs: row.phase_configs,
      breakingChanges: row.breaking_changes,
      migrationNotes: row.migration_notes,
      deprecated: row.deprecated,
      createdAt: row.created_at,
      createdBy: row.created_by,
      metadata: row.metadata,
    };
  }

  /**
   * Get upgrade path between two versions
   */
  private getUpgradePath(fromVersion: string, toVersion: string): UpgradePath | null {
    const key = `${fromVersion}->${toVersion}`;

    // Return cached path if available
    if (this.upgradePaths.has(key)) {
      return this.upgradePaths.get(key)!;
    }

    // Generate simple upgrade path (in production, would use more sophisticated logic)
    const path: UpgradePath = {
      fromVersion,
      toVersion,
      safe: !semver.major(toVersion) || semver.major(fromVersion) === semver.major(toVersion),
      migrationSteps: [
        {
          id: 'update-metadata',
          description: 'Update run metadata',
          action: async (runId, currentPhase) => {
            await this.db.query(
              `UPDATE runs SET metadata = metadata || '{"upgraded": true, "upgraded_at": "${new Date().toISOString()}"}'::jsonb WHERE id = $1`,
              [runId]
            );
          },
          rollback: async (runId, currentPhase) => {
            await this.db.query(
              `UPDATE runs SET metadata = metadata - 'upgraded' - 'upgraded_at' WHERE id = $1`,
              [runId]
            );
          },
          safe: true,
        },
      ],
      rollbackSteps: [
        {
          id: 'update-metadata',
          description: 'Rollback metadata update',
          action: async () => {},
          rollback: async (runId, currentPhase) => {
            await this.db.query(
              `UPDATE runs SET metadata = metadata - 'upgraded' - 'upgraded_at' WHERE id = $1`,
              [runId]
            );
          },
          safe: true,
        },
      ],
      estimatedDurationMs: 1000,
    };

    this.upgradePaths.set(key, path);

    return path;
  }

  /**
   * Load versions from database
   */
  private async loadVersionsFromDatabase(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT * FROM workflow_versions WHERE deprecated = false`
      );

      for (const row of result.rows) {
        const key = `${row.workflow_id}:${row.version}`;
        this.versions.set(key, {
          version: row.version,
          workflowId: row.workflow_id,
          description: row.description,
          phases: row.phases,
          phaseConfigs: row.phase_configs,
          breakingChanges: row.breaking_changes,
          migrationNotes: row.migration_notes,
          deprecated: row.deprecated,
          createdAt: row.created_at,
          createdBy: row.created_by,
          metadata: row.metadata,
        });
      }

      logger.info({ count: this.versions.size }, 'Workflow versions loaded from database');
    } catch (error: any) {
      logger.warn({ error }, 'Failed to load workflow versions from database');
    }
  }
}

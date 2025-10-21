/**
 * Shard Manager - Tenant/Project Partitioning
 *
 * Spec: orchestrator.txt:13 (Scalability & Resilience)
 * "Sharding: runs partitioned by tenant/project; per-phase worker pools (CPU/GPU)"
 *
 * **Purpose:**
 * Partition runs across multiple execution contexts for:
 * - Tenant isolation
 * - Resource fairness
 * - Horizontal scaling
 * - Failure isolation
 *
 * **Sharding Strategy:**
 * - By Tenant ID: Each tenant gets dedicated resources
 * - By Project ID: Projects within a tenant can be further sharded
 * - By Run ID: For massive parallel execution
 * - Consistent hashing: Minimize resharding on scale events
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const logger = pino({ name: 'shard-manager' });

/**
 * Shard definition
 */
export interface Shard {
  id: string;
  name: string;
  type: 'tenant' | 'project' | 'global';
  tenantId?: string;
  projectId?: string;
  workerPools: {
    [phase: string]: WorkerPool;
  };
  resources: {
    cpuLimit: string; // e.g., "4000m" (4 CPUs)
    memoryLimit: string; // e.g., "16Gi"
    gpuLimit?: number; // Number of GPUs
  };
  status: 'active' | 'draining' | 'offline';
  createdAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Worker pool for a phase within a shard
 */
export interface WorkerPool {
  phase: string;
  minWorkers: number;
  maxWorkers: number;
  currentWorkers: number;
  resourceType: 'cpu' | 'gpu';
  workersPerNode?: number;
}

/**
 * Shard assignment
 */
export interface ShardAssignment {
  runId: string;
  tenantId: string;
  projectId?: string;
  shardId: string;
  assignedAt: Date;
  sticky: boolean; // If true, run stays on this shard
}

/**
 * Shard statistics
 */
export interface ShardStats {
  shardId: string;
  activeRuns: number;
  totalRuns: number;
  cpuUsage: number; // 0.0 to 1.0
  memoryUsage: number; // 0.0 to 1.0
  gpuUsage?: number; // 0.0 to 1.0
  avgRunDuration: number; // milliseconds
  queueDepth: number;
}

/**
 * Shard Manager
 *
 * Manages run sharding for tenant isolation and horizontal scaling.
 * Uses consistent hashing for shard assignment.
 */
export class ShardManager extends EventEmitter {
  private shards: Map<string, Shard> = new Map();
  private assignments: Map<string, ShardAssignment> = new Map(); // runId -> assignment
  private hashRing: string[] = []; // Consistent hash ring

  constructor(private db: Pool) {
    super();
    this.loadShardsFromDatabase();
  }

  /**
   * Create a new shard
   */
  async createShard(shard: Omit<Shard, 'createdAt'>): Promise<Shard> {
    const fullShard: Shard = {
      ...shard,
      createdAt: new Date(),
    };

    logger.info(
      {
        shardId: shard.id,
        type: shard.type,
        tenantId: shard.tenantId,
      },
      'Creating shard'
    );

    // Store in memory
    this.shards.set(shard.id, fullShard);

    // Add to hash ring (multiple virtual nodes for better distribution)
    for (let i = 0; i < 100; i++) {
      const virtualNode = `${shard.id}:${i}`;
      this.hashRing.push(virtualNode);
    }

    // Sort hash ring
    this.hashRing.sort();

    // Persist to database
    await this.db.query(
      `
      INSERT INTO shards (
        shard_id, name, type, tenant_id, project_id, worker_pools,
        resources, status, created_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [
        shard.id,
        shard.name,
        shard.type,
        shard.tenantId,
        shard.projectId,
        JSON.stringify(shard.workerPools),
        JSON.stringify(shard.resources),
        shard.status,
        fullShard.createdAt,
        JSON.stringify(shard.metadata || {}),
      ]
    );

    this.emit('shard.created', {
      shardId: shard.id,
      type: shard.type,
    });

    logger.info({ shardId: shard.id }, 'Shard created');

    return fullShard;
  }

  /**
   * Assign a run to a shard
   *
   * Uses consistent hashing to determine shard assignment.
   * Tenant-specific shards take precedence over global shards.
   */
  async assignRun(
    runId: string,
    tenantId: string,
    projectId?: string
  ): Promise<ShardAssignment> {
    logger.debug({ runId, tenantId, projectId }, 'Assigning run to shard');

    // Check if already assigned
    const existing = this.assignments.get(runId);
    if (existing) {
      logger.debug({ runId, shardId: existing.shardId }, 'Run already assigned');
      return existing;
    }

    // Find tenant-specific shard if exists
    const tenantShard = Array.from(this.shards.values()).find(
      (s) => s.type === 'tenant' && s.tenantId === tenantId && s.status === 'active'
    );

    let shardId: string;

    if (tenantShard) {
      // Use tenant-specific shard
      shardId = tenantShard.id;
      logger.debug({ shardId, tenantId }, 'Assigned to tenant shard');
    } else if (projectId) {
      // Try project-specific shard
      const projectShard = Array.from(this.shards.values()).find(
        (s) =>
          s.type === 'project' &&
          s.tenantId === tenantId &&
          s.projectId === projectId &&
          s.status === 'active'
      );

      if (projectShard) {
        shardId = projectShard.id;
        logger.debug({ shardId, projectId }, 'Assigned to project shard');
      } else {
        // Use consistent hashing for global shards
        shardId = this.getShardByConsistentHash(runId);
        logger.debug({ shardId, runId }, 'Assigned to global shard via consistent hash');
      }
    } else {
      // Use consistent hashing for global shards
      shardId = this.getShardByConsistentHash(runId);
      logger.debug({ shardId, runId }, 'Assigned to global shard via consistent hash');
    }

    // Create assignment
    const assignment: ShardAssignment = {
      runId,
      tenantId,
      projectId,
      shardId,
      assignedAt: new Date(),
      sticky: true, // Runs stay on the same shard
    };

    this.assignments.set(runId, assignment);

    // Persist assignment
    await this.db.query(
      `
      INSERT INTO shard_assignments (
        run_id, tenant_id, project_id, shard_id, assigned_at, sticky
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (run_id) DO UPDATE SET
        shard_id = EXCLUDED.shard_id,
        assigned_at = EXCLUDED.assigned_at
    `,
      [runId, tenantId, projectId, shardId, assignment.assignedAt, assignment.sticky]
    );

    this.emit('run.assigned', {
      runId,
      shardId,
      tenantId,
    });

    logger.info({ runId, shardId }, 'Run assigned to shard');

    return assignment;
  }

  /**
   * Get shard assignment for a run
   */
  async getAssignment(runId: string): Promise<ShardAssignment | null> {
    // Check in-memory cache
    const cached = this.assignments.get(runId);
    if (cached) {
      return cached;
    }

    // Query database
    const result = await this.db.query(
      `SELECT * FROM shard_assignments WHERE run_id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    const assignment: ShardAssignment = {
      runId: row.run_id,
      tenantId: row.tenant_id,
      projectId: row.project_id,
      shardId: row.shard_id,
      assignedAt: row.assigned_at,
      sticky: row.sticky,
    };

    // Cache it
    this.assignments.set(runId, assignment);

    return assignment;
  }

  /**
   * Get shard by ID
   */
  getShard(shardId: string): Shard | undefined {
    return this.shards.get(shardId);
  }

  /**
   * Get all shards
   */
  getAllShards(): Shard[] {
    return Array.from(this.shards.values());
  }

  /**
   * Get shards by tenant
   */
  getShardsByTenant(tenantId: string): Shard[] {
    return Array.from(this.shards.values()).filter(
      (s) => s.tenantId === tenantId || s.type === 'global'
    );
  }

  /**
   * Update shard status (for draining/maintenance)
   */
  async updateShardStatus(
    shardId: string,
    status: Shard['status']
  ): Promise<void> {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard not found: ${shardId}`);
    }

    logger.info({ shardId, status }, 'Updating shard status');

    shard.status = status;

    await this.db.query(
      `UPDATE shards SET status = $1, updated_at = NOW() WHERE shard_id = $2`,
      [status, shardId]
    );

    this.emit('shard.status.updated', {
      shardId,
      status,
    });

    logger.info({ shardId, status }, 'Shard status updated');
  }

  /**
   * Get shard statistics
   */
  async getShardStats(shardId: string): Promise<ShardStats> {
    const result = await this.db.query(
      `
      SELECT
        COUNT(CASE WHEN status = 'running' THEN 1 END) as active_runs,
        COUNT(*) as total_runs,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_duration
      FROM runs
      JOIN shard_assignments ON runs.id = shard_assignments.run_id
      WHERE shard_assignments.shard_id = $1
    `,
      [shardId]
    );

    const row = result.rows[0];

    // Get queue depth (tasks waiting to execute)
    const queueResult = await this.db.query(
      `
      SELECT COUNT(*) as queue_depth
      FROM tasks
      JOIN shard_assignments ON tasks.run_id = shard_assignments.run_id
      WHERE shard_assignments.shard_id = $1 AND tasks.status = 'pending'
    `,
      [shardId]
    );

    const queueDepth = parseInt(queueResult.rows[0].queue_depth, 10);

    // Simulated resource usage (in production, would query metrics system)
    const cpuUsage = Math.random() * 0.5 + 0.3; // 0.3 to 0.8
    const memoryUsage = Math.random() * 0.5 + 0.3;

    return {
      shardId,
      activeRuns: parseInt(row.active_runs, 10),
      totalRuns: parseInt(row.total_runs, 10),
      cpuUsage,
      memoryUsage,
      avgRunDuration: parseFloat(row.avg_duration) || 0,
      queueDepth,
    };
  }

  /**
   * Rebalance runs across shards (for maintenance/scaling)
   */
  async rebalanceShards(): Promise<{
    moved: number;
    failed: number;
  }> {
    logger.info('Starting shard rebalancing');

    let moved = 0;
    let failed = 0;

    // Get all active runs
    const activeRuns = await this.db.query(
      `
      SELECT r.id, r.tenant_id, r.project_id, sa.shard_id
      FROM runs r
      JOIN shard_assignments sa ON r.id = sa.run_id
      WHERE r.status = 'running'
    `
    );

    for (const row of activeRuns.rows) {
      const currentShardId = row.shard_id;
      const currentShard = this.shards.get(currentShardId);

      // Skip if current shard is active
      if (currentShard?.status === 'active') {
        continue;
      }

      // Find new shard
      const newShardId = this.getShardByConsistentHash(row.id);

      if (newShardId !== currentShardId) {
        try {
          // Update assignment
          await this.db.query(
            `UPDATE shard_assignments SET shard_id = $1, assigned_at = NOW() WHERE run_id = $2`,
            [newShardId, row.id]
          );

          this.assignments.set(row.id, {
            runId: row.id,
            tenantId: row.tenant_id,
            projectId: row.project_id,
            shardId: newShardId,
            assignedAt: new Date(),
            sticky: true,
          });

          moved++;

          logger.debug(
            {
              runId: row.id,
              oldShard: currentShardId,
              newShard: newShardId,
            },
            'Run moved to new shard'
          );
        } catch (error: any) {
          failed++;
          logger.error({ error, runId: row.id }, 'Failed to move run');
        }
      }
    }

    logger.info({ moved, failed }, 'Shard rebalancing completed');

    return { moved, failed };
  }

  /**
   * Consistent hashing: get shard for a key
   */
  private getShardByConsistentHash(key: string): string {
    if (this.hashRing.length === 0) {
      throw new Error('No shards available in hash ring');
    }

    // Hash the key
    const hash = this.hash(key);

    // Find first shard in ring with hash >= key hash
    for (const virtualNode of this.hashRing) {
      const nodeHash = this.hash(virtualNode);

      if (nodeHash >= hash) {
        // Extract shard ID from virtual node
        const shardId = virtualNode.split(':')[0];

        // Verify shard is active
        const shard = this.shards.get(shardId);
        if (shard && shard.status === 'active') {
          return shardId;
        }
      }
    }

    // Wrap around to first shard
    const firstVirtualNode = this.hashRing[0];
    const firstShardId = firstVirtualNode.split(':')[0];

    return firstShardId;
  }

  /**
   * Hash function for consistent hashing
   */
  private hash(key: string): number {
    const hash = createHash('md5').update(key).digest('hex');
    // Take first 8 hex digits and convert to integer
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Load shards from database
   */
  private async loadShardsFromDatabase(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT * FROM shards WHERE status != 'offline'`
      );

      for (const row of result.rows) {
        const shard: Shard = {
          id: row.shard_id,
          name: row.name,
          type: row.type,
          tenantId: row.tenant_id,
          projectId: row.project_id,
          workerPools: row.worker_pools,
          resources: row.resources,
          status: row.status,
          createdAt: row.created_at,
          metadata: row.metadata,
        };

        this.shards.set(shard.id, shard);

        // Add to hash ring
        for (let i = 0; i < 100; i++) {
          const virtualNode = `${shard.id}:${i}`;
          this.hashRing.push(virtualNode);
        }
      }

      // Sort hash ring
      this.hashRing.sort();

      logger.info({ count: this.shards.size }, 'Shards loaded from database');
    } catch (error: any) {
      logger.warn({ error }, 'Failed to load shards from database');
    }
  }
}

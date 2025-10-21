/**
 * Autoscaler - Dynamic Worker Pool Scaling
 *
 * Spec: orchestrator.txt:13 (Scalability & Resilience)
 * "Per-phase worker pools (CPU/GPU) scale based on queue depth + resource usage"
 *
 * **Purpose:**
 * Automatically scale worker pools up/down based on:
 * - Queue depth (pending tasks waiting for workers)
 * - CPU/Memory/GPU utilization
 * - Task processing latency
 * - Predictive load forecasting
 *
 * **Scaling Strategy:**
 * - Reactive: Scale based on current metrics (queue depth, CPU usage)
 * - Predictive: Scale based on historical patterns (time-of-day, day-of-week)
 * - Per-phase: Each phase has independent worker pools
 * - Per-shard: Each shard has independent scaling policies
 * - Graceful scale-down: Drain workers before termination
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { Recorder } from '../recorder/recorder';

const logger = pino({ name: 'autoscaler' });

/**
 * Scaling policy for a worker pool
 */
export interface ScalingPolicy {
  id: string;
  shardId: string;
  phase: string;
  resourceType: 'cpu' | 'gpu';

  // Worker limits
  minWorkers: number;
  maxWorkers: number;

  // Scaling triggers
  targetQueueDepth: number; // Scale up if queue depth > this
  targetCpuUtilization: number; // 0.0 to 1.0 (e.g., 0.7 = 70%)
  targetMemoryUtilization: number; // 0.0 to 1.0
  targetTaskLatency: number; // milliseconds

  // Scaling behavior
  scaleUpIncrement: number; // Workers to add on scale up
  scaleDownDecrement: number; // Workers to remove on scale down
  scaleUpCooldown: number; // Minimum ms between scale-ups
  scaleDownCooldown: number; // Minimum ms between scale-downs

  // Advanced
  predictiveScaling: boolean; // Enable predictive scaling
  gracefulShutdown: boolean; // Drain workers before termination

  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Worker pool metrics
 */
export interface WorkerPoolMetrics {
  shardId: string;
  phase: string;
  currentWorkers: number;
  idleWorkers: number;
  busyWorkers: number;
  queueDepth: number; // Tasks waiting
  cpuUtilization: number; // 0.0 to 1.0
  memoryUtilization: number; // 0.0 to 1.0
  gpuUtilization?: number; // 0.0 to 1.0
  avgTaskLatency: number; // milliseconds
  tasksProcessedPerMinute: number;
  timestamp: Date;
}

/**
 * Scaling decision
 */
export interface ScalingDecision {
  id: string;
  policyId: string;
  shardId: string;
  phase: string;
  action: 'scale_up' | 'scale_down' | 'no_change';
  currentWorkers: number;
  targetWorkers: number;
  reason: string;
  metrics: WorkerPoolMetrics;
  createdAt: Date;
  executedAt?: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  error?: string;
}

/**
 * Worker instance
 */
export interface Worker {
  id: string;
  shardId: string;
  phase: string;
  status: 'initializing' | 'idle' | 'busy' | 'draining' | 'terminated';
  resourceType: 'cpu' | 'gpu';
  startedAt: Date;
  lastTaskAt?: Date;
  terminatedAt?: Date;
  currentTaskId?: string;
  metadata?: Record<string, any>;
}

/**
 * Autoscaler
 *
 * Monitors worker pool metrics and scales pools up/down based on
 * scaling policies. Supports reactive and predictive scaling.
 */
export class Autoscaler extends EventEmitter {
  private policies: Map<string, ScalingPolicy> = new Map();
  private workers: Map<string, Worker> = new Map(); // workerId -> Worker
  private lastScaleActions: Map<string, Date> = new Map(); // policyId -> last action time
  private metricsHistory: Map<string, WorkerPoolMetrics[]> = new Map(); // poolKey -> metrics[]

  constructor(
    private db: Pool,
    private recorder: Recorder
  ) {
    super();
    this.loadPoliciesFromDatabase();
  }

  /**
   * Create a scaling policy
   */
  async createPolicy(policy: Omit<ScalingPolicy, 'createdAt' | 'updatedAt'>): Promise<ScalingPolicy> {
    const fullPolicy: ScalingPolicy = {
      ...policy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    logger.info(
      {
        policyId: policy.id,
        shardId: policy.shardId,
        phase: policy.phase,
      },
      'Creating scaling policy'
    );

    this.policies.set(policy.id, fullPolicy);

    // Persist to database
    await this.db.query(
      `
      INSERT INTO scaling_policies (
        policy_id, shard_id, phase, resource_type,
        min_workers, max_workers,
        target_queue_depth, target_cpu_utilization, target_memory_utilization,
        target_task_latency,
        scale_up_increment, scale_down_decrement,
        scale_up_cooldown, scale_down_cooldown,
        predictive_scaling, graceful_shutdown,
        created_at, updated_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `,
      [
        policy.id,
        policy.shardId,
        policy.phase,
        policy.resourceType,
        policy.minWorkers,
        policy.maxWorkers,
        policy.targetQueueDepth,
        policy.targetCpuUtilization,
        policy.targetMemoryUtilization,
        policy.targetTaskLatency,
        policy.scaleUpIncrement,
        policy.scaleDownDecrement,
        policy.scaleUpCooldown,
        policy.scaleDownCooldown,
        policy.predictiveScaling,
        policy.gracefulShutdown,
        fullPolicy.createdAt,
        fullPolicy.updatedAt,
        JSON.stringify(policy.metadata || {}),
      ]
    );

    this.emit('policy.created', { policyId: policy.id });
    logger.info({ policyId: policy.id }, 'Scaling policy created');

    return fullPolicy;
  }

  /**
   * Evaluate scaling policies and make scaling decisions
   *
   * This is the main autoscaling loop. Should be called periodically
   * (e.g., every 30 seconds).
   */
  async evaluatePolicies(): Promise<ScalingDecision[]> {
    const decisions: ScalingDecision[] = [];

    logger.debug('Evaluating scaling policies');

    for (const [policyId, policy] of this.policies) {
      try {
        // Get current metrics
        const metrics = await this.getMetrics(policy.shardId, policy.phase);

        if (!metrics) {
          logger.warn(
            { policyId, shardId: policy.shardId, phase: policy.phase },
            'No metrics available for policy'
          );
          continue;
        }

        // Store metrics history for predictive scaling
        const poolKey = `${policy.shardId}:${policy.phase}`;
        if (!this.metricsHistory.has(poolKey)) {
          this.metricsHistory.set(poolKey, []);
        }
        const history = this.metricsHistory.get(poolKey)!;
        history.push(metrics);

        // Keep only last 1000 metrics (prevent memory bloat)
        if (history.length > 1000) {
          history.shift();
        }

        // Make scaling decision
        const decision = await this.makeScalingDecision(policy, metrics, history);

        if (decision.action !== 'no_change') {
          decisions.push(decision);

          logger.info(
            {
              policyId,
              action: decision.action,
              currentWorkers: decision.currentWorkers,
              targetWorkers: decision.targetWorkers,
              reason: decision.reason,
            },
            'Scaling decision made'
          );

          // Execute scaling action
          await this.executeScalingDecision(decision);
        }
      } catch (error: any) {
        logger.error({ error, policyId }, 'Failed to evaluate policy');
      }
    }

    return decisions;
  }

  /**
   * Make a scaling decision based on policy and metrics
   */
  private async makeScalingDecision(
    policy: ScalingPolicy,
    metrics: WorkerPoolMetrics,
    history: WorkerPoolMetrics[]
  ): Promise<ScalingDecision> {
    const decision: ScalingDecision = {
      id: `sd-${policy.id}-${Date.now()}`,
      policyId: policy.id,
      shardId: policy.shardId,
      phase: policy.phase,
      action: 'no_change',
      currentWorkers: metrics.currentWorkers,
      targetWorkers: metrics.currentWorkers,
      reason: '',
      metrics,
      createdAt: new Date(),
      status: 'pending',
    };

    // Check cooldown periods
    const lastActionTime = this.lastScaleActions.get(policy.id);
    if (lastActionTime) {
      const timeSinceLastAction = Date.now() - lastActionTime.getTime();

      // If we recently scaled, respect cooldown
      if (timeSinceLastAction < Math.min(policy.scaleUpCooldown, policy.scaleDownCooldown)) {
        decision.reason = `Cooldown period active (${timeSinceLastAction}ms since last action)`;
        return decision;
      }
    }

    // Evaluate scale-up conditions
    const shouldScaleUp = this.shouldScaleUp(policy, metrics);
    const shouldScaleDown = this.shouldScaleDown(policy, metrics);

    if (shouldScaleUp.should && !shouldScaleDown.should) {
      // Check cooldown for scale-up
      if (
        lastActionTime &&
        Date.now() - lastActionTime.getTime() < policy.scaleUpCooldown
      ) {
        decision.reason = 'Scale-up cooldown active';
        return decision;
      }

      // Predictive scaling: Check if we should scale up more aggressively
      let increment = policy.scaleUpIncrement;
      if (policy.predictiveScaling) {
        const predictedLoad = this.predictLoad(history);
        if (predictedLoad > metrics.queueDepth * 1.5) {
          increment = Math.min(increment * 2, policy.maxWorkers - metrics.currentWorkers);
          shouldScaleUp.reasons.push('Predictive: High load expected');
        }
      }

      decision.action = 'scale_up';
      decision.targetWorkers = Math.min(
        metrics.currentWorkers + increment,
        policy.maxWorkers
      );
      decision.reason = `Scale up: ${shouldScaleUp.reasons.join(', ')}`;
    } else if (shouldScaleDown.should && !shouldScaleUp.should) {
      // Check cooldown for scale-down
      if (
        lastActionTime &&
        Date.now() - lastActionTime.getTime() < policy.scaleDownCooldown
      ) {
        decision.reason = 'Scale-down cooldown active';
        return decision;
      }

      decision.action = 'scale_down';
      decision.targetWorkers = Math.max(
        metrics.currentWorkers - policy.scaleDownDecrement,
        policy.minWorkers
      );
      decision.reason = `Scale down: ${shouldScaleDown.reasons.join(', ')}`;
    } else if (shouldScaleUp.should && shouldScaleDown.should) {
      decision.reason = 'Conflicting signals: Both scale-up and scale-down conditions met';
    } else {
      decision.reason = 'No scaling needed';
    }

    return decision;
  }

  /**
   * Check if we should scale up
   */
  private shouldScaleUp(
    policy: ScalingPolicy,
    metrics: WorkerPoolMetrics
  ): { should: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check queue depth
    if (metrics.queueDepth > policy.targetQueueDepth) {
      reasons.push(
        `Queue depth ${metrics.queueDepth} > target ${policy.targetQueueDepth}`
      );
    }

    // Check CPU utilization
    if (metrics.cpuUtilization > policy.targetCpuUtilization) {
      reasons.push(
        `CPU ${(metrics.cpuUtilization * 100).toFixed(1)}% > target ${(policy.targetCpuUtilization * 100).toFixed(1)}%`
      );
    }

    // Check memory utilization
    if (metrics.memoryUtilization > policy.targetMemoryUtilization) {
      reasons.push(
        `Memory ${(metrics.memoryUtilization * 100).toFixed(1)}% > target ${(policy.targetMemoryUtilization * 100).toFixed(1)}%`
      );
    }

    // Check task latency
    if (metrics.avgTaskLatency > policy.targetTaskLatency) {
      reasons.push(
        `Task latency ${metrics.avgTaskLatency}ms > target ${policy.targetTaskLatency}ms`
      );
    }

    // Check if all workers are busy
    if (metrics.idleWorkers === 0 && metrics.queueDepth > 0) {
      reasons.push('All workers busy with pending tasks');
    }

    return {
      should: reasons.length > 0 && metrics.currentWorkers < policy.maxWorkers,
      reasons,
    };
  }

  /**
   * Check if we should scale down
   */
  private shouldScaleDown(
    policy: ScalingPolicy,
    metrics: WorkerPoolMetrics
  ): { should: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check queue depth
    if (metrics.queueDepth === 0) {
      reasons.push('Queue empty');
    }

    // Check CPU utilization (only scale down if significantly below target)
    if (metrics.cpuUtilization < policy.targetCpuUtilization * 0.5) {
      reasons.push(
        `CPU ${(metrics.cpuUtilization * 100).toFixed(1)}% < 50% of target`
      );
    }

    // Check memory utilization
    if (metrics.memoryUtilization < policy.targetMemoryUtilization * 0.5) {
      reasons.push(
        `Memory ${(metrics.memoryUtilization * 100).toFixed(1)}% < 50% of target`
      );
    }

    // Check idle workers
    const idlePercentage = metrics.idleWorkers / metrics.currentWorkers;
    if (idlePercentage > 0.5 && metrics.currentWorkers > policy.minWorkers) {
      reasons.push(
        `${(idlePercentage * 100).toFixed(1)}% workers idle`
      );
    }

    return {
      should: reasons.length >= 2 && metrics.currentWorkers > policy.minWorkers,
      reasons,
    };
  }

  /**
   * Predict future load based on historical metrics
   */
  private predictLoad(history: WorkerPoolMetrics[]): number {
    if (history.length < 10) {
      return 0; // Not enough data
    }

    // Simple moving average of queue depth over last 10 metrics
    const recentMetrics = history.slice(-10);
    const avgQueueDepth =
      recentMetrics.reduce((sum, m) => sum + m.queueDepth, 0) / recentMetrics.length;

    // Calculate trend (increasing or decreasing)
    const oldAvg = history.slice(-20, -10).reduce((sum, m) => sum + m.queueDepth, 0) / 10;
    const trend = avgQueueDepth - oldAvg;

    // Predict next queue depth
    return Math.max(0, avgQueueDepth + trend);
  }

  /**
   * Execute a scaling decision
   */
  private async executeScalingDecision(decision: ScalingDecision): Promise<void> {
    decision.status = 'executing';
    decision.executedAt = new Date();

    try {
      logger.info(
        {
          decisionId: decision.id,
          action: decision.action,
          currentWorkers: decision.currentWorkers,
          targetWorkers: decision.targetWorkers,
        },
        'Executing scaling decision'
      );

      // Persist decision
      await this.db.query(
        `
        INSERT INTO scaling_decisions (
          decision_id, policy_id, shard_id, phase, action,
          current_workers, target_workers, reason, metrics,
          created_at, executed_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
        [
          decision.id,
          decision.policyId,
          decision.shardId,
          decision.phase,
          decision.action,
          decision.currentWorkers,
          decision.targetWorkers,
          decision.reason,
          JSON.stringify(decision.metrics),
          decision.createdAt,
          decision.executedAt,
          decision.status,
        ]
      );

      if (decision.action === 'scale_up') {
        await this.scaleUp(
          decision.shardId,
          decision.phase,
          decision.targetWorkers - decision.currentWorkers
        );
      } else if (decision.action === 'scale_down') {
        const policy = this.policies.get(decision.policyId);
        await this.scaleDown(
          decision.shardId,
          decision.phase,
          decision.currentWorkers - decision.targetWorkers,
          policy?.gracefulShutdown || false
        );
      }

      decision.status = 'completed';

      // Update last action time
      this.lastScaleActions.set(decision.policyId, new Date());

      // Update decision status in database
      await this.db.query(
        `UPDATE scaling_decisions SET status = $1 WHERE decision_id = $2`,
        [decision.status, decision.id]
      );

      this.emit('scaling.completed', {
        decisionId: decision.id,
        action: decision.action,
        targetWorkers: decision.targetWorkers,
      });

      logger.info({ decisionId: decision.id }, 'Scaling decision executed');

      // Record in audit trail
      await this.recorder.recordStep({
        runId: 'autoscaler',
        phase: decision.phase,
        step: `autoscale.${decision.action}`,
        actor: 'Autoscaler',
        cost: { usd: 0, tokens: 0 },
        latency_ms: Date.now() - decision.createdAt.getTime(),
        status: 'succeeded',
        metadata: {
          decisionId: decision.id,
          shardId: decision.shardId,
          currentWorkers: decision.currentWorkers,
          targetWorkers: decision.targetWorkers,
          reason: decision.reason,
        },
      });
    } catch (error: any) {
      decision.status = 'failed';
      decision.error = error.message;

      logger.error({ error, decisionId: decision.id }, 'Failed to execute scaling decision');

      await this.db.query(
        `UPDATE scaling_decisions SET status = $1, error_message = $2 WHERE decision_id = $3`,
        [decision.status, decision.error, decision.id]
      );

      this.emit('scaling.failed', {
        decisionId: decision.id,
        error: error.message,
      });
    }
  }

  /**
   * Scale up worker pool
   */
  private async scaleUp(shardId: string, phase: string, count: number): Promise<void> {
    logger.info({ shardId, phase, count }, 'Scaling up worker pool');

    const policy = Array.from(this.policies.values()).find(
      (p) => p.shardId === shardId && p.phase === phase
    );

    if (!policy) {
      throw new Error(`No scaling policy found for shard ${shardId}, phase ${phase}`);
    }

    // Create new workers
    for (let i = 0; i < count; i++) {
      const workerId = `worker-${shardId}-${phase}-${Date.now()}-${i}`;

      const worker: Worker = {
        id: workerId,
        shardId,
        phase,
        status: 'initializing',
        resourceType: policy.resourceType,
        startedAt: new Date(),
      };

      this.workers.set(workerId, worker);

      // Persist worker
      await this.db.query(
        `
        INSERT INTO workers (
          worker_id, shard_id, phase, status, resource_type, started_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          worker.id,
          worker.shardId,
          worker.phase,
          worker.status,
          worker.resourceType,
          worker.startedAt,
          JSON.stringify(worker.metadata || {}),
        ]
      );

      // Simulate worker initialization (in production, would spawn actual worker process)
      setTimeout(async () => {
        worker.status = 'idle';
        await this.db.query(
          `UPDATE workers SET status = $1 WHERE worker_id = $2`,
          [worker.status, worker.id]
        );

        this.emit('worker.ready', { workerId: worker.id, shardId, phase });
        logger.debug({ workerId: worker.id }, 'Worker ready');
      }, 1000);

      logger.debug({ workerId }, 'Worker created');
    }

    this.emit('pool.scaled_up', { shardId, phase, count });
  }

  /**
   * Scale down worker pool
   */
  private async scaleDown(
    shardId: string,
    phase: string,
    count: number,
    graceful: boolean
  ): Promise<void> {
    logger.info({ shardId, phase, count, graceful }, 'Scaling down worker pool');

    // Get idle workers for this shard/phase
    const poolWorkers = Array.from(this.workers.values()).filter(
      (w) => w.shardId === shardId && w.phase === phase && w.status === 'idle'
    );

    // Sort by last task time (terminate longest idle first)
    poolWorkers.sort((a, b) => {
      const aTime = a.lastTaskAt?.getTime() || a.startedAt.getTime();
      const bTime = b.lastTaskAt?.getTime() || b.startedAt.getTime();
      return aTime - bTime;
    });

    // Select workers to terminate
    const workersToTerminate = poolWorkers.slice(0, Math.min(count, poolWorkers.length));

    for (const worker of workersToTerminate) {
      if (graceful) {
        // Graceful shutdown: mark as draining, wait for current task to finish
        worker.status = 'draining';
        await this.db.query(
          `UPDATE workers SET status = $1 WHERE worker_id = $2`,
          [worker.status, worker.id]
        );

        logger.debug({ workerId: worker.id }, 'Worker draining');

        // Simulate graceful shutdown (in production, would wait for task completion)
        setTimeout(async () => {
          await this.terminateWorker(worker.id);
        }, 5000);
      } else {
        // Immediate termination
        await this.terminateWorker(worker.id);
      }
    }

    this.emit('pool.scaled_down', { shardId, phase, count });
  }

  /**
   * Terminate a worker
   */
  private async terminateWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      logger.warn({ workerId }, 'Worker not found for termination');
      return;
    }

    worker.status = 'terminated';
    worker.terminatedAt = new Date();

    await this.db.query(
      `UPDATE workers SET status = $1, terminated_at = $2 WHERE worker_id = $3`,
      [worker.status, worker.terminatedAt, worker.id]
    );

    this.workers.delete(workerId);

    this.emit('worker.terminated', { workerId, shardId: worker.shardId, phase: worker.phase });
    logger.debug({ workerId }, 'Worker terminated');
  }

  /**
   * Get current metrics for a worker pool
   */
  async getMetrics(shardId: string, phase: string): Promise<WorkerPoolMetrics | null> {
    // Get worker counts
    const poolWorkers = Array.from(this.workers.values()).filter(
      (w) => w.shardId === shardId && w.phase === phase && w.status !== 'terminated'
    );

    const currentWorkers = poolWorkers.length;
    const idleWorkers = poolWorkers.filter((w) => w.status === 'idle').length;
    const busyWorkers = poolWorkers.filter((w) => w.status === 'busy').length;

    // Get queue depth from database
    const queueResult = await this.db.query(
      `
      SELECT COUNT(*) as queue_depth
      FROM tasks
      JOIN shard_assignments ON tasks.run_id = shard_assignments.run_id
      WHERE shard_assignments.shard_id = $1 AND tasks.phase = $2 AND tasks.status = 'pending'
    `,
      [shardId, phase]
    );

    const queueDepth = parseInt(queueResult.rows[0]?.queue_depth || '0', 10);

    // Get task latency
    const latencyResult = await this.db.query(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as avg_latency
      FROM tasks
      JOIN shard_assignments ON tasks.run_id = shard_assignments.run_id
      WHERE shard_assignments.shard_id = $1
        AND tasks.phase = $2
        AND tasks.status = 'completed'
        AND tasks.completed_at > NOW() - INTERVAL '5 minutes'
    `,
      [shardId, phase]
    );

    const avgTaskLatency = parseFloat(latencyResult.rows[0]?.avg_latency || '0');

    // Get tasks processed per minute
    const throughputResult = await this.db.query(
      `
      SELECT COUNT(*) as tasks_completed
      FROM tasks
      JOIN shard_assignments ON tasks.run_id = shard_assignments.run_id
      WHERE shard_assignments.shard_id = $1
        AND tasks.phase = $2
        AND tasks.status = 'completed'
        AND tasks.completed_at > NOW() - INTERVAL '1 minute'
    `,
      [shardId, phase]
    );

    const tasksProcessedPerMinute = parseInt(throughputResult.rows[0]?.tasks_completed || '0', 10);

    // Simulated resource utilization (in production, would query metrics system like Prometheus)
    const cpuUtilization = Math.min(
      1.0,
      (busyWorkers / Math.max(currentWorkers, 1)) * 0.8 + Math.random() * 0.2
    );
    const memoryUtilization = Math.min(
      1.0,
      (busyWorkers / Math.max(currentWorkers, 1)) * 0.7 + Math.random() * 0.3
    );

    return {
      shardId,
      phase,
      currentWorkers,
      idleWorkers,
      busyWorkers,
      queueDepth,
      cpuUtilization,
      memoryUtilization,
      avgTaskLatency,
      tasksProcessedPerMinute,
      timestamp: new Date(),
    };
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): ScalingPolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Get all policies
   */
  getAllPolicies(): ScalingPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get policies by shard
   */
  getPoliciesByShard(shardId: string): ScalingPolicy[] {
    return Array.from(this.policies.values()).filter((p) => p.shardId === shardId);
  }

  /**
   * Update policy
   */
  async updatePolicy(
    policyId: string,
    updates: Partial<ScalingPolicy>
  ): Promise<ScalingPolicy> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    const updatedPolicy = {
      ...policy,
      ...updates,
      updatedAt: new Date(),
    };

    this.policies.set(policyId, updatedPolicy);

    await this.db.query(
      `
      UPDATE scaling_policies SET
        min_workers = $1,
        max_workers = $2,
        target_queue_depth = $3,
        target_cpu_utilization = $4,
        target_memory_utilization = $5,
        target_task_latency = $6,
        scale_up_increment = $7,
        scale_down_decrement = $8,
        scale_up_cooldown = $9,
        scale_down_cooldown = $10,
        predictive_scaling = $11,
        graceful_shutdown = $12,
        updated_at = $13
      WHERE policy_id = $14
    `,
      [
        updatedPolicy.minWorkers,
        updatedPolicy.maxWorkers,
        updatedPolicy.targetQueueDepth,
        updatedPolicy.targetCpuUtilization,
        updatedPolicy.targetMemoryUtilization,
        updatedPolicy.targetTaskLatency,
        updatedPolicy.scaleUpIncrement,
        updatedPolicy.scaleDownDecrement,
        updatedPolicy.scaleUpCooldown,
        updatedPolicy.scaleDownCooldown,
        updatedPolicy.predictiveScaling,
        updatedPolicy.gracefulShutdown,
        updatedPolicy.updatedAt,
        policyId,
      ]
    );

    this.emit('policy.updated', { policyId });
    logger.info({ policyId }, 'Policy updated');

    return updatedPolicy;
  }

  /**
   * Delete policy
   */
  async deletePolicy(policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    this.policies.delete(policyId);

    await this.db.query(`DELETE FROM scaling_policies WHERE policy_id = $1`, [policyId]);

    this.emit('policy.deleted', { policyId });
    logger.info({ policyId }, 'Policy deleted');
  }

  /**
   * Get autoscaling statistics
   */
  async getStats(): Promise<{
    total_policies: number;
    total_workers: number;
    idle_workers: number;
    busy_workers: number;
    draining_workers: number;
    total_scaling_decisions_24h: number;
    scale_ups_24h: number;
    scale_downs_24h: number;
  }> {
    const decisionsResult = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 'scale_up' THEN 1 ELSE 0 END) as scale_ups,
        SUM(CASE WHEN action = 'scale_down' THEN 1 ELSE 0 END) as scale_downs
      FROM scaling_decisions
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `
    );

    const workersResult = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'idle' THEN 1 ELSE 0 END) as idle,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'draining' THEN 1 ELSE 0 END) as draining
      FROM workers
      WHERE status != 'terminated'
    `
    );

    return {
      total_policies: this.policies.size,
      total_workers: parseInt(workersResult.rows[0]?.total || '0', 10),
      idle_workers: parseInt(workersResult.rows[0]?.idle || '0', 10),
      busy_workers: parseInt(workersResult.rows[0]?.busy || '0', 10),
      draining_workers: parseInt(workersResult.rows[0]?.draining || '0', 10),
      total_scaling_decisions_24h: parseInt(decisionsResult.rows[0]?.total || '0', 10),
      scale_ups_24h: parseInt(decisionsResult.rows[0]?.scale_ups || '0', 10),
      scale_downs_24h: parseInt(decisionsResult.rows[0]?.scale_downs || '0', 10),
    };
  }

  /**
   * Load policies from database
   */
  private async loadPoliciesFromDatabase(): Promise<void> {
    try {
      const result = await this.db.query(`SELECT * FROM scaling_policies`);

      for (const row of result.rows) {
        const policy: ScalingPolicy = {
          id: row.policy_id,
          shardId: row.shard_id,
          phase: row.phase,
          resourceType: row.resource_type,
          minWorkers: row.min_workers,
          maxWorkers: row.max_workers,
          targetQueueDepth: row.target_queue_depth,
          targetCpuUtilization: parseFloat(row.target_cpu_utilization),
          targetMemoryUtilization: parseFloat(row.target_memory_utilization),
          targetTaskLatency: row.target_task_latency,
          scaleUpIncrement: row.scale_up_increment,
          scaleDownDecrement: row.scale_down_decrement,
          scaleUpCooldown: row.scale_up_cooldown,
          scaleDownCooldown: row.scale_down_cooldown,
          predictiveScaling: row.predictive_scaling,
          gracefulShutdown: row.graceful_shutdown,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          metadata: row.metadata,
        };

        this.policies.set(policy.id, policy);
      }

      logger.info({ count: this.policies.size }, 'Scaling policies loaded from database');
    } catch (error: any) {
      logger.warn({ error }, 'Failed to load scaling policies from database');
    }
  }

  /**
   * Start autoscaling loop
   *
   * Evaluates policies every intervalMs (default: 30 seconds)
   */
  startAutoscalingLoop(intervalMs: number = 30000): NodeJS.Timeout {
    logger.info({ intervalMs }, 'Starting autoscaling loop');

    const interval = setInterval(async () => {
      try {
        await this.evaluatePolicies();
      } catch (error: any) {
        logger.error({ error }, 'Error in autoscaling loop');
      }
    }, intervalMs);

    this.emit('autoscaling.loop.started', { intervalMs });

    return interval;
  }
}

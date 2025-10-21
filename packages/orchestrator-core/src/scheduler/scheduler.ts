import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import pino from 'pino';
import { JobQueue } from '../queue/queue';
import { TaskSpec } from '../queue/types';
import { TaskRepository } from '../database/task-repository';
import { PhasePlan } from '@ideamine/schemas/orchestrator/run-plan';
import { PhaseContext } from '@ideamine/schemas/phase/phase-context';
import { parseISO8601Duration } from '@ideamine/schemas/orchestrator/run-plan';

const logger = pino({ name: 'scheduler' });

/**
 * Scheduling result
 */
export interface ScheduleResult {
  taskIds: string[];
  totalTasks: number;
  enqueuedTasks: number;
}

/**
 * Scheduler - Generate and enqueue TaskSpecs from PhasePlan
 *
 * Features:
 * - Generate TaskSpec for each agent in PhasePlan
 * - Split budgets across agents
 * - Generate idempotence keys for deduplication
 * - Enqueue tasks to job queue
 * - Support task sharding for large batches
 *
 * Spec: UNIFIED_IMPLEMENTATION_SPEC.md Section 3.4
 */
export class Scheduler {
  private queue: JobQueue;
  private taskRepository: TaskRepository;

  constructor(pool: Pool, queue: JobQueue) {
    this.taskRepository = new TaskRepository(pool);
    this.queue = queue;
  }

  /**
   * Schedule phase execution
   *
   * Generates TaskSpecs for all agents in plan and enqueues them
   *
   * @param plan - Phase plan with agents, budgets, etc.
   * @param ctx - Phase context with run_id, phase_id, etc.
   * @returns Scheduling result
   */
  async schedule(
    plan: PhasePlan,
    ctx: PhaseContext & { run_id: string; phase_id: string }
  ): Promise<ScheduleResult> {
    try {
      logger.info(
        {
          phase: plan.phase,
          agentCount: plan.agents.length,
          parallelism: plan.parallelism,
        },
        'Scheduling phase execution'
      );

      // Generate TaskSpecs
      const taskSpecs = this.generateTaskSpecs(plan, ctx);

      logger.debug(
        { phase: plan.phase, taskCount: taskSpecs.length },
        'Generated task specifications'
      );

      // Create tasks in database
      const taskIds: string[] = [];
      for (const taskSpec of taskSpecs) {
        const taskId = await this.taskRepository.create({
          phase_id: ctx.phase_id,
          run_id: ctx.run_id,
          type: taskSpec.type,
          target: taskSpec.target,
          input: taskSpec.input,
          idempotence_key: taskSpec.idempotence_key,
        });

        taskIds.push(taskId);

        // Update taskSpec with actual DB ID
        taskSpec.id = taskId;
      }

      // Enqueue tasks to job queue
      let enqueuedCount = 0;
      for (const taskSpec of taskSpecs) {
        const messageId = await this.queue.enqueue(
          'tasks',
          taskSpec,
          taskSpec.idempotence_key
        );

        if (messageId) {
          enqueuedCount++;
        }
      }

      logger.info(
        {
          phase: plan.phase,
          totalTasks: taskSpecs.length,
          enqueuedTasks: enqueuedCount,
        },
        'Phase scheduled successfully'
      );

      return {
        taskIds,
        totalTasks: taskSpecs.length,
        enqueuedTasks: enqueuedCount,
      };
    } catch (error) {
      logger.error({ error, phase: plan.phase }, 'Failed to schedule phase');
      throw error;
    }
  }

  /**
   * Generate TaskSpecs from PhasePlan
   *
   * - Splits budgets evenly across agents
   * - Generates idempotence keys
   * - Sets timeboxes per task
   */
  private generateTaskSpecs(
    plan: PhasePlan,
    ctx: PhaseContext & { run_id: string; phase_id: string }
  ): TaskSpec[] {
    const taskSpecs: TaskSpec[] = [];

    // Calculate per-agent budgets
    const agentCount = plan.agents.length;
    const tokensPerAgent = Math.floor(plan.budgets.tokens / agentCount);
    const timeboxMs = parseISO8601Duration(plan.timebox);
    const timeboxPerAgent = Math.floor(timeboxMs / agentCount);

    // Generate TaskSpec for each agent
    for (const agentTarget of plan.agents) {
      const taskSpec: TaskSpec = {
        id: '', // Will be set after DB insert
        phase: plan.phase,
        type: 'agent',
        target: agentTarget,
        input: {
          ...ctx.inputs,
          run_id: ctx.run_id,
          phase_id: ctx.phase_id,
          rubrics: plan.rubrics,
          budget: {
            maxTokens: tokensPerAgent,
            maxCostUsd: this.estimateCostFromTokens(tokensPerAgent),
          },
        },
        retries: 0,
        budget: {
          ms: timeboxPerAgent,
          tokens: tokensPerAgent,
        },
        idempotence_key: JobQueue.generateKey(
          plan.phase,
          { agent: agentTarget, ...ctx.inputs },
          plan.version
        ),
      };

      taskSpecs.push(taskSpec);
    }

    return taskSpecs;
  }

  /**
   * Shard large task into smaller chunks
   *
   * Used for batching long lists (e.g., questions, tests)
   * Spec: phase.txt:60 - "Batching: long lists processed in shards with progress heartbeats"
   *
   * @param taskSpec - Original task
   * @param shardSize - Items per shard
   * @returns Array of sharded tasks
   */
  shardTask(taskSpec: TaskSpec, shardSize: number): TaskSpec[] {
    // Check if input contains list to shard
    const input = taskSpec.input;
    let listKey: string | null = null;
    let listItems: any[] = [];

    // Find list in input (common keys: questions, tests, items, data)
    for (const key of ['questions', 'tests', 'items', 'data', 'list']) {
      if (Array.isArray(input[key])) {
        listKey = key;
        listItems = input[key];
        break;
      }
    }

    if (!listKey || listItems.length <= shardSize) {
      // No sharding needed
      return [taskSpec];
    }

    logger.info(
      {
        taskId: taskSpec.id,
        listKey,
        totalItems: listItems.length,
        shardSize,
      },
      'Sharding task'
    );

    // Create sharded tasks
    const shards: TaskSpec[] = [];
    const shardCount = Math.ceil(listItems.length / shardSize);

    for (let i = 0; i < shardCount; i++) {
      const start = i * shardSize;
      const end = Math.min(start + shardSize, listItems.length);
      const shardItems = listItems.slice(start, end);

      const shardSpec: TaskSpec = {
        ...taskSpec,
        id: `${taskSpec.id}-shard-${i}`,
        input: {
          ...input,
          [listKey]: shardItems,
          _shard: {
            index: i,
            total: shardCount,
            start,
            end,
          },
        },
        idempotence_key: `${taskSpec.idempotence_key}-shard-${i}`,
      };

      shards.push(shardSpec);
    }

    logger.debug(
      {
        taskId: taskSpec.id,
        shardCount: shards.length,
      },
      'Task sharded successfully'
    );

    return shards;
  }

  /**
   * Estimate cost from token count
   *
   * Rough estimate: $0.01 per 1000 tokens (average across models)
   */
  private estimateCostFromTokens(tokens: number): number {
    return (tokens / 1000) * 0.01;
  }

  /**
   * Cancel all pending tasks for phase
   *
   * @param phaseId - Phase ID
   */
  async cancelPhase(phaseId: string): Promise<number> {
    try {
      logger.info({ phaseId }, 'Cancelling phase tasks');

      // Get pending tasks
      const tasks = await this.taskRepository.getByPhase(phaseId);

      let cancelledCount = 0;

      for (const task of tasks) {
        if (task.status === 'pending' || task.status === 'running') {
          await this.taskRepository.updateStatus(task.id, 'cancelled' as any);
          cancelledCount++;
        }
      }

      logger.info({ phaseId, cancelledCount }, 'Phase tasks cancelled');

      return cancelledCount;
    } catch (error) {
      logger.error({ error, phaseId }, 'Failed to cancel phase tasks');
      throw error;
    }
  }

  /**
   * Get scheduling statistics
   */
  async getStats(phaseId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    running: number;
    avgDurationMs: number;
    totalCost: number;
    totalTokens: number;
  }> {
    return this.taskRepository.getStatsByPhase(phaseId);
  }
}

import pino from 'pino';
import { EventBus } from '../events/event-bus';
import { PhaseEventType } from '@ideamine/event-schemas/phase-events';

const logger = pino({ name: 'heartbeat-monitor' });

/**
 * Heartbeat configuration
 */
export interface HeartbeatConfig {
  interval_seconds: number; // e.g., 60
  stall_threshold_heartbeats: number; // e.g., 3 (3 * 60s = 3 min)
}

/**
 * HeartbeatMonitor - Detects stalls via missed heartbeats
 *
 * Features:
 * - Track heartbeats from running tasks
 * - Detect stalls (no heartbeat for N intervals)
 * - Emit stall events for supervisor handling
 * - Auto-cleanup completed tasks
 *
 * Spec: orchestrator.txt:132-133, phase.txt:84
 */
export class HeartbeatMonitor {
  private lastHeartbeats: Map<string, Date> = new Map();
  private stallCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private config: HeartbeatConfig,
    private eventBus: EventBus,
    private onStallDetected?: (taskId: string) => Promise<void>
  ) {}

  /**
   * Start heartbeat monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('HeartbeatMonitor already running');
      return;
    }

    this.isRunning = true;

    // Check for stalls every interval
    this.stallCheckInterval = setInterval(
      () => this.checkForStalls(),
      this.config.interval_seconds * 1000
    );

    logger.info(
      {
        intervalSeconds: this.config.interval_seconds,
        stallThreshold: this.config.stall_threshold_heartbeats,
      },
      'HeartbeatMonitor started'
    );
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.stallCheckInterval) {
      clearInterval(this.stallCheckInterval);
      this.stallCheckInterval = null;
    }

    logger.info('HeartbeatMonitor stopped');
  }

  /**
   * Record heartbeat for task
   *
   * @param taskId - Task ID
   */
  recordHeartbeat(taskId: string): void {
    this.lastHeartbeats.set(taskId, new Date());

    logger.debug({ taskId }, 'Heartbeat recorded');
  }

  /**
   * Mark task as completed (remove from tracking)
   *
   * @param taskId - Task ID
   */
  taskCompleted(taskId: string): void {
    this.lastHeartbeats.delete(taskId);

    logger.debug({ taskId }, 'Task completed, removed from heartbeat tracking');
  }

  /**
   * Check for stalled tasks
   */
  private async checkForStalls(): Promise<void> {
    const now = Date.now();
    const stallThresholdMs =
      this.config.interval_seconds * this.config.stall_threshold_heartbeats * 1000;

    const stalledTasks: string[] = [];

    for (const [taskId, lastHeartbeat] of this.lastHeartbeats.entries()) {
      const elapsedMs = now - lastHeartbeat.getTime();

      if (elapsedMs > stallThresholdMs) {
        stalledTasks.push(taskId);

        logger.warn(
          {
            taskId,
            elapsedMs,
            stallThresholdMs,
            lastHeartbeat: lastHeartbeat.toISOString(),
          },
          'Task stalled - no heartbeat'
        );

        // Emit stalled event
        await this.eventBus.publish({
          type: PhaseEventType.PHASE_STALLED,
          keys: { task_id: taskId },
          payload: {
            task_id: taskId,
            reason: `No heartbeat for ${Math.floor(elapsedMs / 1000)}s`,
            last_heartbeat_at: lastHeartbeat.toISOString(),
            elapsed_ms: elapsedMs,
          },
        });

        // Trigger unsticker callback if provided
        if (this.onStallDetected) {
          try {
            await this.onStallDetected(taskId);
          } catch (error) {
            logger.error(
              { error, taskId },
              'Stall detection callback failed'
            );
          }
        }

        // Remove from tracking (unsticker will handle)
        this.lastHeartbeats.delete(taskId);
      }
    }

    if (stalledTasks.length > 0) {
      logger.info(
        { stalledTaskCount: stalledTasks.length, taskIds: stalledTasks },
        'Detected stalled tasks'
      );
    }
  }

  /**
   * Get heartbeat statistics
   */
  getStats(): {
    trackedTasks: number;
    tasks: Array<{ taskId: string; lastHeartbeat: Date; elapsedMs: number }>;
  } {
    const now = Date.now();
    const tasks = Array.from(this.lastHeartbeats.entries()).map(([taskId, lastHeartbeat]) => ({
      taskId,
      lastHeartbeat,
      elapsedMs: now - lastHeartbeat.getTime(),
    }));

    return {
      trackedTasks: this.lastHeartbeats.size,
      tasks,
    };
  }
}

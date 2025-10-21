/**
 * Heartbeat Guard
 *
 * Heartbeat-based stall detection strategy for task monitoring.
 * Detects tasks that have stopped sending heartbeats and triggers recovery.
 */

import { EventEmitter } from 'events';
import pino from 'pino';

const logger = pino({ name: 'heartbeat-guard' });

export interface HeartbeatConfig {
  interval: number; // Expected heartbeat interval (ms)
  timeout: number; // Time before considering task stalled (ms)
  maxMissed: number; // Max consecutive missed heartbeats before stall
}

export interface HeartbeatStatus {
  taskId: string;
  lastHeartbeat: Date;
  missedCount: number;
  isStalled: boolean;
}

export class HeartbeatGuard extends EventEmitter {
  private heartbeats: Map<string, Date> = new Map();
  private missedCounts: Map<string, number> = new Map();
  private monitorInterval?: NodeJS.Timeout;

  constructor(private config: HeartbeatConfig) {
    super();
  }

  /**
   * Record heartbeat for task
   */
  recordHeartbeat(taskId: string): void {
    this.heartbeats.set(taskId, new Date());
    this.missedCounts.set(taskId, 0);
    logger.debug({ taskId }, 'Heartbeat recorded');
  }

  /**
   * Check if task has stalled
   */
  isStalled(taskId: string): boolean {
    const lastHeartbeat = this.heartbeats.get(taskId);
    if (!lastHeartbeat) {
      return false;
    }

    const timeSinceLastHeartbeat = Date.now() - lastHeartbeat.getTime();
    return timeSinceLastHeartbeat > this.config.timeout;
  }

  /**
   * Get heartbeat status
   */
  getStatus(taskId: string): HeartbeatStatus | null {
    const lastHeartbeat = this.heartbeats.get(taskId);
    if (!lastHeartbeat) {
      return null;
    }

    return {
      taskId,
      lastHeartbeat,
      missedCount: this.missedCounts.get(taskId) || 0,
      isStalled: this.isStalled(taskId),
    };
  }

  /**
   * Start monitoring heartbeats
   */
  startMonitoring(): void {
    if (this.monitorInterval) {
      logger.warn('Monitoring already started');
      return;
    }

    logger.info({ interval: this.config.interval }, 'Starting heartbeat monitoring');

    this.monitorInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.config.interval);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
      logger.info('Stopped heartbeat monitoring');
    }
  }

  /**
   * Check all heartbeats
   */
  private checkHeartbeats(): void {
    const now = Date.now();

    for (const [taskId, lastHeartbeat] of this.heartbeats.entries()) {
      const timeSinceLastHeartbeat = now - lastHeartbeat.getTime();

      if (timeSinceLastHeartbeat > this.config.interval) {
        // Missed heartbeat
        const missedCount = (this.missedCounts.get(taskId) || 0) + 1;
        this.missedCounts.set(taskId, missedCount);

        logger.warn({ taskId, missedCount, timeSinceLastHeartbeat }, 'Missed heartbeat');

        if (missedCount >= this.config.maxMissed) {
          // Task stalled
          this.emit('task-stalled', {
            taskId,
            lastHeartbeat,
            missedCount,
            stalledAt: new Date(),
          });

          logger.error({ taskId, missedCount }, 'Task stalled - max missed heartbeats exceeded');
        }
      }
    }
  }

  /**
   * Remove task from monitoring
   */
  removeTask(taskId: string): void {
    this.heartbeats.delete(taskId);
    this.missedCounts.delete(taskId);
  }

  /**
   * Clear all heartbeats
   */
  clear(): void {
    this.heartbeats.clear();
    this.missedCounts.clear();
  }
}

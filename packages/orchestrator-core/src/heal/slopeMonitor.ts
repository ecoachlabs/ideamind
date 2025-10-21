import pino from 'pino';
import { EventBus } from '../events/event-bus';

const logger = pino({ name: 'slope-monitor' });

/**
 * Progress Slope Monitor - Detects plateaus and adjusts strategy
 *
 * Features:
 * - Track progress percentages over time
 * - Calculate slope via linear regression
 * - Detect plateaus (flat slope)
 * - Emit adjustment events for supervisor
 *
 * Spec: orchestrator.txt:134-135, phase.txt:85
 */
export class ProgressSlopeMonitor {
  private progressHistory: Map<string, number[]> = new Map(); // taskId → [pct values]
  private readonly HISTORY_SIZE = 10;
  private readonly PLATEAU_THRESHOLD = 0.005; // 0.5% slope per interval

  constructor(private eventBus: EventBus) {}

  /**
   * Record progress for task
   *
   * @param taskId - Task ID
   * @param pct - Progress percentage (0.0 to 1.0)
   */
  recordProgress(taskId: string, pct: number): void {
    if (pct < 0 || pct > 1) {
      logger.warn({ taskId, pct }, 'Invalid progress percentage (must be 0-1)');
      return;
    }

    if (!this.progressHistory.has(taskId)) {
      this.progressHistory.set(taskId, []);
    }

    const history = this.progressHistory.get(taskId)!;
    history.push(pct);

    // Keep only last N data points
    if (history.length > this.HISTORY_SIZE) {
      history.shift();
    }

    logger.debug({ taskId, pct, historyLength: history.length }, 'Progress recorded');

    // Check for plateau if we have enough data
    if (history.length >= 5) {
      const isPlateau = this.detectPlateau(taskId);

      if (isPlateau) {
        logger.warn({ taskId, history }, 'Plateau detected');
        this.adjustStrategy(taskId).catch((error) =>
          logger.error({ error, taskId }, 'Failed to adjust strategy')
        );
      }
    }
  }

  /**
   * Detect if task progress has plateaued
   *
   * @param taskId - Task ID
   * @returns True if plateau detected
   */
  detectPlateau(taskId: string): boolean {
    const history = this.progressHistory.get(taskId);

    if (!history || history.length < 5) {
      return false;
    }

    // Calculate slope (linear regression)
    const slope = this.calculateSlope(history);

    logger.debug({ taskId, slope, threshold: this.PLATEAU_THRESHOLD }, 'Checking plateau');

    // If slope < threshold, it's a plateau
    return slope < this.PLATEAU_THRESHOLD;
  }

  /**
   * Calculate slope using linear regression
   *
   * @param values - Array of progress values
   * @returns Slope (change per interval)
   */
  private calculateSlope(values: number[]): number {
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    if (denominator === 0) {
      return 0;
    }

    return numerator / denominator;
  }

  /**
   * Adjust strategy for task with plateau
   *
   * Emits event for supervisor to handle:
   * - Try smaller batch size
   * - Try alternate tool
   * - Try stricter prompts
   *
   * @param taskId - Task ID
   */
  async adjustStrategy(taskId: string): Promise<void> {
    const history = this.progressHistory.get(taskId);

    logger.info({ taskId, history }, 'Adjusting strategy due to plateau');

    // Emit event for supervisor to handle
    await this.eventBus.publish({
      type: 'task.plateau',
      keys: { task_id: taskId },
      payload: {
        task_id: taskId,
        reason: 'Low progress slope detected',
        progress_history: history,
        suggested_actions: [
          'reduce_batch_size',
          'try_alternate_tool',
          'use_stricter_prompts',
        ],
      },
    });
  }

  /**
   * Clear progress history for completed task
   *
   * @param taskId - Task ID
   */
  taskCompleted(taskId: string): void {
    this.progressHistory.delete(taskId);
    logger.debug({ taskId }, 'Task completed, progress history cleared');
  }

  /**
   * Get progress statistics
   */
  getStats(): {
    trackedTasks: number;
    tasks: Array<{
      taskId: string;
      historyLength: number;
      currentProgress: number;
      slope: number;
      isPlateau: boolean;
    }>;
  } {
    const tasks = Array.from(this.progressHistory.entries()).map(([taskId, history]) => ({
      taskId,
      historyLength: history.length,
      currentProgress: history[history.length - 1] || 0,
      slope: history.length >= 2 ? this.calculateSlope(history) : 0,
      isPlateau: this.detectPlateau(taskId),
    }));

    return {
      trackedTasks: this.progressHistory.size,
      tasks,
    };
  }
}

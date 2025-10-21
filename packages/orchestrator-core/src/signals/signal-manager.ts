/**
 * Signal Manager - Temporal-Style Signals
 *
 * Spec: orchestrator.txt:123
 * "Signals/Timers: MO can signal PCs to pause/resume/retry; timers wake stalled tasks"
 *
 * **Purpose:**
 * Enable orchestrator to send control signals to phase coordinators and tasks:
 * - PAUSE: Pause execution (checkpoint and wait)
 * - RESUME: Resume from checkpoint
 * - RETRY: Retry failed task
 * - CANCEL: Cancel execution
 *
 * **Use Cases:**
 * - Budget exceeded → PAUSE
 * - User intervention required → PAUSE
 * - Manual resume → RESUME
 * - Transient failure → RETRY
 * - User cancellation → CANCEL
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';

const logger = pino({ name: 'signal-manager' });

/**
 * Signal types
 */
export type SignalType = 'pause' | 'resume' | 'retry' | 'cancel';

/**
 * Signal target
 */
export interface SignalTarget {
  type: 'run' | 'phase' | 'task';
  id: string; // run_id, phase_id, or task_id
}

/**
 * Signal
 */
export interface Signal {
  id: string;
  type: SignalType;
  target: SignalTarget;
  reason: string;
  sentBy: string; // Who sent the signal (e.g., "orchestrator", "user", "supervisor")
  sentAt: Date;
  acknowledgedAt?: Date;
  status: 'pending' | 'acknowledged' | 'ignored';
  metadata?: Record<string, any>;
}

/**
 * Signal Manager
 *
 * Manages control signals between orchestrator and phase coordinators.
 * Implements publish-subscribe pattern for signal delivery.
 */
export class SignalManager extends EventEmitter {
  private signals: Map<string, Signal> = new Map(); // signalId -> Signal
  private subscriptions: Map<string, Set<string>> = new Map(); // targetId -> Set<signalType>

  constructor(private db: Pool) {
    super();
  }

  /**
   * Send a signal to a target (run, phase, or task)
   */
  async sendSignal(
    type: SignalType,
    target: SignalTarget,
    reason: string,
    sentBy: string = 'orchestrator'
  ): Promise<Signal> {
    const signalId = `signal-${type}-${target.type}-${target.id}-${Date.now()}`;

    const signal: Signal = {
      id: signalId,
      type,
      target,
      reason,
      sentBy,
      sentAt: new Date(),
      status: 'pending',
    };

    logger.info(
      {
        signalId,
        type,
        targetType: target.type,
        targetId: target.id,
        reason,
      },
      'Sending signal'
    );

    // Store in memory
    this.signals.set(signalId, signal);

    // Persist to database
    await this.db.query(
      `
      INSERT INTO signals (
        signal_id, type, target_type, target_id, reason, sent_by, sent_at, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        signal.id,
        signal.type,
        signal.target.type,
        signal.target.id,
        signal.reason,
        signal.sentBy,
        signal.sentAt,
        signal.status,
        JSON.stringify(signal.metadata || {}),
      ]
    );

    // Emit signal event for subscribers
    this.emit(`signal.${type}`, {
      signalId,
      target,
      reason,
      sentBy,
    });

    // Emit target-specific event
    this.emit(`signal.${target.type}.${target.id}`, signal);

    logger.info({ signalId }, 'Signal sent');

    return signal;
  }

  /**
   * Acknowledge receipt of a signal
   */
  async acknowledgeSignal(signalId: string): Promise<Signal> {
    const signal = this.signals.get(signalId);
    if (!signal) {
      throw new Error(`Signal not found: ${signalId}`);
    }

    if (signal.status !== 'pending') {
      logger.warn({ signalId, status: signal.status }, 'Signal already acknowledged or ignored');
      return signal;
    }

    logger.info({ signalId }, 'Acknowledging signal');

    signal.status = 'acknowledged';
    signal.acknowledgedAt = new Date();

    await this.db.query(
      `UPDATE signals SET status = $1, acknowledged_at = $2 WHERE signal_id = $3`,
      [signal.status, signal.acknowledgedAt, signalId]
    );

    this.emit('signal.acknowledged', {
      signalId,
      target: signal.target,
    });

    logger.info({ signalId }, 'Signal acknowledged');

    return signal;
  }

  /**
   * Subscribe to signals for a specific target
   */
  subscribe(targetType: string, targetId: string, signalTypes: SignalType[]): void {
    const key = `${targetType}:${targetId}`;

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }

    const subscription = this.subscriptions.get(key)!;
    signalTypes.forEach((type) => subscription.add(type));

    logger.debug({ targetType, targetId, signalTypes }, 'Subscribed to signals');
  }

  /**
   * Unsubscribe from signals for a specific target
   */
  unsubscribe(targetType: string, targetId: string): void {
    const key = `${targetType}:${targetId}`;
    this.subscriptions.delete(key);

    logger.debug({ targetType, targetId }, 'Unsubscribed from signals');
  }

  /**
   * Get pending signals for a target
   */
  async getPendingSignals(targetType: string, targetId: string): Promise<Signal[]> {
    return Array.from(this.signals.values()).filter(
      (s) =>
        s.target.type === targetType &&
        s.target.id === targetId &&
        s.status === 'pending'
    );
  }

  /**
   * Check if target has a specific pending signal
   */
  async hasPendingSignal(
    targetType: string,
    targetId: string,
    signalType: SignalType
  ): Promise<boolean> {
    const pending = await this.getPendingSignals(targetType, targetId);
    return pending.some((s) => s.type === signalType);
  }

  /**
   * Pause a run
   */
  async pauseRun(runId: string, reason: string): Promise<Signal> {
    return this.sendSignal('pause', { type: 'run', id: runId }, reason);
  }

  /**
   * Resume a run
   */
  async resumeRun(runId: string, reason: string = 'Manual resume'): Promise<Signal> {
    return this.sendSignal('resume', { type: 'run', id: runId }, reason);
  }

  /**
   * Retry a task
   */
  async retryTask(taskId: string, reason: string = 'Retry requested'): Promise<Signal> {
    return this.sendSignal('retry', { type: 'task', id: taskId }, reason);
  }

  /**
   * Cancel a run
   */
  async cancelRun(runId: string, reason: string): Promise<Signal> {
    return this.sendSignal('cancel', { type: 'run', id: runId }, reason);
  }

  /**
   * Cancel a phase
   */
  async cancelPhase(phaseId: string, reason: string): Promise<Signal> {
    return this.sendSignal('cancel', { type: 'phase', id: phaseId }, reason);
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason: string): Promise<Signal> {
    return this.sendSignal('cancel', { type: 'task', id: taskId }, reason);
  }

  /**
   * Get signal by ID
   */
  getSignal(signalId: string): Signal | undefined {
    return this.signals.get(signalId);
  }

  /**
   * Get all signals for a target
   */
  async getSignalsForTarget(targetType: string, targetId: string): Promise<Signal[]> {
    return Array.from(this.signals.values()).filter(
      (s) => s.target.type === targetType && s.target.id === targetId
    );
  }

  /**
   * Get signal statistics
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    acknowledged: number;
    ignored: number;
    by_type: Record<SignalType, number>;
  }> {
    const signals = Array.from(this.signals.values());

    const by_type: Record<SignalType, number> = {
      pause: 0,
      resume: 0,
      retry: 0,
      cancel: 0,
    };

    signals.forEach((s) => {
      if (s.type in by_type) {
        by_type[s.type]++;
      }
    });

    return {
      total: signals.length,
      pending: signals.filter((s) => s.status === 'pending').length,
      acknowledged: signals.filter((s) => s.status === 'acknowledged').length,
      ignored: signals.filter((s) => s.status === 'ignored').length,
      by_type,
    };
  }

  /**
   * Clean up old signals
   */
  async cleanupOldSignals(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const toDelete = Array.from(this.signals.values()).filter(
      (s) => s.sentAt < cutoffDate && s.status !== 'pending'
    );

    for (const signal of toDelete) {
      this.signals.delete(signal.id);
    }

    await this.db.query(
      `DELETE FROM signals WHERE sent_at < $1 AND status != 'pending'`,
      [cutoffDate]
    );

    if (toDelete.length > 0) {
      logger.info({ count: toDelete.length }, 'Old signals cleaned up');
    }

    return toDelete.length;
  }

  /**
   * Load signals from database
   */
  async loadSignalsFromDatabase(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT * FROM signals WHERE status = 'pending' ORDER BY sent_at DESC`
      );

      for (const row of result.rows) {
        const signal: Signal = {
          id: row.signal_id,
          type: row.type,
          target: {
            type: row.target_type,
            id: row.target_id,
          },
          reason: row.reason,
          sentBy: row.sent_by,
          sentAt: row.sent_at,
          acknowledgedAt: row.acknowledged_at,
          status: row.status,
          metadata: row.metadata,
        };

        this.signals.set(signal.id, signal);
      }

      logger.info({ count: this.signals.size }, 'Signals loaded from database');
    } catch (error: any) {
      logger.warn({ error }, 'Failed to load signals from database');
    }
  }
}

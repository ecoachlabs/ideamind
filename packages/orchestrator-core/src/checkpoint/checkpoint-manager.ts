import pino from 'pino';
import { PhaseContext } from '@ideamine/schemas';

const logger = pino({ name: 'checkpoint-manager' });

export interface Checkpoint {
  checkpointId: string;
  runId: string;
  phase: string;
  taskId?: string;
  status: 'active' | 'restored' | 'expired';
  context: PhaseContext;
  state: {
    completedTasks: string[];
    pendingTasks: string[];
    artifacts: any[];
    kmap: Record<string, any>;
  };
  metadata: {
    budgetUsed: {
      tokens: number;
      tools_minutes: number;
      wallclock_ms: number;
    };
    progress: {
      total_tasks: number;
      completed_tasks: number;
      percent: number;
    };
  };
  createdAt: string;
  expiresAt?: string;
}

export class CheckpointManager {
  constructor(
    private db: any,
    private retentionDays: number = 30
  ) {}

  async createCheckpoint(
    runId: string,
    phase: string,
    context: PhaseContext,
    state: any,
    metadata: any,
    taskId?: string
  ): Promise<string> {
    const now = Date.now();
    const checkpointId = 'ckpt-' + runId + '-' + phase + '-' + now;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.retentionDays);

    logger.info({ runId, phase, checkpointId }, 'Creating checkpoint');

    await this.db.query(
      'INSERT INTO checkpoints (checkpoint_id, run_id, phase, task_id, status, context, state, metadata, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [checkpointId, runId, phase, taskId, 'active', JSON.stringify(context), JSON.stringify(state), JSON.stringify(metadata), new Date().toISOString(), expiresAt.toISOString()]
    );

    return checkpointId;
  }

  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    const result = await this.db.query('SELECT * FROM checkpoints WHERE checkpoint_id = $1', [checkpointId]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      checkpointId: row.checkpoint_id,
      runId: row.run_id,
      phase: row.phase,
      taskId: row.task_id,
      status: row.status,
      context: JSON.parse(row.context),
      state: JSON.parse(row.state),
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  async resumeFromCheckpoint(checkpointId: string): Promise<Checkpoint> {
    logger.info({ checkpointId }, 'Resuming from checkpoint');
    const checkpoint = await this.getCheckpoint(checkpointId);
    if (!checkpoint) throw new Error('Checkpoint not found: ' + checkpointId);
    if (checkpoint.status !== 'active') throw new Error('Checkpoint not active: ' + checkpointId);
    await this.db.query('UPDATE checkpoints SET status = $1 WHERE checkpoint_id = $2', ['restored', checkpointId]);
    checkpoint.status = 'restored';
    return checkpoint;
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.db.query('DELETE FROM checkpoints WHERE expires_at < NOW() RETURNING checkpoint_id');
    return result.rows.length;
  }
}

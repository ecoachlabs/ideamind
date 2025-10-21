import pino from 'pino';

const logger = pino({ name: 'event-ledger' });

export interface LedgerEntry {
  id: string;
  runId: string;
  phase?: string;
  taskId?: string;
  eventType: string;
  eventData: Record<string, any>;
  timestamp: string;
  sequence: number;
}

export interface LedgerQuery {
  runId?: string;
  phase?: string;
  eventType?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

export class EventLedger {
  constructor(private db: any) {}

  async append(
    runId: string,
    eventType: string,
    eventData: Record<string, any>,
    phase?: string,
    taskId?: string
  ): Promise<string> {
    const now = Date.now();
    const entryId = 'ledger-' + runId + '-' + now;
    const timestamp = new Date().toISOString();

    const sequenceResult = await this.db.query(
      'SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq FROM ledger WHERE run_id = $1',
      [runId]
    );
    const sequence = sequenceResult.rows[0].next_seq;

    await this.db.query(
      'INSERT INTO ledger (id, run_id, phase, task_id, event_type, event_data, timestamp, sequence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [entryId, runId, phase, taskId, eventType, JSON.stringify(eventData), timestamp, sequence]
    );

    logger.debug({ entryId, runId, eventType, sequence }, 'Event appended to ledger');

    return entryId;
  }

  async query(query: LedgerQuery): Promise<LedgerEntry[]> {
    let sql = 'SELECT * FROM ledger WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (query.runId) {
      paramCount++;
      sql += ' AND run_id = $' + paramCount;
      params.push(query.runId);
    }

    if (query.phase) {
      paramCount++;
      sql += ' AND phase = $' + paramCount;
      params.push(query.phase);
    }

    if (query.eventType) {
      paramCount++;
      sql += ' AND event_type = $' + paramCount;
      params.push(query.eventType);
    }

    if (query.fromTimestamp) {
      paramCount++;
      sql += ' AND timestamp >= $' + paramCount;
      params.push(query.fromTimestamp);
    }

    if (query.toTimestamp) {
      paramCount++;
      sql += ' AND timestamp <= $' + paramCount;
      params.push(query.toTimestamp);
    }

    sql += ' ORDER BY sequence DESC';

    if (query.limit) {
      paramCount++;
      sql += ' LIMIT $' + paramCount;
      params.push(query.limit);
    }

    if (query.offset) {
      paramCount++;
      sql += ' OFFSET $' + paramCount;
      params.push(query.offset);
    }

    const result = await this.db.query(sql, params);

    return result.rows.map((row: any) => ({
      id: row.id,
      runId: row.run_id,
      phase: row.phase,
      taskId: row.task_id,
      eventType: row.event_type,
      eventData: JSON.parse(row.event_data),
      timestamp: row.timestamp,
      sequence: row.sequence,
    }));
  }

  async getRunTimeline(runId: string): Promise<LedgerEntry[]> {
    return this.query({ runId, limit: 1000 });
  }

  async getPhaseEvents(runId: string, phase: string): Promise<LedgerEntry[]> {
    return this.query({ runId, phase, limit: 1000 });
  }

  async getEventsByType(runId: string, eventType: string): Promise<LedgerEntry[]> {
    return this.query({ runId, eventType, limit: 1000 });
  }

  async getStats(runId?: string): Promise<{
    total_events: number;
    by_type: Record<string, number>;
    by_phase: Record<string, number>;
    first_event?: string;
    last_event?: string;
  }> {
    let sql = 'SELECT event_type, phase, COUNT(*) as count, MIN(timestamp) as first, MAX(timestamp) as last FROM ledger';
    const params: any[] = [];

    if (runId) {
      sql += ' WHERE run_id = $1';
      params.push(runId);
    }

    sql += ' GROUP BY event_type, phase';

    const result = await this.db.query(sql, params);

    const byType: Record<string, number> = {};
    const byPhase: Record<string, number> = {};
    let total = 0;
    let first: string | undefined;
    let last: string | undefined;

    for (const row of result.rows) {
      const count = parseInt(row.count);
      total += count;

      byType[row.event_type] = (byType[row.event_type] || 0) + count;

      if (row.phase) {
        byPhase[row.phase] = (byPhase[row.phase] || 0) + count;
      }

      if (!first || row.first < first) first = row.first;
      if (!last || row.last > last) last = row.last;
    }

    return {
      total_events: total,
      by_type: byType,
      by_phase: byPhase,
      first_event: first,
      last_event: last,
    };
  }
}

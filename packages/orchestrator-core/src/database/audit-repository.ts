import { DatabaseConnection } from './connection';
import { AuditLogRow, EventRow } from './types';

/**
 * Audit Repository
 *
 * Manages immutable audit logs and events for compliance and debugging
 */
export class AuditRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * CRITICAL FIX: Redact PII from data before logging
   */
  private redactPII(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Clone to avoid mutating original
    const redacted = JSON.parse(JSON.stringify(data));

    // Recursive redaction
    const redactObject = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;

      for (const key in obj) {
        const lowerKey = key.toLowerCase();

        // Redact sensitive field names
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('api_key') ||
          lowerKey.includes('apikey') ||
          lowerKey.includes('auth') ||
          lowerKey.includes('credential')
        ) {
          obj[key] = '***REDACTED***';
          continue;
        }

        // Redact PII patterns in strings
        if (typeof obj[key] === 'string') {
          // Email addresses
          obj[key] = obj[key].replace(
            /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
            '[EMAIL_REDACTED]'
          );

          // SSN (XXX-XX-XXXX)
          obj[key] = obj[key].replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]');

          // Credit card (16 digits)
          obj[key] = obj[key].replace(/\b\d{16}\b/g, '[CARD_REDACTED]');

          // Phone numbers (various formats)
          obj[key] = obj[key].replace(
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
            '[PHONE_REDACTED]'
          );

          // IP addresses (optional - may be needed for security)
          // obj[key] = obj[key].replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP_REDACTED]');
        }

        // Recursively redact nested objects and arrays
        if (typeof obj[key] === 'object') {
          redactObject(obj[key]);
        }
      }
    };

    redactObject(redacted);
    return redacted;
  }

  /**
   * Create audit log entry
   */
  async createAuditLog(entry: {
    workflowRunId: string;
    actor: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    costUsd?: number;
    decision?: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const query = `
      INSERT INTO audit_log (
        workflow_run_id, actor, action, resource_type, resource_id,
        cost_usd, decision, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    // CRITICAL FIX: Redact PII before storing
    const redactedDecision = entry.decision ? this.redactPII(entry.decision) : null;
    const redactedMetadata = entry.metadata ? this.redactPII(entry.metadata) : null;

    await this.db.query(query, [
      entry.workflowRunId,
      entry.actor,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.costUsd,
      redactedDecision ? JSON.stringify(redactedDecision) : null,
      redactedMetadata ? JSON.stringify(redactedMetadata) : null,
    ]);
  }

  /**
   * Get audit logs for a workflow run
   */
  async getAuditLogs(
    workflowRunId: string,
    options?: {
      actor?: string;
      action?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLogRow[]> {
    let query = 'SELECT * FROM audit_log WHERE workflow_run_id = $1';
    const params: any[] = [workflowRunId];
    let paramIndex = 2;

    if (options?.actor) {
      query += ` AND actor = $${paramIndex}`;
      params.push(options.actor);
      paramIndex++;
    }

    if (options?.action) {
      query += ` AND action = $${paramIndex}`;
      params.push(options.action);
      paramIndex++;
    }

    if (options?.startDate) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options?.endDate) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    query += ' ORDER BY timestamp DESC';

    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.db.query<AuditLogRow>(query, params);

    return result.rows;
  }

  /**
   * Create event (for event sourcing)
   */
  async createEvent(event: {
    eventId: string;
    eventType: string;
    workflowRunId: string;
    correlationId?: string;
    payload: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const query = `
      INSERT INTO events (
        event_id, event_type, workflow_run_id, correlation_id, payload, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    // CRITICAL FIX: Redact PII before storing
    const redactedPayload = this.redactPII(event.payload);
    const redactedMetadata = event.metadata ? this.redactPII(event.metadata) : null;

    await this.db.query(query, [
      event.eventId,
      event.eventType,
      event.workflowRunId,
      event.correlationId,
      JSON.stringify(redactedPayload),
      redactedMetadata ? JSON.stringify(redactedMetadata) : null,
    ]);
  }

  /**
   * Get events for a workflow run
   */
  async getEvents(
    workflowRunId: string,
    options?: {
      eventType?: string;
      correlationId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<EventRow[]> {
    let query = 'SELECT * FROM events WHERE workflow_run_id = $1';
    const params: any[] = [workflowRunId];
    let paramIndex = 2;

    if (options?.eventType) {
      query += ` AND event_type = $${paramIndex}`;
      params.push(options.eventType);
      paramIndex++;
    }

    if (options?.correlationId) {
      query += ` AND correlation_id = $${paramIndex}`;
      params.push(options.correlationId);
      paramIndex++;
    }

    if (options?.startDate) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options?.endDate) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    query += ' ORDER BY timestamp ASC';

    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
      paramIndex++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(options.offset);
    }

    const result = await this.db.query<EventRow>(query, params);

    return result.rows;
  }

  /**
   * Replay events (for event sourcing)
   */
  async replayEvents(
    workflowRunId: string,
    handler: (event: EventRow) => Promise<void>
  ): Promise<void> {
    const events = await this.getEvents(workflowRunId);

    for (const event of events) {
      await handler(event);
    }

    console.log(`[AuditRepository] Replayed ${events.length} events for ${workflowRunId}`);
  }

  /**
   * Get audit trail summary
   */
  async getAuditSummary(workflowRunId: string): Promise<{
    totalActions: number;
    totalCost: number;
    actorBreakdown: Record<string, number>;
    actionBreakdown: Record<string, number>;
    timeline: Array<{ date: string; actions: number }>;
  }> {
    const summaryQuery = `
      SELECT
        COUNT(*) as total_actions,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        actor,
        COUNT(*) as actor_count,
        action,
        COUNT(*) as action_count
      FROM audit_log
      WHERE workflow_run_id = $1
      GROUP BY actor, action
    `;

    const result = await this.db.query<{
      total_actions: string;
      total_cost: string;
      actor: string;
      actor_count: string;
      action: string;
      action_count: string;
    }>(summaryQuery, [workflowRunId]);

    const totalActions = result.rows.length > 0 ? parseInt(result.rows[0].total_actions, 10) : 0;
    const totalCost = result.rows.length > 0 ? parseFloat(result.rows[0].total_cost) : 0;

    const actorBreakdown: Record<string, number> = {};
    const actionBreakdown: Record<string, number> = {};

    for (const row of result.rows) {
      if (!actorBreakdown[row.actor]) {
        actorBreakdown[row.actor] = parseInt(row.actor_count, 10);
      }

      if (!actionBreakdown[row.action]) {
        actionBreakdown[row.action] = parseInt(row.action_count, 10);
      }
    }

    // Get timeline (daily breakdown)
    const timelineQuery = `
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as actions
      FROM audit_log
      WHERE workflow_run_id = $1
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `;

    const timelineResult = await this.db.query<{ date: string; actions: string }>(
      timelineQuery,
      [workflowRunId]
    );

    const timeline = timelineResult.rows.map((row) => ({
      date: row.date,
      actions: parseInt(row.actions, 10),
    }));

    return {
      totalActions,
      totalCost,
      actorBreakdown,
      actionBreakdown,
      timeline,
    };
  }
}

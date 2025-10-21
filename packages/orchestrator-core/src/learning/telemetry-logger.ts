/**
 * Telemetry Logger
 *
 * Structured event logging and metrics collection for observability.
 * Supports distributed tracing, metric aggregation, and time-series analytics.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'telemetry-logger' });

// Legacy type for backward compatibility
export interface TaskOutcome {
  taskId: string;
  taskType: string;
  success: boolean;
  duration: number;
  modelUsed: string;
  origin: string;
}

export interface TelemetryEvent {
  taskId?: string;
  runId?: string;
  tenantId?: string;
  eventType: string;
  severity?: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  tags?: Record<string, string>;
  metrics?: Record<string, number>;
  context?: Record<string, any>;
  correlationId?: string;
  parentEventId?: string;
}

export interface TelemetryMetric {
  tenantId?: string;
  metricName: string;
  value: number;
  metricType?: 'counter' | 'gauge' | 'histogram' | 'summary';
  tags?: Record<string, string>;
}

export interface TelemetrySpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags?: Record<string, string>;
  logs?: Array<{ timestamp: Date; message: string }>;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
}

export interface AggregatedMetric {
  metricName: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

export interface TelemetryConfig {
  enableMetricRollup?: boolean;
  rollupIntervalMinutes?: number;
  retentionDays?: number;
  batchSize?: number;
}

const DEFAULT_CONFIG: TelemetryConfig = {
  enableMetricRollup: true,
  rollupIntervalMinutes: 60,
  retentionDays: 30,
  batchSize: 100,
};

export class TelemetryLogger extends EventEmitter {
  private config: TelemetryConfig;
  private eventBuffer: TelemetryEvent[] = [];
  private metricBuffer: TelemetryMetric[] = [];

  constructor(
    private pool: Pool,
    config: Partial<TelemetryConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Log a telemetry event
   */
  async logEvent(event: TelemetryEvent): Promise<string> {
    const eventId = await this.pool.query(
      `INSERT INTO telemetry_events
       (task_id, run_id, tenant_id, event_type, severity, tags, metrics, context,
        correlation_id, parent_event_id, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING id`,
      [
        event.taskId || null,
        event.runId || null,
        event.tenantId || null,
        event.eventType,
        event.severity || 'info',
        JSON.stringify(event.tags || {}),
        JSON.stringify(event.metrics || {}),
        JSON.stringify(event.context || {}),
        event.correlationId || null,
        event.parentEventId || null,
      ]
    );

    const id = eventId.rows[0].id;

    this.emit('event-logged', { eventId: id, ...event });

    logger.debug({ eventId: id, eventType: event.eventType }, 'Event logged');

    return id;
  }

  /**
   * Log multiple events in batch
   */
  async logEventBatch(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const event of events) {
        await client.query(
          `INSERT INTO telemetry_events
           (task_id, run_id, tenant_id, event_type, severity, tags, metrics, context,
            correlation_id, parent_event_id, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [
            event.taskId || null,
            event.runId || null,
            event.tenantId || null,
            event.eventType,
            event.severity || 'info',
            JSON.stringify(event.tags || {}),
            JSON.stringify(event.metrics || {}),
            JSON.stringify(event.context || {}),
            event.correlationId || null,
            event.parentEventId || null,
          ]
        );
      }

      await client.query('COMMIT');

      logger.info({ count: events.length }, 'Event batch logged');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, count: events.length }, 'Failed to log event batch');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Record a metric
   */
  async recordMetric(metric: TelemetryMetric): Promise<void> {
    // For high-frequency metrics, buffer and batch insert
    this.metricBuffer.push(metric);

    if (this.metricBuffer.length >= this.config.batchSize!) {
      await this.flushMetricBuffer();
    }

    // Also update rollup immediately for real-time queries
    if (this.config.enableMetricRollup) {
      await this.updateMetricRollup(metric);
    }
  }

  /**
   * Flush buffered metrics to database
   */
  private async flushMetricBuffer(): Promise<void> {
    if (this.metricBuffer.length === 0) return;

    const metrics = [...this.metricBuffer];
    this.metricBuffer = [];

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const metric of metrics) {
        await client.query(
          `INSERT INTO telemetry_events
           (tenant_id, event_type, metrics, tags, recorded_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            metric.tenantId || null,
            'metric',
            JSON.stringify({ [metric.metricName]: metric.value }),
            JSON.stringify({ metric_type: metric.metricType || 'gauge', ...metric.tags }),
          ]
        );
      }

      await client.query('COMMIT');

      logger.debug({ count: metrics.length }, 'Metric buffer flushed');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Failed to flush metric buffer');
      // Re-add to buffer for retry
      this.metricBuffer.unshift(...metrics);
    } finally {
      client.release();
    }
  }

  /**
   * Update hourly metric rollup
   */
  private async updateMetricRollup(metric: TelemetryMetric): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO telemetry_metrics_rollup
         (tenant_id, metric_name, metric_type, bucket_hour, count, sum, min, max, avg, tags)
         VALUES (
           $1, $2, $3,
           DATE_TRUNC('hour', NOW()),
           1, $4, $4, $4, $4, $5
         )
         ON CONFLICT (tenant_id, metric_name, bucket_hour, tags)
         DO UPDATE SET
           count = telemetry_metrics_rollup.count + 1,
           sum = telemetry_metrics_rollup.sum + EXCLUDED.sum,
           min = LEAST(telemetry_metrics_rollup.min, EXCLUDED.min),
           max = GREATEST(telemetry_metrics_rollup.max, EXCLUDED.max),
           avg = (telemetry_metrics_rollup.sum + EXCLUDED.sum) / (telemetry_metrics_rollup.count + 1)`,
        [
          metric.tenantId || null,
          metric.metricName,
          metric.metricType || 'gauge',
          metric.value,
          JSON.stringify(metric.tags || {}),
        ]
      );
    } catch (err) {
      logger.warn({ err, metric: metric.metricName }, 'Failed to update metric rollup');
      // Don't throw - rollup is best-effort
    }
  }

  /**
   * Get events by filters
   */
  async getEvents(filters: {
    tenantId?: string;
    runId?: string;
    taskId?: string;
    eventType?: string;
    severity?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<TelemetryEvent[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      values.push(filters.tenantId);
    }

    if (filters.runId) {
      conditions.push(`run_id = $${paramIndex++}`);
      values.push(filters.runId);
    }

    if (filters.taskId) {
      conditions.push(`task_id = $${paramIndex++}`);
      values.push(filters.taskId);
    }

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      values.push(filters.eventType);
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(filters.severity);
    }

    if (filters.startTime) {
      conditions.push(`recorded_at >= $${paramIndex++}`);
      values.push(filters.startTime);
    }

    if (filters.endTime) {
      conditions.push(`recorded_at <= $${paramIndex++}`);
      values.push(filters.endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;

    const result = await this.pool.query(
      `SELECT * FROM telemetry_events
       ${whereClause}
       ORDER BY recorded_at DESC
       LIMIT $${paramIndex}`,
      [...values, limit]
    );

    return result.rows.map((row) => ({
      taskId: row.task_id,
      runId: row.run_id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      severity: row.severity,
      tags: row.tags,
      metrics: row.metrics,
      context: row.context,
      correlationId: row.correlation_id,
      parentEventId: row.parent_event_id,
    }));
  }

  /**
   * Get metric time series
   */
  async getMetricTimeSeries(
    tenantId: string,
    metricName: string,
    hours: number = 24
  ): Promise<TimeSeriesDataPoint[]> {
    const result = await this.pool.query(
      `SELECT * FROM get_telemetry_metrics($1, $2, $3)`,
      [tenantId, metricName, hours]
    );

    return result.rows.map((row) => ({
      timestamp: row.bucket_hour,
      value: parseFloat(row.avg),
    }));
  }

  /**
   * Get aggregated metrics
   */
  async getAggregatedMetrics(
    tenantId: string,
    metricNames: string[],
    hours: number = 24
  ): Promise<AggregatedMetric[]> {
    const result = await this.pool.query(
      `SELECT
         metric_name,
         SUM(count)::INTEGER as count,
         SUM(sum) as sum,
         MIN(min) as min,
         MAX(max) as max,
         AVG(avg) as avg,
         PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg) as p50,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY avg) as p95,
         PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY avg) as p99
       FROM telemetry_metrics_rollup
       WHERE tenant_id = $1
         AND metric_name = ANY($2)
         AND bucket_hour > NOW() - ($3 || ' hours')::INTERVAL
       GROUP BY metric_name`,
      [tenantId, metricNames, hours]
    );

    return result.rows.map((row) => ({
      metricName: row.metric_name,
      count: parseInt(row.count),
      sum: parseFloat(row.sum),
      min: parseFloat(row.min),
      max: parseFloat(row.max),
      avg: parseFloat(row.avg),
      p50: parseFloat(row.p50),
      p95: parseFloat(row.p95),
      p99: parseFloat(row.p99),
    }));
  }

  /**
   * Get event summary by hour
   */
  async getHourlySummary(tenantId?: string, hours: number = 24): Promise<any[]> {
    const whereClause = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    const result = await this.pool.query(
      `SELECT * FROM v_telemetry_hourly_summary
       ${whereClause}
       AND hour > NOW() - ($${params.length + 1} || ' hours')::INTERVAL
       ORDER BY hour DESC`,
      [...params, hours]
    );

    return result.rows;
  }

  /**
   * Start a distributed trace span
   */
  async startSpan(span: Omit<TelemetrySpan, 'endTime' | 'duration'>): Promise<string> {
    const eventId = await this.logEvent({
      eventType: 'span.start',
      correlationId: span.traceId,
      parentEventId: span.parentSpanId,
      tags: {
        span_id: span.spanId,
        trace_id: span.traceId,
        operation: span.operationName,
        ...span.tags,
      },
      context: {
        start_time: span.startTime.toISOString(),
      },
    });

    return eventId;
  }

  /**
   * End a distributed trace span
   */
  async endSpan(
    spanId: string,
    traceId: string,
    endTime: Date,
    tags?: Record<string, string>
  ): Promise<void> {
    await this.logEvent({
      eventType: 'span.end',
      correlationId: traceId,
      tags: {
        span_id: spanId,
        trace_id: traceId,
        ...tags,
      },
      context: {
        end_time: endTime.toISOString(),
      },
    });
  }

  /**
   * Legacy method for backward compatibility
   */
  async logTaskOutcome(outcome: TaskOutcome): Promise<void> {
    await this.logEvent({
      taskId: outcome.taskId,
      eventType: 'task.outcome',
      severity: outcome.success ? 'info' : 'error',
      tags: {
        task_type: outcome.taskType,
        model_used: outcome.modelUsed,
        origin: outcome.origin,
      },
      metrics: {
        duration: outcome.duration,
      },
      context: {
        success: outcome.success,
      },
    });
  }

  /**
   * Clean up old events (data retention)
   */
  async cleanupOldEvents(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM telemetry_events
       WHERE recorded_at < NOW() - ($1 || ' days')::INTERVAL`,
      [this.config.retentionDays]
    );

    const deletedCount = result.rowCount || 0;

    if (deletedCount > 0) {
      logger.info({ deletedCount, retentionDays: this.config.retentionDays }, 'Old events cleaned up');
    }

    return deletedCount;
  }

  /**
   * Rollup metrics (aggregate to hourly buckets)
   */
  async rollupMetrics(hours: number = 1): Promise<void> {
    logger.info({ hours }, 'Starting metric rollup');

    // This is a placeholder - in production, you'd aggregate from raw events
    // For now, we're doing real-time rollup in updateMetricRollup()

    logger.info({ hours }, 'Metric rollup complete');
  }

  /**
   * Get tenant event statistics
   */
  async getTenantStats(tenantId: string, hours: number = 24): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    errorRate: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) as total_events,
         COUNT(*) FILTER (WHERE severity = 'error' OR severity = 'critical') as error_count,
         json_object_agg(event_type, type_count) as events_by_type,
         json_object_agg(severity, severity_count) as events_by_severity
       FROM (
         SELECT
           event_type,
           severity,
           COUNT(*) OVER (PARTITION BY event_type) as type_count,
           COUNT(*) OVER (PARTITION BY severity) as severity_count
         FROM telemetry_events
         WHERE tenant_id = $1
           AND recorded_at > NOW() - ($2 || ' hours')::INTERVAL
       ) subq`,
      [tenantId, hours]
    );

    if (result.rows.length === 0) {
      return {
        totalEvents: 0,
        eventsByType: {},
        eventsBySeverity: {},
        errorRate: 0,
      };
    }

    const row = result.rows[0];
    const totalEvents = parseInt(row.total_events) || 0;
    const errorCount = parseInt(row.error_count) || 0;

    return {
      totalEvents,
      eventsByType: row.events_by_type || {},
      eventsBySeverity: row.events_by_severity || {},
      errorRate: totalEvents > 0 ? errorCount / totalEvents : 0,
    };
  }
}

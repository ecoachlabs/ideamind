/**
 * Delta Event Publisher
 *
 * Publishes Knowledge Map delta events for cache warming and notifications.
 *
 * Event Types:
 * - kmap.delta.created: New knowledge nodes created
 * - kmap.delta.updated: Existing knowledge updated
 * - kmap.delta.superseded: Knowledge superseded by newer version
 * - kmap.delta.conflict: Conflict detected
 *
 * Transport:
 * - Database (km_delta_events table)
 * - Kafka (future)
 * - Redis Pub/Sub (future)
 * - Webhooks (future)
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';

// ============================================================================
// DELTA PUBLISHER
// ============================================================================

export class DeltaPublisher extends EventEmitter {
  private db: Pool;
  private phase: string;
  private runId: string;

  constructor(config: DeltaPublisherConfig) {
    super();
    this.db = config.dbPool;
    this.phase = config.phase;
    this.runId = config.runId;
  }

  /**
   * Publish delta event
   */
  async publish(event: DeltaEvent): Promise<void> {
    const eventId = this.generateEventId();

    console.log(`[DeltaPublisher] Publishing ${event.type}: ${eventId}`);

    // Store in database
    await this.storeEvent(eventId, event);

    // Emit to local listeners
    this.emit('delta', {
      eventId,
      ...event,
    });

    // Publish to external transports
    await this.publishExternal(eventId, event);
  }

  /**
   * Publish batch of delta events
   */
  async publishBatch(events: DeltaEvent[]): Promise<void> {
    console.log(`[DeltaPublisher] Publishing batch of ${events.length} events`);

    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Publish "created" event for new canonical answers
   */
  async publishCreated(data: {
    answerId: string;
    answer: string;
    knowledgeFrame?: any;
  }): Promise<void> {
    await this.publish({
      type: 'kmap.delta.created',
      delta: {
        added: [
          {
            nodeType: 'answer',
            nodeId: data.answerId,
            content: data.answer,
            knowledgeFrame: data.knowledgeFrame,
          },
        ],
        updated: [],
        removed: [],
      },
      affectedNodes: [data.answerId],
      affectedEdges: [],
    });
  }

  /**
   * Publish "updated" event for modified knowledge
   */
  async publishUpdated(data: {
    nodeId: string;
    previousVersion: string;
    newVersion: string;
  }): Promise<void> {
    await this.publish({
      type: 'kmap.delta.updated',
      delta: {
        added: [],
        updated: [
          {
            nodeId: data.nodeId,
            previousVersion: data.previousVersion,
            newVersion: data.newVersion,
          },
        ],
        removed: [],
      },
      affectedNodes: [data.nodeId],
      affectedEdges: [],
    });
  }

  /**
   * Publish "superseded" event when knowledge is replaced
   */
  async publishSuperseded(data: {
    oldNodeId: string;
    newNodeId: string;
  }): Promise<void> {
    await this.publish({
      type: 'kmap.delta.superseded',
      delta: {
        added: [],
        updated: [],
        removed: [data.oldNodeId],
      },
      affectedNodes: [data.oldNodeId, data.newNodeId],
      affectedEdges: [`${data.newNodeId}->supersedes->${data.oldNodeId}`],
    });
  }

  /**
   * Publish "conflict" event when contradictions detected
   */
  async publishConflict(data: {
    nodeIds: string[];
    description: string;
    severity: 'high' | 'medium' | 'low';
  }): Promise<void> {
    await this.publish({
      type: 'kmap.delta.conflict',
      delta: {
        added: [],
        updated: [],
        removed: [],
        conflict: {
          nodeIds: data.nodeIds,
          description: data.description,
          severity: data.severity,
        },
      },
      affectedNodes: data.nodeIds,
      affectedEdges: [],
    });
  }

  /**
   * Store event in database
   */
  private async storeEvent(eventId: string, event: DeltaEvent): Promise<void> {
    const query = `
      INSERT INTO km_delta_events (
        event_id, event_type, phase, run_id,
        affected_nodes, affected_edges, delta, published_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.db.query(query, [
      eventId,
      event.type,
      this.phase,
      this.runId,
      event.affectedNodes,
      event.affectedEdges,
      JSON.stringify(event.delta),
      ['database'], // Start with database only
    ]);
  }

  /**
   * Publish to external transports (NATS, Webhooks)
   */
  private async publishExternal(eventId: string, event: DeltaEvent): Promise<void> {
    const publishedTo: string[] = ['database'];

    // Publish to NATS if configured
    if (process.env.NATS_URL) {
      try {
        await this.publishToNATS(eventId, event);
        publishedTo.push('nats');
      } catch (error) {
        console.warn(`[DeltaPublisher] Failed to publish to NATS:`, error);
      }
    }

    // Publish to webhooks if configured
    const webhookUrls = process.env.DELTA_WEBHOOK_URLS?.split(',').filter(Boolean) || [];
    if (webhookUrls.length > 0) {
      try {
        await this.publishToWebhooks(eventId, event, webhookUrls);
        publishedTo.push('webhooks');
      } catch (error) {
        console.warn(`[DeltaPublisher] Failed to publish to webhooks:`, error);
      }
    }

    // Update published_to in database
    if (publishedTo.length > 1) {
      await this.updatePublishedTo(eventId, publishedTo);
    }

    console.log(`[DeltaPublisher] Published ${eventId} to: ${publishedTo.join(', ')}`);
  }

  /**
   * Publish delta event to NATS
   */
  private async publishToNATS(eventId: string, event: DeltaEvent): Promise<void> {
    const { connect, StringCodec } = await import('nats');
    const nc = await connect({
      servers: process.env.NATS_URL!.split(','),
      name: 'ideamine-delta-publisher',
    });

    const sc = StringCodec();
    const payload = JSON.stringify({
      eventId,
      ...event,
      phase: this.phase,
      runId: this.runId,
      timestamp: new Date().toISOString(),
    });

    // Publish to topic: knowledge-map-deltas
    nc.publish('knowledge-map-deltas', sc.encode(payload));

    // Also publish to phase-specific topic
    nc.publish(`knowledge-map-deltas.${this.phase}`, sc.encode(payload));

    await nc.drain();
  }

  /**
   * Publish delta event to webhooks
   */
  private async publishToWebhooks(
    eventId: string,
    event: DeltaEvent,
    webhookUrls: string[]
  ): Promise<void> {
    const payload = {
      eventId,
      ...event,
      phase: this.phase,
      runId: this.runId,
      timestamp: new Date().toISOString(),
    };

    const webhookPromises = webhookUrls.map(async (url) => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Event-ID': eventId,
            'X-Event-Type': event.type,
            'X-Phase': this.phase,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          console.warn(`[DeltaPublisher] Webhook ${url} returned ${response.status}`);
        }
      } catch (error) {
        console.warn(`[DeltaPublisher] Failed to call webhook ${url}:`, error);
      }
    });

    // Fire and forget - don't wait for all webhooks
    await Promise.allSettled(webhookPromises);
  }

  /**
   * Update published_to array in database
   */
  private async updatePublishedTo(eventId: string, publishedTo: string[]): Promise<void> {
    const query = `
      UPDATE km_delta_events
      SET published_to = $1
      WHERE event_id = $2
    `;

    await this.db.query(query, [publishedTo, eventId]);
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `EVT-${this.phase}-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Query recent deltas
   */
  async getRecentDeltas(limit = 100): Promise<StoredDeltaEvent[]> {
    const query = `
      SELECT event_id, event_type, phase, run_id,
             affected_nodes, affected_edges, delta,
             published_to, created_at
      FROM km_delta_events
      WHERE phase = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [this.phase, limit]);

    return result.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      phase: row.phase,
      runId: row.run_id,
      affectedNodes: row.affected_nodes,
      affectedEdges: row.affected_edges,
      delta: row.delta,
      publishedTo: row.published_to,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get deltas for a specific run
   */
  async getDeltasForRun(runId: string): Promise<StoredDeltaEvent[]> {
    const query = `
      SELECT event_id, event_type, phase, run_id,
             affected_nodes, affected_edges, delta,
             published_to, created_at
      FROM km_delta_events
      WHERE run_id = $1
      ORDER BY created_at ASC
    `;

    const result = await this.db.query(query, [runId]);

    return result.rows.map((row) => ({
      eventId: row.event_id,
      eventType: row.event_type,
      phase: row.phase,
      runId: row.run_id,
      affectedNodes: row.affected_nodes,
      affectedEdges: row.affected_edges,
      delta: row.delta,
      publishedTo: row.published_to,
      createdAt: row.created_at,
    }));
  }
}

// ============================================================================
// DELTA SUBSCRIBER
// ============================================================================

/**
 * Subscriber for delta events (for cache warming, indexing, etc.)
 */
export class DeltaSubscriber extends EventEmitter {
  private publisher: DeltaPublisher;

  constructor(publisher: DeltaPublisher) {
    super();
    this.publisher = publisher;

    // Subscribe to delta events
    this.publisher.on('delta', (event) => {
      this.handleDelta(event);
    });
  }

  /**
   * Handle delta event
   */
  private handleDelta(event: any): void {
    console.log(`[DeltaSubscriber] Received ${event.type}: ${event.eventId}`);

    // Emit to specific handlers
    switch (event.type) {
      case 'kmap.delta.created':
        this.emit('created', event);
        break;
      case 'kmap.delta.updated':
        this.emit('updated', event);
        break;
      case 'kmap.delta.superseded':
        this.emit('superseded', event);
        break;
      case 'kmap.delta.conflict':
        this.emit('conflict', event);
        break;
    }
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface DeltaPublisherConfig {
  dbPool: Pool;
  phase: string;
  runId: string;
}

export interface DeltaEvent {
  type: 'kmap.delta.created' | 'kmap.delta.updated' | 'kmap.delta.superseded' | 'kmap.delta.conflict';
  delta: {
    added: any[];
    updated: any[];
    removed: any[];
    conflict?: {
      nodeIds: string[];
      description: string;
      severity: string;
    };
  };
  affectedNodes: string[];
  affectedEdges: string[];
}

export interface StoredDeltaEvent {
  eventId: string;
  eventType: string;
  phase: string;
  runId: string;
  affectedNodes: string[];
  affectedEdges: string[];
  delta: any;
  publishedTo: string[];
  createdAt: Date;
}

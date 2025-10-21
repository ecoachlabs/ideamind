/**
 * Memory Broker
 *
 * Pub/sub system for distributing memory updates across doers and phases
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import pino from 'pino';
import { MemoryTopic, MemorySubscription, MemoryDelta, KnowledgeFrame } from './types';

const logger = pino({ name: 'memory-broker' });

export class MemoryBroker extends EventEmitter {
  private subscriptions: Map<string, MemorySubscription> = new Map();

  constructor(private db: Pool) {
    super();
  }

  /**
   * Subscribe to memory updates
   */
  async subscribe(
    topic: MemoryTopic | string,
    options?: {
      doer?: string;
      phase?: string;
      theme?: string;
      callback?: string;
    }
  ): Promise<string> {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const subscription: MemorySubscription = {
      id: subscriptionId,
      topic,
      doer: options?.doer,
      phase: options?.phase,
      theme: options?.theme,
      callback: options?.callback,
      createdAt: new Date(),
    };

    // Store in database
    const query = `
      INSERT INTO memory_subscriptions (
        id, topic, doer, phase, theme, callback, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    await this.db.query(query, [
      subscriptionId,
      topic,
      options?.doer || null,
      options?.phase || null,
      options?.theme || null,
      options?.callback || null,
      new Date(),
    ]);

    // Store in memory for fast access
    this.subscriptions.set(subscriptionId, subscription);

    logger.info({ subscriptionId, topic, options }, 'Subscription created');

    return subscriptionId;
  }

  /**
   * Unsubscribe from updates
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const query = `DELETE FROM memory_subscriptions WHERE id = $1`;
    await this.db.query(query, [subscriptionId]);

    this.subscriptions.delete(subscriptionId);

    logger.info({ subscriptionId }, 'Subscription removed');
  }

  /**
   * Publish a memory delta
   */
  async publish(delta: MemoryDelta): Promise<void> {
    logger.info({ topic: delta.topic, summary: delta.summary }, 'Publishing memory delta');

    // Store delta in database
    await this.storeDelta(delta);

    // Find matching subscriptions
    const matches = this.findMatchingSubscriptions(delta.topic);

    logger.debug({ matches: matches.length }, 'Found matching subscriptions');

    // Emit to subscribers
    for (const subscription of matches) {
      // Filter by additional criteria
      if (!this.matchesSubscription(delta, subscription)) {
        continue;
      }

      // Emit event
      this.emit('delta', {
        subscription,
        delta,
      });

      // Call webhook if configured
      if (subscription.callback) {
        this.invokeWebhook(subscription.callback, delta).catch((err) => {
          logger.error({ err, callback: subscription.callback }, 'Webhook invocation failed');
        });
      }

      logger.debug({ subscriptionId: subscription.id }, 'Delta delivered to subscription');
    }
  }

  /**
   * Publish frame creation
   */
  async publishFrameCreated(frames: KnowledgeFrame[]): Promise<void> {
    const delta: MemoryDelta = {
      topic: 'memory.delta.created',
      frameIds: frames.map((f) => f.id),
      summary: `${frames.length} new knowledge frames created`,
      timestamp: new Date(),
      metadata: {
        themes: [...new Set(frames.map((f) => f.theme))],
        scopes: [...new Set(frames.map((f) => f.scope))],
      },
    };

    await this.publish(delta);
  }

  /**
   * Publish frame update
   */
  async publishFrameUpdated(frames: KnowledgeFrame[]): Promise<void> {
    const delta: MemoryDelta = {
      topic: 'memory.delta.updated',
      frameIds: frames.map((f) => f.id),
      summary: `${frames.length} knowledge frames updated`,
      timestamp: new Date(),
      metadata: {
        themes: [...new Set(frames.map((f) => f.theme))],
      },
    };

    await this.publish(delta);
  }

  /**
   * Publish policy promotion
   */
  async publishPolicyPromoted(policyId: string, fromStatus: string, toStatus: string): Promise<void> {
    const delta: MemoryDelta = {
      topic: 'memory.policy.promoted',
      policyIds: [policyId],
      summary: `Policy ${policyId} promoted from ${fromStatus} to ${toStatus}`,
      timestamp: new Date(),
      metadata: {
        policyId,
        fromStatus,
        toStatus,
      },
    };

    await this.publish(delta);
  }

  /**
   * Get delta stream from cursor
   */
  async getDeltaStream(cursor?: number, limit: number = 50): Promise<MemoryDelta[]> {
    let query = `SELECT * FROM memory_deltas`;
    const values: any[] = [];

    if (cursor) {
      query += ` WHERE id > $1`;
      values.push(cursor);
    }

    query += ` ORDER BY id ASC LIMIT $${values.length + 1}`;
    values.push(limit);

    const result = await this.db.query(query, values);

    return result.rows.map((row) => ({
      topic: row.topic,
      frameIds: JSON.parse(row.frame_ids || '[]'),
      policyIds: JSON.parse(row.policy_ids || '[]'),
      summary: row.summary,
      timestamp: row.timestamp,
      metadata: JSON.parse(row.metadata || '{}'),
    }));
  }

  /**
   * Load subscriptions from database
   */
  async loadSubscriptions(): Promise<void> {
    const query = `SELECT * FROM memory_subscriptions`;
    const result = await this.db.query(query);

    for (const row of result.rows) {
      const subscription: MemorySubscription = {
        id: row.id,
        topic: row.topic,
        doer: row.doer,
        phase: row.phase,
        theme: row.theme,
        callback: row.callback,
        createdAt: row.created_at,
      };

      this.subscriptions.set(subscription.id, subscription);
    }

    logger.info({ count: this.subscriptions.size }, 'Subscriptions loaded');
  }

  /**
   * Find subscriptions matching a topic
   */
  private findMatchingSubscriptions(topic: string): MemorySubscription[] {
    const matches: MemorySubscription[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (this.topicMatches(topic, subscription.topic)) {
        matches.push(subscription);
      }
    }

    return matches;
  }

  /**
   * Check if topic matches subscription pattern (supports wildcards)
   */
  private topicMatches(topic: string, pattern: string): boolean {
    // Support wildcard: "memory.delta.*" matches "memory.delta.created"
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return topic.startsWith(prefix);
    }

    // Support wildcard: "memory.*" matches "memory.delta.created"
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(topic);
    }

    // Exact match
    return topic === pattern;
  }

  /**
   * Check if delta matches subscription filters
   */
  private matchesSubscription(delta: MemoryDelta, subscription: MemorySubscription): boolean {
    // Check phase filter
    if (subscription.phase && delta.metadata?.phase !== subscription.phase) {
      return false;
    }

    // Check theme filter
    if (subscription.theme) {
      const themes = delta.metadata?.themes as string[] | undefined;
      if (!themes || !themes.some((t) => t.startsWith(subscription.theme!))) {
        return false;
      }
    }

    // Check doer filter
    if (subscription.doer && delta.metadata?.doer !== subscription.doer) {
      return false;
    }

    return true;
  }

  /**
   * Store delta in database for replay
   */
  private async storeDelta(delta: MemoryDelta): Promise<void> {
    const query = `
      INSERT INTO memory_deltas (
        topic, frame_ids, policy_ids, summary, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await this.db.query(query, [
      delta.topic,
      JSON.stringify(delta.frameIds || []),
      JSON.stringify(delta.policyIds || []),
      delta.summary,
      delta.timestamp,
      JSON.stringify(delta.metadata || {}),
    ]);
  }

  /**
   * Invoke webhook for subscription
   */
  private async invokeWebhook(callbackUrl: string, delta: MemoryDelta): Promise<void> {
    // In production, use proper HTTP client
    logger.debug({ callbackUrl, delta: delta.summary }, 'Would invoke webhook');

    // Placeholder for HTTP POST to callback URL
    // await fetch(callbackUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(delta)
    // });
  }
}

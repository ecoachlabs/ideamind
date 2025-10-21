/**
 * Queue message structure
 */
export interface QueueMessage {
  key: string;
  payload: Record<string, any>;
  timestamp: number;
}

/**
 * Task specification (from spec)
 */
export interface TaskSpec {
  id: string;
  phase: string;
  type: 'agent' | 'tool';
  target: string;
  input: Record<string, any>;
  retries?: number;
  budget: {
    ms: number;
    tokens?: number;
  };
  egress_policy?: Record<string, any>;
  idempotence_key?: string;
}

/**
 * Consumer handler function
 */
export type ConsumerHandler = (message: QueueMessage) => Promise<void>;

/**
 * Queue configuration
 */
export interface QueueConfig {
  redisUrl?: string;
  idempotenceTtlSeconds?: number;
  blockTimeMs?: number;
  batchSize?: number;
}

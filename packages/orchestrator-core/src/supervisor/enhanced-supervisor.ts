import pino from 'pino';
import { Supervisor, SupervisionConfig, ExecutionContext } from './supervisor';
import { HeartbeatMonitor } from '../runners/heartbeat';
import { ProgressSlopeMonitor } from '../heal/slopeMonitor';
import { FallbackLadder, ToolExecutor } from '../heal/fallbackLadder';
import { SpecShrinker } from '../heal/chunker';
import { RetryPolicyEngine, ErrorType } from '../utils/retries';
import { EventBus } from '../events/event-bus';
import { Recorder } from '../recorder/recorder';

const logger = pino({ name: 'enhanced-supervisor' });

/**
 * Enhanced Supervisor - Orchestrates all unsticker routines
 *
 * Integrates:
 * - Base Supervisor (retries, circuit breaker, heartbeat)
 * - HeartbeatMonitor (stall detection)
 * - ProgressSlopeMonitor (plateau detection)
 * - FallbackLadder (tool fallback)
 * - SpecShrinker (work chunking)
 * - RetryPolicyEngine (error-specific retries)
 *
 * Spec: orchestrator.txt:41, 65, 128-150; phase.txt:82-90
 */
export class EnhancedSupervisor {
  private baseSupervisor: Supervisor;
  private heartbeatMonitor: HeartbeatMonitor;
  private slopeMonitor: ProgressSlopeMonitor;
  private fallbackLadder: FallbackLadder;
  private specShrinker: SpecShrinker;
  private retryEngine: RetryPolicyEngine;

  constructor(
    config: SupervisionConfig,
    eventBus: EventBus,
    toolExecutor: ToolExecutor,
    recorder?: Recorder
  ) {
    this.baseSupervisor = new Supervisor(config, recorder);

    // Initialize unsticker routines
    this.heartbeatMonitor = new HeartbeatMonitor(
      {
        interval_seconds: 60,
        stall_threshold_heartbeats: 3,
      },
      eventBus,
      (taskId) => this.handleStall(taskId)
    );

    this.slopeMonitor = new ProgressSlopeMonitor(eventBus);
    this.fallbackLadder = new FallbackLadder(toolExecutor);
    this.specShrinker = new SpecShrinker();
    this.retryEngine = new RetryPolicyEngine();

    logger.info('EnhancedSupervisor initialized with all unsticker routines');
  }

  /**
   * Start supervisor (start heartbeat monitoring)
   */
  start(): void {
    this.heartbeatMonitor.start();
    logger.info('EnhancedSupervisor started');
  }

  /**
   * Stop supervisor (stop heartbeat monitoring)
   */
  stop(): void {
    this.heartbeatMonitor.stop();
    logger.info('EnhancedSupervisor stopped');
  }

  /**
   * Execute with full supervision (retries, heartbeat, circuit breaker)
   */
  async executeWithRetry<T>(
    context: ExecutionContext,
    fn: () => Promise<T>
  ) {
    // Use base supervisor for retry logic
    return this.baseSupervisor.executeWithRetry(context, fn);
  }

  /**
   * Execute with retry policy engine (error-specific retries)
   */
  async executeWithRetryPolicy<T>(
    fn: () => Promise<T>,
    errorType: ErrorType,
    taskId?: string
  ): Promise<T> {
    return this.retryEngine.executeWithRetry(fn, errorType, taskId);
  }

  /**
   * Execute tool with fallback ladder
   */
  async executeToolWithFallback(
    primaryTool: string,
    allowlistedTools: string[],
    input: any
  ) {
    return this.fallbackLadder.executeWithFallback(primaryTool, allowlistedTools, input);
  }

  /**
   * Handle stalled task
   *
   * Implements unsticker routines from orchestrator.txt:128-150
   *
   * Strategy:
   * 1. Check progress slope - if plateau, adjust strategy
   * 2. Try alternate tool (fallback ladder)
   * 3. Chunk the work (spec shrinker)
   * 4. Retry with different parameters
   */
  async handleStall(taskId: string): Promise<void> {
    logger.warn({ taskId }, 'Handling stalled task');

    try {
      // Strategy 1: Check progress slope
      if (this.slopeMonitor.detectPlateau(taskId)) {
        logger.info({ taskId }, 'Plateau detected, adjusting strategy');
        await this.slopeMonitor.adjustStrategy(taskId);
        return;
      }

      // Strategy 2: Try alternate tool (handled by fallback ladder)
      // This is integrated at the execution level, not here

      // Strategy 3: Chunk the work (spec shrinker)
      // This is also integrated at the execution level

      // Strategy 4: Retry with different parameters
      logger.info({ taskId }, 'Retrying task with adjusted parameters');
      await this.retryTaskWithAdjustedParams(taskId);
    } catch (error) {
      logger.error({ error, taskId }, 'Failed to handle stall');
    }
  }

  /**
   * Retry task with adjusted parameters
   *
   * Adjustments:
   * - Reduce batch size
   * - Increase timeout
   * - Use stricter prompts
   */
  private async retryTaskWithAdjustedParams(taskId: string): Promise<void> {
    // Implementation depends on task type
    // For now, just log
    logger.info({ taskId }, 'Retrying task with adjusted parameters (placeholder)');

    // TODO: Integrate with task execution system to actually retry
  }

  /**
   * Record heartbeat for task
   */
  recordHeartbeat(taskId: string): void {
    this.heartbeatMonitor.recordHeartbeat(taskId);
  }

  /**
   * Mark task as completed
   */
  taskCompleted(taskId: string): void {
    this.heartbeatMonitor.taskCompleted(taskId);
    this.slopeMonitor.taskCompleted(taskId);
  }

  /**
   * Record progress for task
   */
  recordProgress(taskId: string, pct: number): void {
    this.slopeMonitor.recordProgress(taskId, pct);
  }

  /**
   * Chunk large codebase for processing
   */
  async chunkCodebase(codebase: { files: string[]; totalLOC?: number }, maxChunkLOC?: number) {
    return this.specShrinker.chunkLargeCodebase(codebase, maxChunkLOC);
  }

  /**
   * Chunk items list
   */
  chunkItems<T>(items: T[], maxItemsPerChunk: number): T[][] {
    return this.specShrinker.chunkItems(items, maxItemsPerChunk);
  }

  /**
   * Classify error type for retry policy
   */
  classifyError(error: Error): ErrorType {
    return this.retryEngine.classifyError(error);
  }

  /**
   * Get base supervisor (for direct access)
   */
  getBaseSupervisor(): Supervisor {
    return this.baseSupervisor;
  }

  /**
   * Get comprehensive supervision metrics
   */
  getMetrics() {
    return {
      supervisor: this.baseSupervisor.getMetrics(),
      heartbeat: this.heartbeatMonitor.getStats(),
      slope: this.slopeMonitor.getStats(),
      retries: this.retryEngine.getStats(),
    };
  }

  /**
   * Start heartbeat monitoring for execution
   */
  startHeartbeat(executionId: string): void {
    this.baseSupervisor.startHeartbeat(executionId);
    this.heartbeatMonitor.recordHeartbeat(executionId);
  }

  /**
   * Stop heartbeat monitoring for execution
   */
  stopHeartbeat(executionId: string): void {
    this.baseSupervisor.stopHeartbeat(executionId);
    this.heartbeatMonitor.taskCompleted(executionId);
  }

  /**
   * Check if execution is stuck
   */
  isStuck(executionId: string): boolean {
    return this.baseSupervisor.isStuck(executionId);
  }

  /**
   * Quarantine actor
   */
  quarantine(actor: string): void {
    this.baseSupervisor.quarantine(actor);
  }

  /**
   * Release actor from quarantine
   */
  releaseFromQuarantine(actor: string): void {
    this.baseSupervisor.releaseFromQuarantine(actor);
  }

  /**
   * Check if actor is quarantined
   */
  isQuarantined(actor: string): boolean {
    return this.baseSupervisor.isQuarantined(actor);
  }
}

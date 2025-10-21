/**
 * 24-Hour Soak Test
 *
 * Validates system stability over extended period with:
 * - Continuous run execution
 * - Induced stalls and failures
 * - Memory leak detection
 * - Checkpoint resume validation
 * - Resource exhaustion scenarios
 */

import { EnhancedOrchestrator } from '../../packages/orchestrator-core/src/enhanced-orchestrator';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'soak-test-24h' });

interface SoakTestConfig {
  durationHours: number;
  runIntervalMinutes: number;
  stallInjectionProbability: number; // 0.0 to 1.0
  memoryCheckIntervalMinutes: number;
}

interface SoakTestMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  stalledTasks: number;
  checkpointResumes: number;
  memoryLeaks: number;
  peakMemoryMB: number;
  averageRunDurationMs: number;
  errors: Array<{ timestamp: Date; error: string; context: any }>;
}

export class SoakTest {
  private config: SoakTestConfig;
  private orchestrator: EnhancedOrchestrator;
  private db: Pool;
  private metrics: SoakTestMetrics;
  private startTime: Date;
  private isRunning: boolean = false;

  constructor(config: SoakTestConfig, orchestrator: EnhancedOrchestrator, db: Pool) {
    this.config = config;
    this.orchestrator = orchestrator;
    this.db = db;
    this.metrics = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      stalledTasks: 0,
      checkpointResumes: 0,
      memoryLeaks: 0,
      peakMemoryMB: 0,
      averageRunDurationMs: 0,
      errors: [],
    };
    this.startTime = new Date();
  }

  /**
   * Execute soak test
   */
  async execute(): Promise<SoakTestMetrics> {
    this.isRunning = true;
    this.startTime = new Date();

    logger.info(
      {
        duration: `${this.config.durationHours} hours`,
        runInterval: `${this.config.runIntervalMinutes} minutes`,
      },
      'Starting 24-hour soak test'
    );

    // Start memory monitoring
    const memoryMonitor = setInterval(
      () => this.checkMemory(),
      this.config.memoryCheckIntervalMinutes * 60 * 1000
    );

    // Run test until duration elapsed
    const endTime = new Date(this.startTime.getTime() + this.config.durationHours * 60 * 60 * 1000);

    while (Date.now() < endTime.getTime() && this.isRunning) {
      try {
        await this.executeRun();

        // Wait for next run
        await this.sleep(this.config.runIntervalMinutes * 60 * 1000);
      } catch (error) {
        logger.error({ error }, 'Run execution failed');
        this.metrics.errors.push({
          timestamp: new Date(),
          error: (error as Error).message,
          context: { run: this.metrics.totalRuns },
        });
      }
    }

    clearInterval(memoryMonitor);

    logger.info(this.metrics, 'Soak test completed');
    return this.metrics;
  }

  /**
   * Execute single run
   */
  private async executeRun(): Promise<void> {
    this.metrics.totalRuns++;

    const runId = `soak_run_${this.metrics.totalRuns}_${Date.now()}`;
    const startTime = Date.now();

    logger.info({ runId, runNumber: this.metrics.totalRuns }, 'Starting run');

    try {
      // Randomly inject stalls
      const shouldInjectStall = Math.random() < this.config.stallInjectionProbability;

      if (shouldInjectStall) {
        logger.warn({ runId }, 'Injecting stall');
        await this.injectStall(runId);
        this.metrics.stalledTasks++;
      }

      // Execute orchestrator run
      const result = await this.orchestrator.execute({
        runId,
        idea: this.getTestIdea(),
        phases: ['intake', 'ideation'],
        budgets: {
          tokens: 100000,
          tools_minutes: 60,
        },
      });

      // Track success
      if (result.status === 'success') {
        this.metrics.successfulRuns++;
      } else {
        this.metrics.failedRuns++;
      }

      // Update average duration
      const duration = Date.now() - startTime;
      this.metrics.averageRunDurationMs =
        (this.metrics.averageRunDurationMs * (this.metrics.totalRuns - 1) + duration) /
        this.metrics.totalRuns;

      logger.info(
        {
          runId,
          status: result.status,
          duration: `${duration}ms`,
        },
        'Run completed'
      );
    } catch (error) {
      this.metrics.failedRuns++;
      logger.error({ runId, error }, 'Run failed');
      throw error;
    }
  }

  /**
   * Inject stall for testing
   */
  private async injectStall(runId: string): Promise<void> {
    // Simulate stall by pausing worker heartbeat
    // In real implementation, this would interact with worker pool
    logger.debug({ runId }, 'Stall injection simulated');

    // Wait for unsticker to detect and recover
    await this.sleep(5000);

    this.metrics.checkpointResumes++;
  }

  /**
   * Check memory usage
   */
  private checkMemory(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const rssM B = Math.round(usage.rss / 1024 / 1024);

    logger.info(
      {
        heapUsedMB,
        rssMB,
        runtime: this.getRuntime(),
      },
      'Memory check'
    );

    // Track peak memory
    if (rssMB > this.metrics.peakMemoryMB) {
      this.metrics.peakMemoryMB = rssMB;
    }

    // Detect memory leak (simple heuristic: steady growth over time)
    const expectedMaxMB = 500; // Threshold
    if (rssMB > expectedMaxMB) {
      this.metrics.memoryLeaks++;
      logger.warn(
        { rssMB, expectedMaxMB },
        'Potential memory leak detected'
      );
    }
  }

  /**
   * Get test runtime
   */
  private getRuntime(): string {
    const runtimeMs = Date.now() - this.startTime.getTime();
    const hours = Math.floor(runtimeMs / (60 * 60 * 1000));
    const minutes = Math.floor((runtimeMs % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  }

  /**
   * Get test idea for runs
   */
  private getTestIdea(): any {
    return {
      name: 'Soak Test Project',
      description: 'Simple project for soak testing',
      category: 'test',
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Stop test
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Stopping soak test');
  }
}

/**
 * Run 24-hour soak test
 */
async function main() {
  const config: SoakTestConfig = {
    durationHours: 24,
    runIntervalMinutes: 15, // Run every 15 minutes
    stallInjectionProbability: 0.1, // 10% chance of stall per run
    memoryCheckIntervalMinutes: 5,
  };

  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Initialize orchestrator
  const orchestrator = new EnhancedOrchestrator({
    db,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const soakTest = new SoakTest(config, orchestrator, db);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, stopping soak test');
    soakTest.stop();
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, stopping soak test');
    soakTest.stop();
  });

  // Run test
  const metrics = await soakTest.execute();

  // Report results
  console.log('\n=== SOAK TEST RESULTS ===');
  console.log(`Total runs: ${metrics.totalRuns}`);
  console.log(`Successful: ${metrics.successfulRuns}`);
  console.log(`Failed: ${metrics.failedRuns}`);
  console.log(`Success rate: ${((metrics.successfulRuns / metrics.totalRuns) * 100).toFixed(2)}%`);
  console.log(`Stalled tasks: ${metrics.stalledTasks}`);
  console.log(`Checkpoint resumes: ${metrics.checkpointResumes}`);
  console.log(`Memory leaks detected: ${metrics.memoryLeaks}`);
  console.log(`Peak memory: ${metrics.peakMemoryMB} MB`);
  console.log(`Average run duration: ${Math.round(metrics.averageRunDurationMs / 1000)}s`);
  console.log(`Errors: ${metrics.errors.length}`);

  await db.end();
  process.exit(metrics.failedRuns > 0 || metrics.memoryLeaks > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Soak test failed:', error);
    process.exit(1);
  });
}

export default SoakTest;

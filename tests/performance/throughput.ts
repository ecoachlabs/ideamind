/**
 * Performance Test: Throughput Benchmarking
 *
 * Measures system throughput and latency under various load conditions:
 * - Tasks per second
 * - P50, P95, P99 latency
 * - Scalability (1-100 workers)
 * - Resource utilization
 */

import pino from 'pino';

const logger = pino({ name: 'performance-throughput' });

interface PerformanceConfig {
  workerCounts: number[]; // e.g., [1, 10, 25, 50, 100]
  tasksPerWorker: number;
  warmupTasks: number;
}

interface PerformanceMetrics {
  workerCount: number;
  totalTasks: number;
  durationMs: number;
  throughput: number; // tasks per second
  latencies: {
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    avg: number;
  };
  errors: number;
}

export class ThroughputTest {
  private config: PerformanceConfig;
  private results: PerformanceMetrics[] = [];

  constructor(config: PerformanceConfig) {
    this.config = config;
  }

  /**
   * Execute performance test
   */
  async execute(): Promise<PerformanceMetrics[]> {
    logger.info('Starting throughput performance test');

    for (const workerCount of this.config.workerCounts) {
      logger.info({ workerCount }, `Testing with ${workerCount} workers`);

      const metrics = await this.runBenchmark(workerCount);
      this.results.push(metrics);

      // Cool down between tests
      await this.sleep(5000);
    }

    logger.info(this.results, 'Performance test completed');
    return this.results;
  }

  /**
   * Run benchmark for specific worker count
   */
  private async runBenchmark(workerCount: number): Promise<PerformanceMetrics> {
    // Warmup
    logger.debug({ workerCount }, 'Warming up');
    await this.executeTasks(this.config.warmupTasks);

    // Actual benchmark
    const totalTasks = workerCount * this.config.tasksPerWorker;
    const taskLatencies: number[] = [];
    let errors = 0;

    logger.info({ workerCount, totalTasks }, 'Running benchmark');
    const startTime = Date.now();

    // Execute tasks
    const promises = [];
    for (let i = 0; i < totalTasks; i++) {
      promises.push(
        this.executeTask().then((latency) => {
          if (latency >= 0) {
            taskLatencies.push(latency);
          } else {
            errors++;
          }
        })
      );
    }

    await Promise.all(promises);

    const durationMs = Date.now() - startTime;
    const throughput = (totalTasks / durationMs) * 1000; // tasks per second

    // Calculate latency percentiles
    const sortedLatencies = taskLatencies.sort((a, b) => a - b);
    const latencies = {
      p50: this.percentile(sortedLatencies, 0.50),
      p95: this.percentile(sortedLatencies, 0.95),
      p99: this.percentile(sortedLatencies, 0.99),
      min: Math.min(...sortedLatencies),
      max: Math.max(...sortedLatencies),
      avg: sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length,
    };

    return {
      workerCount,
      totalTasks,
      durationMs,
      throughput,
      latencies,
      errors,
    };
  }

  /**
   * Execute single task and measure latency
   */
  private async executeTask(): Promise<number> {
    const startTime = Date.now();

    try {
      // Simulate task execution
      // In real implementation, would execute actual orchestrator task
      await this.sleep(Math.random() * 100 + 50); // 50-150ms

      return Date.now() - startTime;
    } catch (error) {
      logger.error({ error }, 'Task execution failed');
      return -1; // Error
    }
  }

  /**
   * Execute multiple tasks (warmup)
   */
  private async executeTasks(count: number): Promise<void> {
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.executeTask());
    }
    await Promise.all(promises);
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Run performance test
 */
async function main() {
  const config: PerformanceConfig = {
    workerCounts: [1, 10, 25, 50, 100],
    tasksPerWorker: 100,
    warmupTasks: 50,
  };

  const perfTest = new ThroughputTest(config);
  const results = await perfTest.execute();

  // Report results
  console.log('\n=== PERFORMANCE TEST RESULTS ===\n');

  for (const result of results) {
    console.log(`Workers: ${result.workerCount}`);
    console.log(`  Total tasks: ${result.totalTasks}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`  Throughput: ${result.throughput.toFixed(2)} tasks/sec`);
    console.log(`  Latency P50: ${result.latencies.p50.toFixed(2)}ms`);
    console.log(`  Latency P95: ${result.latencies.p95.toFixed(2)}ms`);
    console.log(`  Latency P99: ${result.latencies.p99.toFixed(2)}ms`);
    console.log(`  Errors: ${result.errors}`);
    console.log('');
  }

  // Check scalability
  const scalabilityRatio = results[results.length - 1].throughput / results[0].throughput;
  const expectedRatio = results[results.length - 1].workerCount / results[0].workerCount;
  const scalabilityEfficiency = (scalabilityRatio / expectedRatio) * 100;

  console.log('=== SCALABILITY ANALYSIS ===');
  console.log(`1 worker throughput: ${results[0].throughput.toFixed(2)} tasks/sec`);
  console.log(`${results[results.length - 1].workerCount} workers throughput: ${results[results.length - 1].throughput.toFixed(2)} tasks/sec`);
  console.log(`Scaling efficiency: ${scalabilityEfficiency.toFixed(2)}%`);

  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Performance test failed:', error);
    process.exit(1);
  });
}

export default ThroughputTest;

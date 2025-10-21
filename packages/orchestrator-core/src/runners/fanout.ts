import pino from 'pino';

const logger = pino({ name: 'fanout-runner' });

/**
 * Parallelism strategy
 */
export type ParallelismStrategy = 'sequential' | 'partial' | 'iterative' | number;

/**
 * Aggregation strategy
 */
export type AggregationStrategy = 'merge' | 'concat' | 'vote' | 'custom';

/**
 * Fan-out configuration
 */
export interface FanOutConfig {
  parallelism: ParallelismStrategy;
  agents: string[];
  aggregation_strategy: AggregationStrategy;
}

/**
 * Custom aggregation function
 */
export type CustomAggregator = (results: any[]) => any;

/**
 * Fan-Out/Fan-In Runner - Parallel agent execution with deterministic aggregation
 *
 * Features:
 * - Sequential execution (one by one)
 * - Partial parallel execution (N at a time)
 * - Full parallel execution (all at once)
 * - Iterative execution (loop pattern for Story Loop)
 * - Deterministic aggregation strategies
 *
 * Spec: phase.txt:56-61, 160, 172
 */
export class FanOutRunner {
  /**
   * Fan-out: run agents in parallel based on parallelism config
   *
   * @param config - Fan-out configuration
   * @param input - Input data for agents
   * @param executor - Function to execute a single agent
   * @returns Array of results from all agents
   */
  async fanOut<T>(
    config: FanOutConfig,
    input: any,
    executor: (agent: string, input: any) => Promise<T>
  ): Promise<T[]> {
    const { parallelism, agents } = config;

    logger.info(
      {
        parallelism,
        agentCount: agents.length,
      },
      'Starting fan-out execution'
    );

    if (parallelism === 'sequential') {
      return this.runSequential(agents, input, executor);
    } else if (typeof parallelism === 'number') {
      return this.runWithConcurrency(agents, input, executor, parallelism);
    } else if (parallelism === 'partial') {
      // Run some in parallel, some sequential (needs dependency graph)
      // For now, use half the agents as concurrency
      const concurrency = Math.ceil(agents.length / 2);
      return this.runWithConcurrency(agents, input, executor, concurrency);
    } else if (parallelism === 'iterative') {
      return this.runIterative(agents, input, executor);
    }

    // Default: all parallel
    return this.runAllParallel(agents, input, executor);
  }

  /**
   * Run agents sequentially (one by one)
   */
  private async runSequential<T>(
    agents: string[],
    input: any,
    executor: (agent: string, input: any) => Promise<T>
  ): Promise<T[]> {
    const results: T[] = [];

    logger.debug({ agentCount: agents.length }, 'Running agents sequentially');

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];

      logger.debug({ agent, index: i, total: agents.length }, 'Executing agent');

      const startTime = Date.now();
      const result = await executor(agent, input);
      const duration = Date.now() - startTime;

      logger.debug({ agent, durationMs: duration }, 'Agent execution complete');

      results.push(result);
    }

    logger.info({ resultCount: results.length }, 'Sequential execution complete');

    return results;
  }

  /**
   * Run all agents in parallel
   */
  private async runAllParallel<T>(
    agents: string[],
    input: any,
    executor: (agent: string, input: any) => Promise<T>
  ): Promise<T[]> {
    logger.debug({ agentCount: agents.length }, 'Running all agents in parallel');

    const startTime = Date.now();

    const results = await Promise.all(
      agents.map(async (agent, index) => {
        logger.debug({ agent, index }, 'Executing agent');

        const agentStartTime = Date.now();
        const result = await executor(agent, input);
        const duration = Date.now() - agentStartTime;

        logger.debug({ agent, durationMs: duration }, 'Agent execution complete');

        return result;
      })
    );

    const totalDuration = Date.now() - startTime;

    logger.info(
      {
        resultCount: results.length,
        totalDurationMs: totalDuration,
      },
      'Parallel execution complete'
    );

    return results;
  }

  /**
   * Run agents with controlled concurrency (N at a time)
   */
  private async runWithConcurrency<T>(
    agents: string[],
    input: any,
    executor: (agent: string, input: any) => Promise<T>,
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];

    logger.debug(
      {
        agentCount: agents.length,
        concurrency,
        batches: Math.ceil(agents.length / concurrency),
      },
      'Running agents with concurrency control'
    );

    for (let i = 0; i < agents.length; i += concurrency) {
      const batch = agents.slice(i, i + concurrency);

      logger.debug(
        {
          batchIndex: Math.floor(i / concurrency),
          batchSize: batch.length,
        },
        'Executing batch'
      );

      const batchResults = await Promise.all(
        batch.map(async (agent) => {
          const startTime = Date.now();
          const result = await executor(agent, input);
          const duration = Date.now() - startTime;

          logger.debug({ agent, durationMs: duration }, 'Agent execution complete');

          return result;
        })
      );

      results.push(...batchResults);
    }

    logger.info({ resultCount: results.length }, 'Concurrent execution complete');

    return results;
  }

  /**
   * Run agents iteratively (loop pattern for Story Loop)
   *
   * Continues until all agents signal done or max iterations reached
   */
  private async runIterative<T>(
    agents: string[],
    input: any,
    executor: (agent: string, input: any) => Promise<T>
  ): Promise<T[]> {
    const results: T[] = [];
    let iteration = 0;
    const maxIterations = 100; // Safety limit
    let continueLoop = true;

    logger.info(
      {
        agentCount: agents.length,
        maxIterations,
      },
      'Starting iterative execution'
    );

    while (continueLoop && iteration < maxIterations) {
      logger.debug({ iteration }, 'Starting iteration');

      for (const agent of agents) {
        const iterationInput = { ...input, iteration };

        logger.debug({ agent, iteration }, 'Executing agent in iteration');

        const result = await executor(agent, iterationInput);
        results.push(result);

        // Check if agent signals completion
        if (result && typeof result === 'object' && (result as any).done) {
          logger.info(
            { agent, iteration },
            'Agent signaled completion, stopping loop'
          );
          continueLoop = false;
          break;
        }
      }

      iteration++;
    }

    if (iteration >= maxIterations) {
      logger.warn(
        { maxIterations },
        'Iterative execution reached max iterations'
      );
    }

    logger.info(
      {
        iterations: iteration,
        resultCount: results.length,
      },
      'Iterative execution complete'
    );

    return results;
  }

  /**
   * Fan-in: deterministic aggregation of results
   *
   * Spec: phase.txt:59 (schema-constrained, deterministic)
   *
   * @param results - Results from agents
   * @param strategy - Aggregation strategy
   * @param customAggregator - Custom aggregation function (for 'custom' strategy)
   * @returns Aggregated result
   */
  async fanIn<T>(
    results: T[],
    strategy: AggregationStrategy,
    customAggregator?: CustomAggregator
  ): Promise<any> {
    logger.info(
      {
        strategy,
        resultCount: results.length,
      },
      'Starting fan-in aggregation'
    );

    if (strategy === 'merge') {
      return this.mergeResults(results);
    } else if (strategy === 'concat') {
      return this.concatResults(results);
    } else if (strategy === 'vote') {
      return this.voteResults(results);
    } else if (strategy === 'custom' && customAggregator) {
      return customAggregator(results);
    }

    // Default: return all results
    logger.debug('Using default aggregation (all results)');
    return results;
  }

  /**
   * Merge results (for object results)
   *
   * Strategy: Latest wins for conflicts, deterministic key ordering
   */
  private mergeResults(results: any[]): any {
    const merged: any = {};

    logger.debug({ resultCount: results.length }, 'Merging results');

    for (const result of results) {
      if (typeof result !== 'object' || result === null) {
        continue;
      }

      for (const [key, value] of Object.entries(result)) {
        merged[key] = value; // Latest wins
      }
    }

    // Ensure deterministic JSON (sort keys)
    const sortedMerged = this.sortKeys(merged);

    logger.debug(
      {
        keyCount: Object.keys(sortedMerged).length,
      },
      'Merge complete'
    );

    return sortedMerged;
  }

  /**
   * Concatenate results (for array results)
   */
  private concatResults(results: any[]): any[] {
    logger.debug({ resultCount: results.length }, 'Concatenating results');

    // Flatten all results
    const concatenated = results.flat();

    logger.debug(
      {
        originalCount: results.length,
        concatenatedCount: concatenated.length,
      },
      'Concatenation complete'
    );

    return concatenated;
  }

  /**
   * Vote on results (consensus)
   *
   * Returns most common result
   */
  private voteResults(results: any[]): any {
    logger.debug({ resultCount: results.length }, 'Voting on results');

    const votes: Map<string, { count: number; value: any }> = new Map();

    for (const result of results) {
      const key = JSON.stringify(this.sortKeys(result));

      if (votes.has(key)) {
        votes.get(key)!.count++;
      } else {
        votes.set(key, { count: 1, value: result });
      }
    }

    // Find max votes
    let maxVotes = 0;
    let winner: any = results[0];

    for (const { count, value } of votes.values()) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = value;
      }
    }

    logger.debug(
      {
        totalVotes: results.length,
        maxVotes,
        uniqueResults: votes.size,
      },
      'Vote complete'
    );

    return winner;
  }

  /**
   * Sort object keys recursively for deterministic JSON
   */
  private sortKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortKeys(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const sorted: any = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = this.sortKeys(obj[key]);
      }
      return sorted;
    }
    return obj;
  }

  /**
   * Execute fan-out/fan-in in one call
   *
   * Convenience method that combines fan-out and fan-in
   */
  async execute<T>(
    config: FanOutConfig,
    input: any,
    executor: (agent: string, input: any) => Promise<T>,
    customAggregator?: CustomAggregator
  ): Promise<any> {
    logger.info(
      {
        agents: config.agents.length,
        parallelism: config.parallelism,
        aggregation: config.aggregation_strategy,
      },
      'Starting fan-out/fan-in execution'
    );

    const startTime = Date.now();

    // Fan-out
    const results = await this.fanOut(config, input, executor);

    // Fan-in
    const aggregated = await this.fanIn(
      results,
      config.aggregation_strategy,
      customAggregator
    );

    const totalDuration = Date.now() - startTime;

    logger.info(
      {
        agentCount: config.agents.length,
        resultCount: results.length,
        durationMs: totalDuration,
      },
      'Fan-out/fan-in execution complete'
    );

    return aggregated;
  }
}

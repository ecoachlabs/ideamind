import pino from 'pino';

const logger = pino({ name: 'dag-executor' });

/**
 * Phase configuration with dependencies
 */
export interface PhaseConfig {
  phaseId: string;
  dependencies?: string[]; // List of phase IDs that must complete first
  [key: string]: any;
}

/**
 * DAG Executor - Execute phases in topological order with parallelism
 *
 * Features:
 * - Build dependency graph from phase configs
 * - Topological sort to find execution levels
 * - Parallel execution of independent phases
 * - Sequential execution of dependent phases
 *
 * Spec: orchestrator.txt:20 (phase connectivity, dependency DAG)
 */
export class DAGExecutor {
  /**
   * Build dependency graph from phases
   */
  private buildGraph(phases: PhaseConfig[]): Map<string, PhaseConfig> {
    const graph = new Map<string, PhaseConfig>();

    for (const phase of phases) {
      graph.set(phase.phaseId, phase);
    }

    logger.debug({ phaseCount: phases.length }, 'Dependency graph built');

    return graph;
  }

  /**
   * Topological sort to get execution levels
   *
   * Returns array of arrays where each inner array contains phases
   * that can run in parallel (same level)
   *
   * Example output:
   * [
   *   ['intake'],
   *   ['ideation'],
   *   ['critique'],
   *   ['prd'],
   *   ['bizdev'],
   *   ['architecture'],
   *   ['build'],
   *   ['security', 'story-loop'],  // PARALLEL!
   *   ['qa'],
   *   ['aesthetic'],
   *   ['release'],
   *   ['beta']
   * ]
   */
  private topologicalSort(phases: PhaseConfig[]): string[][] {
    const graph = this.buildGraph(phases);
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const phase of phases) {
      inDegree.set(phase.phaseId, 0);
      adjList.set(phase.phaseId, []);
    }

    // Build adjacency list and in-degrees
    for (const phase of phases) {
      const dependencies = phase.dependencies || [];
      for (const dep of dependencies) {
        // dep -> phase (edge from dependency to phase)
        adjList.get(dep)!.push(phase.phaseId);
        inDegree.set(phase.phaseId, (inDegree.get(phase.phaseId) || 0) + 1);
      }
    }

    // BFS to find levels (phases that can run in parallel)
    const levels: string[][] = [];
    const queue: string[] = [];

    // Start with phases that have no dependencies
    for (const [phaseId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(phaseId);
      }
    }

    while (queue.length > 0) {
      const levelSize = queue.length;
      const currentLevel: string[] = [];

      // Process all phases at this level
      for (let i = 0; i < levelSize; i++) {
        const phaseId = queue.shift()!;
        currentLevel.push(phaseId);

        // Reduce in-degree for dependent phases
        for (const dependent of adjList.get(phaseId) || []) {
          const newDegree = (inDegree.get(dependent) || 0) - 1;
          inDegree.set(dependent, newDegree);

          if (newDegree === 0) {
            queue.push(dependent);
          }
        }
      }

      levels.push(currentLevel);
    }

    // Check for cycles
    const sortedPhaseCount = levels.flat().length;
    if (sortedPhaseCount !== phases.length) {
      const missing = phases.filter(
        (p) => !levels.flat().includes(p.phaseId)
      );
      logger.error({ missing }, 'Cycle detected in phase dependencies');
      throw new Error(
        `Cycle detected in phase dependencies. Missing phases: ${missing.map((p) => p.phaseId).join(', ')}`
      );
    }

    logger.info(
      {
        totalPhases: phases.length,
        levels: levels.length,
        parallelLevels: levels.filter((l) => l.length > 1).length,
        executionPlan: levels,
      },
      'Topological sort complete'
    );

    return levels;
  }

  /**
   * Execute phases in DAG order
   *
   * Phases in same level run in parallel
   * Levels execute sequentially
   *
   * @param phases - Phase configurations with dependencies
   * @param executor - Function to execute a single phase
   * @returns Results from all phases
   */
  async execute<T>(
    phases: PhaseConfig[],
    executor: (phase: PhaseConfig) => Promise<T>
  ): Promise<Map<string, T>> {
    const levels = this.topologicalSort(phases);
    const results = new Map<string, T>();

    logger.info(
      {
        totalPhases: phases.length,
        levels: levels.length,
        executionPlan: levels,
      },
      'Starting DAG execution'
    );

    // Execute each level sequentially
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];

      logger.info(
        {
          levelIndex: i,
          levelSize: level.length,
          phases: level,
          isParallel: level.length > 1,
        },
        'Executing level'
      );

      // Execute all phases in this level in parallel
      const levelResults = await Promise.all(
        level.map(async (phaseId) => {
          const phase = phases.find((p) => p.phaseId === phaseId)!;

          logger.info({ phaseId }, 'Starting phase execution');

          const startTime = Date.now();
          const result = await executor(phase);
          const duration = Date.now() - startTime;

          logger.info(
            { phaseId, durationMs: duration },
            'Phase execution complete'
          );

          return { phaseId, result };
        })
      );

      // Store results
      for (const { phaseId, result } of levelResults) {
        results.set(phaseId, result);
      }

      logger.info(
        {
          levelIndex: i,
          completedPhases: level,
          totalCompleted: results.size,
        },
        'Level execution complete'
      );
    }

    logger.info(
      {
        totalPhases: phases.length,
        completedPhases: results.size,
      },
      'DAG execution complete'
    );

    return results;
  }

  /**
   * Validate phase dependencies
   *
   * Checks for:
   * - Non-existent dependencies
   * - Cycles
   * - Self-dependencies
   *
   * @param phases - Phase configurations
   * @returns Validation result with issues
   */
  validate(phases: PhaseConfig[]): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const phaseIds = new Set(phases.map((p) => p.phaseId));

    // Check for non-existent dependencies
    for (const phase of phases) {
      const dependencies = phase.dependencies || [];
      for (const dep of dependencies) {
        if (!phaseIds.has(dep)) {
          issues.push(
            `Phase "${phase.phaseId}" depends on non-existent phase "${dep}"`
          );
        }
      }

      // Check for self-dependencies
      if (dependencies.includes(phase.phaseId)) {
        issues.push(
          `Phase "${phase.phaseId}" has self-dependency`
        );
      }
    }

    // Check for cycles
    try {
      this.topologicalSort(phases);
    } catch (error) {
      issues.push(`Cycle detected: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get execution order (flattened)
   *
   * @param phases - Phase configurations
   * @returns Array of phase IDs in execution order
   */
  getExecutionOrder(phases: PhaseConfig[]): string[] {
    const levels = this.topologicalSort(phases);
    return levels.flat();
  }

  /**
   * Get parallel groups
   *
   * Returns only the levels that have multiple phases (can run in parallel)
   *
   * @param phases - Phase configurations
   * @returns Array of parallel groups
   */
  getParallelGroups(phases: PhaseConfig[]): string[][] {
    const levels = this.topologicalSort(phases);
    return levels.filter((level) => level.length > 1);
  }

  /**
   * Estimate total duration (critical path)
   *
   * Assumes each phase takes the same duration
   *
   * @param phases - Phase configurations
   * @param avgPhaseDuration - Average phase duration in ms
   * @returns Estimated total duration in ms
   */
  estimateDuration(
    phases: PhaseConfig[],
    avgPhaseDuration: number
  ): number {
    const levels = this.topologicalSort(phases);

    // Each level takes avgPhaseDuration (parallel phases run concurrently)
    const totalDuration = levels.length * avgPhaseDuration;

    logger.debug(
      {
        levels: levels.length,
        avgPhaseDuration,
        totalDuration,
        parallelismSavings:
          (phases.length - levels.length) * avgPhaseDuration,
      },
      'Duration estimated'
    );

    return totalDuration;
  }

  /**
   * Get critical path
   *
   * Returns the longest path through the DAG
   *
   * @param phases - Phase configurations
   * @returns Array of phase IDs in critical path
   */
  getCriticalPath(phases: PhaseConfig[]): string[] {
    const graph = this.buildGraph(phases);
    const depths = new Map<string, number>();

    // Calculate depth for each phase (longest path from start)
    const calculateDepth = (phaseId: string, visited: Set<string>): number => {
      if (depths.has(phaseId)) {
        return depths.get(phaseId)!;
      }

      if (visited.has(phaseId)) {
        throw new Error(`Cycle detected at phase ${phaseId}`);
      }

      visited.add(phaseId);

      const phase = graph.get(phaseId)!;
      const dependencies = phase.dependencies || [];

      if (dependencies.length === 0) {
        depths.set(phaseId, 1);
        return 1;
      }

      const maxDepth = Math.max(
        ...dependencies.map((dep) =>
          calculateDepth(dep, new Set(visited))
        )
      );

      const depth = maxDepth + 1;
      depths.set(phaseId, depth);
      return depth;
    };

    // Calculate depths for all phases
    for (const phase of phases) {
      calculateDepth(phase.phaseId, new Set());
    }

    // Find maximum depth
    const maxDepth = Math.max(...depths.values());

    // Find all phases at maximum depth (end of critical path)
    const endPhases = Array.from(depths.entries())
      .filter(([_, depth]) => depth === maxDepth)
      .map(([phaseId, _]) => phaseId);

    // Trace back from end phase to find critical path
    // For simplicity, just return the first end phase's path
    const criticalPath: string[] = [];
    let currentPhaseId = endPhases[0];

    while (currentPhaseId) {
      criticalPath.unshift(currentPhaseId);

      const phase = graph.get(currentPhaseId)!;
      const dependencies = phase.dependencies || [];

      if (dependencies.length === 0) {
        break;
      }

      // Find dependency with maximum depth
      const nextPhase = dependencies.reduce((max, dep) => {
        const depDepth = depths.get(dep) || 0;
        const maxDepth = depths.get(max) || 0;
        return depDepth > maxDepth ? dep : max;
      });

      currentPhaseId = nextPhase;
    }

    logger.debug(
      {
        criticalPath,
        length: criticalPath.length,
        maxDepth,
      },
      'Critical path calculated'
    );

    return criticalPath;
  }
}

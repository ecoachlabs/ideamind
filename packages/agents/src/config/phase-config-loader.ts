/**
 * Phase Config Loader - Loads phase YAML configs and derives Phase Plans
 * Spec: phase.txt:273-280, 357-456, UNIFIED_IMPLEMENTATION_SPEC.md Section 1.5
 *
 * Loads YAML configurations from config/ directory, caches them in memory,
 * and derives PhasePlan objects for runtime execution.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { PhasePlan } from '@ideamine/schemas/orchestrator';
import * as crypto from 'crypto';

/**
 * Phase Configuration (parsed from YAML)
 */
export interface PhaseConfig {
  phase: string;
  parallelism: 'sequential' | 'partial' | 'iterative' | number;
  agents: string[];
  budgets: {
    tokens: number;
    tools_minutes: number;
    gpu_hours?: number;
  };
  rubrics: Record<string, any>;
  allowlisted_tools: string[];
  heartbeat_seconds: number;
  stall_threshold_heartbeats: number;
  refinery: {
    fission_min_coverage: number;
    fusion_min_consensus: number;
  };
  timebox: string;
  loop?: {
    max_iterations: number;
    completion_condition: string;
    iteration_timeout: string;
  };
}

/**
 * Cached config entry with timestamp
 */
interface CachedConfig {
  config: PhaseConfig;
  loadedAt: number;
}

/**
 * ConfigLoader - Singleton class for loading phase configs
 */
export class PhaseConfigLoader {
  private static instance: PhaseConfigLoader;
  private configCache: Map<string, CachedConfig> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes cache TTL
  private readonly configDir: string;

  private constructor() {
    // Config directory is at project root
    this.configDir = path.join(process.cwd(), 'config');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PhaseConfigLoader {
    if (!PhaseConfigLoader.instance) {
      PhaseConfigLoader.instance = new PhaseConfigLoader();
    }
    return PhaseConfigLoader.instance;
  }

  /**
   * Load phase configuration from YAML file
   *
   * @param phaseId - Phase identifier (e.g., 'intake', 'security', 'story-loop')
   * @returns PhaseConfig object
   */
  async loadPhaseConfig(phaseId: string): Promise<PhaseConfig> {
    // Check cache
    const cached = this.configCache.get(phaseId);
    if (cached && (Date.now() - cached.loadedAt < this.TTL)) {
      return cached.config;
    }

    // Load from YAML
    const configPath = path.join(this.configDir, `${phaseId}.yaml`);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.parse(content) as PhaseConfig;

      // Validate config structure
      this.validateConfig(config, phaseId);

      // Cache
      this.configCache.set(phaseId, {
        config,
        loadedAt: Date.now()
      });

      return config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `Phase config not found: ${configPath}. ` +
          `Expected file: config/${phaseId}.yaml`
        );
      }
      throw new Error(
        `Failed to load config for phase ${phaseId}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Derive PhasePlan from PhaseConfig
   * Adds runtime hash for deterministic replay
   *
   * @param phaseId - Phase identifier
   * @param runContext - Optional runtime context for conditional planning
   * @returns PhasePlan for execution
   */
  async derivePhasePlan(
    phaseId: string,
    runContext?: Record<string, any>
  ): Promise<PhasePlan> {
    const config = await this.loadPhaseConfig(phaseId);

    // Calculate deterministic hash for replay
    const hash = this.calculatePlanHash(config);

    // Extract tools and guards from allowlisted_tools
    const tools = config.allowlisted_tools.filter(t => t.startsWith('tool.'));
    const guards = config.allowlisted_tools.filter(t => t.startsWith('guard.'));

    return {
      phase: config.phase,
      parallelism: config.parallelism,
      agents: config.agents,
      tools,
      guards,
      rubrics: config.rubrics,
      budgets: {
        tokens: config.budgets.tokens,
        tools_minutes: config.budgets.tools_minutes
      },
      timebox: config.timebox,
      refinery_config: {
        fission_min_coverage: config.refinery.fission_min_coverage,
        fusion_min_consensus: config.refinery.fusion_min_consensus
      },
      hash,
      version: '1.0.0'
    };
  }

  /**
   * Calculate deterministic hash for Phase Plan
   * Hash is SHA256(agents + rubrics + budgets + version)
   * Used for deterministic replay and change detection
   */
  private calculatePlanHash(config: PhaseConfig): string {
    const payload = {
      agents: config.agents.sort(), // Sort for determinism
      rubrics: this.sortObjectKeys(config.rubrics),
      budgets: config.budgets,
      version: '1.0.0'
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    return hash;
  }

  /**
   * Sort object keys recursively for deterministic JSON
   */
  private sortObjectKeys(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const sorted: any = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = this.sortObjectKeys(obj[key]);
      }
      return sorted;
    }
    return obj;
  }

  /**
   * Validate config structure
   */
  private validateConfig(config: PhaseConfig, phaseId: string): void {
    // Required fields
    const required = [
      'phase',
      'parallelism',
      'agents',
      'budgets',
      'rubrics',
      'allowlisted_tools',
      'heartbeat_seconds',
      'stall_threshold_heartbeats',
      'refinery',
      'timebox'
    ];

    for (const field of required) {
      if (!(field in config)) {
        throw new Error(
          `Invalid config for phase ${phaseId}: missing required field '${field}'`
        );
      }
    }

    // Validate budgets
    if (!config.budgets.tokens || config.budgets.tokens <= 0) {
      throw new Error(
        `Invalid config for phase ${phaseId}: budgets.tokens must be > 0`
      );
    }

    if (!config.budgets.tools_minutes || config.budgets.tools_minutes <= 0) {
      throw new Error(
        `Invalid config for phase ${phaseId}: budgets.tools_minutes must be > 0`
      );
    }

    // Validate agents array
    if (!Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error(
        `Invalid config for phase ${phaseId}: agents must be non-empty array`
      );
    }

    // Validate timebox format (ISO8601)
    const timeboxRegex = /^PT\d+H(\d+M)?(\d+S)?$/;
    if (!timeboxRegex.test(config.timebox)) {
      throw new Error(
        `Invalid config for phase ${phaseId}: timebox must be ISO8601 duration (e.g., PT2H, PT1H30M)`
      );
    }

    // Validate parallelism
    const validParallelism = ['sequential', 'partial', 'iterative'];
    if (
      typeof config.parallelism !== 'number' &&
      !validParallelism.includes(config.parallelism as string)
    ) {
      throw new Error(
        `Invalid config for phase ${phaseId}: parallelism must be number or one of: ${validParallelism.join(', ')}`
      );
    }
  }

  /**
   * Clear config cache (useful for testing)
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * Preload all phase configs (optional optimization)
   */
  async preloadAll(): Promise<void> {
    const phases = [
      'intake',
      'ideation',
      'critique',
      'prd',
      'bizdev',
      'architecture',
      'build',
      'security',
      'story-loop',
      'qa',
      'aesthetic',
      'release',
      'beta'
    ];

    await Promise.all(phases.map(phase => this.loadPhaseConfig(phase)));
  }
}

/**
 * Convenience function for loading phase config (singleton access)
 */
export async function loadPhaseConfig(phaseId: string): Promise<PhaseConfig> {
  return PhaseConfigLoader.getInstance().loadPhaseConfig(phaseId);
}

/**
 * Convenience function for deriving phase plan (singleton access)
 */
export async function derivePhasePlan(
  phaseId: string,
  runContext?: Record<string, any>
): Promise<PhasePlan> {
  return PhaseConfigLoader.getInstance().derivePhasePlan(phaseId, runContext);
}

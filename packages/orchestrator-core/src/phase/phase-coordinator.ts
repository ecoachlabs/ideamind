import pino from 'pino';
import { EventEmitter } from 'events';
import { BudgetTracker } from '../budget/budget-tracker';
import { QAVCoordinator } from '../autonomy/qav/qav-coordinator';
import { ClarificationLoop } from '../autonomy/clarification/clarification-loop';
import {
  PhaseContext,
  TaskSpec,
  EvidencePack,
  PhaseStartedEvent,
  PhaseProgressEvent,
  PhaseReadyEvent,
  PhaseGatePassedEvent,
  PhaseGateFailedEvent,
  PhaseCompletedEvent,
} from '@ideamine/schemas';

const logger = pino({ name: 'phase-coordinator' });

/**
 * Phase configuration
 */
export interface PhaseConfig {
  phase: string;
  parallelism: 'sequential' | 'parallel' | 'partial' | 'iterative';
  aggregation_strategy: 'merge' | 'concat' | 'vote' | 'custom';
  agents: string[];
  budgets: {
    tokens: number;
    tools_minutes: number;
    wallclock_minutes: number;
  };
  guards: Array<{
    type: string;
    config?: Record<string, any>;
  }>;
  gate: {
    pass_threshold: number;
    auto_fix_enabled: boolean;
    max_attempts: number;
    rubrics: Array<{
      name: string;
      weight: number;
      criteria: string;
    }>;
  };
  qav?: {
    enabled: boolean;
    max_questions: number;
    min_grounding_score: number;
  };
  artifacts: string[];
  dependencies: string[];
  checkpoint?: {
    enabled: boolean;
    interval_tasks: number;
  };
  retry?: {
    max_attempts: number;
    strategy: 'exponential' | 'linear' | 'constant';
    base_delay_ms: number;
  };
}

/**
 * Phase execution result
 */
export interface PhaseResult {
  phase: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
  artifacts: Array<{
    id: string;
    type: string;
    content?: any;
    path?: string;
  }>;
  gate_score: number;
  attempts: number;
  usage: {
    tokens: number;
    tools_minutes: number;
    wallclock_ms: number;
    cost_usd: number;
  };
  errors?: Array<{
    message: string;
    timestamp: string;
  }>;
  duration_ms: number;
}

/**
 * Phase Coordinator
 *
 * Coordinates phase execution with guards, gates, Q/A/V, and budget tracking
 * Spec: phase.txt:1-50
 */
export class PhaseCoordinator extends EventEmitter {
  constructor(
    private db: any,
    private budgetTracker: BudgetTracker,
    private qavCoordinator: QAVCoordinator,
    private clarificationLoop: ClarificationLoop
  ) {
    super();
  }

  /**
   * Execute a phase
   *
   * @param runId - Run identifier
   * @param config - Phase configuration
   * @param context - Phase context
   * @returns Phase result
   */
  async executePhase(
    runId: string,
    config: PhaseConfig,
    context: PhaseContext
  ): Promise<PhaseResult> {
    const startTime = Date.now();
    const scope = `${runId}:${config.phase}`;

    logger.info(
      {
        runId,
        phase: config.phase,
        agents: config.agents,
      },
      'Starting phase execution'
    );

    // Set budget
    this.budgetTracker.setBudget(scope, config.budgets);
    this.budgetTracker.startTracking(scope);

    // Emit phase.started event
    const startedEvent: PhaseStartedEvent = {
      event: 'phase.started',
      timestamp: new Date().toISOString(),
      runId,
      phase: config.phase,
      budgets: config.budgets,
      agents: config.agents,
      parallelism: config.parallelism,
    };
    this.emit('phase.started', startedEvent);

    try {
      // Run clarification if Q/A/V enabled
      let currentKmap = context.kmap || {};
      if (config.qav?.enabled) {
        logger.info({ runId, phase: config.phase }, 'Running clarification loop');

        const clarificationResult = await this.clarificationLoop.run(
          config.phase,
          runId,
          context.inputs,
          currentKmap,
          context.artifacts || [],
          {
            enabled: true,
            max_questions: config.qav.max_questions,
            min_grounding_score: config.qav.min_grounding_score,
            allow_inference: true,
            require_human_approval: false,
          }
        );

        if (clarificationResult.success) {
          currentKmap = clarificationResult.kmap_updates;
          context.kmap = currentKmap;
        } else if (clarificationResult.requires_human) {
          logger.warn(
            { runId, phase: config.phase },
            'Clarification requires human input'
          );
          // In production, this would pause for human input
        }
      }

      // Execute agents (simplified - would use agent registry)
      const artifacts = await this.executeAgents(
        runId,
        config,
        context,
        scope
      );

      // Emit phase.progress periodically
      const progressEvent: PhaseProgressEvent = {
        event: 'phase.progress',
        timestamp: new Date().toISOString(),
        runId,
        phase: config.phase,
        progress: {
          completed_tasks: artifacts.length,
          total_tasks: config.agents.length,
          percent: (artifacts.length / config.agents.length) * 100,
        },
        usage: this.budgetTracker.getUsage(scope) || {
          tokens: 0,
          tools_minutes: 0,
          wallclock_ms: 0,
        },
        artifacts_produced: artifacts.map((a) => a.id),
      };
      this.emit('phase.progress', progressEvent);

      // Stop tracking before gate evaluation
      this.budgetTracker.stopTracking(scope);
      const usage = this.budgetTracker.getUsage(scope)!;

      // Emit phase.ready
      const readyEvent: PhaseReadyEvent = {
        event: 'phase.ready',
        timestamp: new Date().toISOString(),
        runId,
        phase: config.phase,
        artifacts: artifacts.map((a) => ({
          id: a.id,
          type: a.type,
          path: a.path,
        })),
        usage: {
          tokens: usage.tokens,
          tools_minutes: usage.tools_minutes,
          wallclock_ms: usage.wallclock_ms,
          cost_usd: this.budgetTracker.calculateCost(usage),
        },
      };
      this.emit('phase.ready', readyEvent);

      // Run guards
      const guardReports = await this.runGuards(config, artifacts);

      // Evaluate gate
      const gateResult = await this.evaluateGate(
        config,
        artifacts,
        guardReports
      );

      const duration = Date.now() - startTime;

      if (gateResult.passed) {
        // Gate passed
        const gatePassedEvent: PhaseGatePassedEvent = {
          event: 'phase.gate.passed',
          timestamp: new Date().toISOString(),
          runId,
          phase: config.phase,
          gate_score: gateResult.score,
          pass_threshold: config.gate.pass_threshold,
          guard_reports: guardReports,
        };
        this.emit('phase.gate.passed', gatePassedEvent);

        const completedEvent: PhaseCompletedEvent = {
          event: 'phase.completed',
          timestamp: new Date().toISOString(),
          runId,
          phase: config.phase,
          status: 'success',
          duration_ms: duration,
          usage: {
            tokens: usage.tokens,
            tools_minutes: usage.tools_minutes,
            wallclock_ms: usage.wallclock_ms,
            cost_usd: this.budgetTracker.calculateCost(usage),
          },
          artifacts: artifacts.map((a) => ({
            id: a.id,
            type: a.type,
            path: a.path,
          })),
          gate_score: gateResult.score,
          attempts: 1,
        };
        this.emit('phase.completed', completedEvent);

        return {
          phase: config.phase,
          status: 'success',
          artifacts,
          gate_score: gateResult.score,
          attempts: 1,
          usage: {
            tokens: usage.tokens,
            tools_minutes: usage.tools_minutes,
            wallclock_ms: usage.wallclock_ms,
            cost_usd: this.budgetTracker.calculateCost(usage),
          },
          duration_ms: duration,
        };
      } else {
        // Gate failed
        const gateFailedEvent: PhaseGateFailedEvent = {
          event: 'phase.gate.failed',
          timestamp: new Date().toISOString(),
          runId,
          phase: config.phase,
          gate_score: gateResult.score,
          pass_threshold: config.gate.pass_threshold,
          guard_reports: guardReports,
          failure_reasons: gateResult.failures.map((f) => ({
            category: 'quality',
            description: f,
          })),
          attempt_number: 1,
          max_attempts: config.gate.max_attempts,
          auto_fix_strategy: config.gate.auto_fix_enabled
            ? 'rerun-qav'
            : 'manual-intervention',
        };
        this.emit('phase.gate.failed', gateFailedEvent);

        const completedEvent: PhaseCompletedEvent = {
          event: 'phase.completed',
          timestamp: new Date().toISOString(),
          runId,
          phase: config.phase,
          status: 'failed',
          duration_ms: duration,
          usage: {
            tokens: usage.tokens,
            tools_minutes: usage.tools_minutes,
            wallclock_ms: usage.wallclock_ms,
            cost_usd: this.budgetTracker.calculateCost(usage),
          },
          gate_score: gateResult.score,
          attempts: 1,
          errors: gateResult.failures.map((f) => ({
            message: f,
            timestamp: new Date().toISOString(),
          })),
        };
        this.emit('phase.completed', completedEvent);

        return {
          phase: config.phase,
          status: 'failed',
          artifacts,
          gate_score: gateResult.score,
          attempts: 1,
          usage: {
            tokens: usage.tokens,
            tools_minutes: usage.tools_minutes,
            wallclock_ms: usage.wallclock_ms,
            cost_usd: this.budgetTracker.calculateCost(usage),
          },
          errors: gateResult.failures.map((f) => ({
            message: f,
            timestamp: new Date().toISOString(),
          })),
          duration_ms: duration,
        };
      }
    } catch (error: any) {
      this.budgetTracker.stopTracking(scope);
      const usage = this.budgetTracker.getUsage(scope) || {
        tokens: 0,
        tools_minutes: 0,
        wallclock_ms: 0,
      };
      const duration = Date.now() - startTime;

      logger.error(
        {
          error,
          runId,
          phase: config.phase,
        },
        'Phase execution failed'
      );

      const completedEvent: PhaseCompletedEvent = {
        event: 'phase.completed',
        timestamp: new Date().toISOString(),
        runId,
        phase: config.phase,
        status: 'failed',
        duration_ms: duration,
        usage: {
          tokens: usage.tokens,
          tools_minutes: usage.tools_minutes,
          wallclock_ms: usage.wallclock_ms,
          cost_usd: this.budgetTracker.calculateCost(usage),
        },
        errors: [
          {
            message: error.message,
            timestamp: new Date().toISOString(),
          },
        ],
      };
      this.emit('phase.completed', completedEvent);

      throw error;
    }
  }

  /**
   * Execute agents (simplified implementation)
   */
  private async executeAgents(
    runId: string,
    config: PhaseConfig,
    context: PhaseContext,
    scope: string
  ): Promise<
    Array<{
      id: string;
      type: string;
      content?: any;
      path?: string;
    }>
  > {
    // Simplified - in production would use agent registry and fanout runner
    const artifacts: Array<{
      id: string;
      type: string;
      content?: any;
      path?: string;
    }> = [];

    for (const agent of config.agents) {
      logger.info({ runId, phase: config.phase, agent }, 'Executing agent');

      // Simulate agent execution
      const artifact = {
        id: `artifact-${Date.now()}-${agent}`,
        type: agent.replace('Agent', ''),
        content: {
          agent,
          phase: config.phase,
          timestamp: new Date().toISOString(),
        },
      };

      artifacts.push(artifact);

      // Simulate token usage
      this.budgetTracker.recordTokens(scope, Math.floor(Math.random() * 10000));
    }

    return artifacts;
  }

  /**
   * Run guards on artifacts
   */
  private async runGuards(
    config: PhaseConfig,
    artifacts: any[]
  ): Promise<
    Array<{
      type: string;
      pass: boolean;
      score: number;
      reasons?: string[];
      severity?: 'low' | 'medium' | 'high' | 'critical';
      timestamp: string;
    }>
  > {
    const reports = [];

    for (const guard of config.guards) {
      logger.debug({ guard: guard.type }, 'Running guard');

      // Simplified guard execution
      const pass = Math.random() > 0.2; // 80% pass rate for demo
      const score = pass ? Math.random() * 0.3 + 0.7 : Math.random() * 0.5;

      reports.push({
        type: guard.type,
        pass,
        score,
        reasons: pass ? [] : [`${guard.type} check failed`],
        severity: pass ? undefined : ('medium' as const),
        timestamp: new Date().toISOString(),
      });
    }

    return reports;
  }

  /**
   * Evaluate quality gate
   */
  private async evaluateGate(
    config: PhaseConfig,
    artifacts: any[],
    guardReports: any[]
  ): Promise<{
    passed: boolean;
    score: number;
    failures: string[];
  }> {
    // Calculate weighted score from guards
    const scores = guardReports.map((r) => r.score);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

    // Apply rubrics (simplified)
    const rubricScores = config.gate.rubrics.map((rubric) => {
      // Simplified rubric evaluation
      return Math.random() * 0.4 + 0.6; // 0.6-1.0
    });

    const rubricAvg =
      rubricScores.reduce((sum, s) => sum + s, 0) / rubricScores.length;

    // Combined score
    const finalScore = avgScore * 0.6 + rubricAvg * 0.4;

    const passed = finalScore >= config.gate.pass_threshold;

    const failures: string[] = [];
    if (!passed) {
      guardReports.forEach((r) => {
        if (!r.pass) {
          failures.push(...(r.reasons || []));
        }
      });
      if (failures.length === 0) {
        failures.push(
          `Overall score ${finalScore.toFixed(2)} below threshold ${config.gate.pass_threshold}`
        );
      }
    }

    logger.info(
      {
        phase: config.phase,
        score: finalScore,
        threshold: config.gate.pass_threshold,
        passed,
      },
      'Gate evaluation complete'
    );

    return {
      passed,
      score: finalScore,
      failures,
    };
  }

  /**
   * Load phase configuration from YAML
   */
  async loadPhaseConfig(phase: string): Promise<PhaseConfig> {
    // In production, would load from /config/{phase}.yaml
    // For now, return a default config
    return {
      phase,
      parallelism: 'sequential',
      aggregation_strategy: 'merge',
      agents: [],
      budgets: {
        tokens: 100000,
        tools_minutes: 10,
        wallclock_minutes: 30,
      },
      guards: [
        { type: 'completeness' },
        { type: 'contradictions' },
      ],
      gate: {
        pass_threshold: 0.8,
        auto_fix_enabled: true,
        max_attempts: 3,
        rubrics: [
          {
            name: 'quality',
            weight: 1.0,
            criteria: 'Output meets quality standards',
          },
        ],
      },
      qav: {
        enabled: true,
        max_questions: 10,
        min_grounding_score: 0.85,
      },
      artifacts: [],
      dependencies: [],
    };
  }
}

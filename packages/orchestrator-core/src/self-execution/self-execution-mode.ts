/**
 * Self-Execution Mode (SEM) - Orchestrator's Supreme Fallback
 *
 * Spec: orchestrator.txt:1a, 7a (Executive Powers & Guarantees)
 *
 * When doers (agents/tools/executors) stall, regress, or underperform,
 * the Orchestrator can intervene directly using its built-in generalist
 * capability with access to allowlisted tools and Knowledge Map.
 *
 * **Triggers:**
 * - Missed heartbeats ×k
 * - Progress slope ~0
 * - Repeated schema/tool failures
 * - Gate deadlock
 *
 * **Process:**
 * 1. Snapshot & Claim: Freeze blocking step, claim exclusive control
 * 2. Micro-Plan: Draft minimal plan (tasks, tools, tests)
 * 3. Execute: Use allowlisted tools to produce artifact
 * 4. Validate & Hand-back: Pass gate checks, return control
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { ToolRegistry } from '../tools/tool-registry';
import { Gatekeeper } from '../gatekeeper/gatekeeper';
import { Recorder } from '../recorder/recorder';
import { KnowledgeMapClient } from '../knowledge-map/km-client';

const logger = pino({ name: 'self-execution-mode' });

/**
 * SEM trigger reasons
 */
export enum SEMTrigger {
  HEARTBEAT_TIMEOUT = 'heartbeat_timeout',
  PROGRESS_STALLED = 'progress_stalled',
  SCHEMA_FAILURE = 'schema_failure',
  TOOL_FAILURE = 'tool_failure',
  GATE_DEADLOCK = 'gate_deadlock',
  DOER_UNDERPERFORMANCE = 'doer_underperformance',
}

/**
 * Blocked step context
 */
export interface BlockedStepContext {
  runId: string;
  phase: string;
  taskId?: string;
  originalDoer: string; // Agent/Tool/Executor that failed
  trigger: SEMTrigger;
  triggerDetails: {
    missedHeartbeats?: number;
    slopeValue?: number;
    failureCount?: number;
    lastError?: string;
  };
  requiredArtifacts: string[];
  inputs: Record<string, any>;
  budgetRemaining: {
    tokens: number;
    toolsMinutes: number;
    wallclockMinutes: number;
  };
  allowlistedTools: string[];
  gateRubrics?: Record<string, any>;
}

/**
 * SEM execution result
 */
export interface SEMResult {
  success: boolean;
  artifacts: any[];
  interventionDurationMs: number;
  toolsUsed: string[];
  costUsd: number;
  tokensUsed: number;
  gateScore?: number;
  handbackStatus: 'returned_to_doer' | 'continued_to_next_phase' | 'failed';
  evidence: {
    microPlan: string;
    executionLog: string[];
    guardResults: any[];
  };
}

/**
 * Micro-plan for SEM execution
 */
interface MicroPlan {
  goal: string;
  tasks: Array<{
    id: string;
    description: string;
    tool: string;
    inputs: Record<string, any>;
    expectedOutput: string;
  }>;
  tests: Array<{
    id: string;
    description: string;
    assertionType: 'schema' | 'content' | 'quality';
    criteria: Record<string, any>;
  }>;
  estimatedTokens: number;
  estimatedMinutes: number;
}

/**
 * Self-Execution Mode Engine
 *
 * The Orchestrator's built-in capability to complete blocking tasks
 * when specialized doers cannot. Acts as supreme fallback.
 */
export class SelfExecutionMode extends EventEmitter {
  private activeInterventions: Map<string, Date> = new Map();

  constructor(
    private db: Pool,
    private toolRegistry: ToolRegistry,
    private recorder: Recorder,
    private kmClient?: KnowledgeMapClient
  ) {
    super();
  }

  /**
   * Intervene when a doer has failed
   *
   * @param context - Blocked step context
   * @returns SEM execution result
   */
  async intervene(context: BlockedStepContext): Promise<SEMResult> {
    const startTime = Date.now();
    const interventionId = `sem-${context.runId}-${context.phase}-${Date.now()}`;

    logger.info(
      {
        runId: context.runId,
        phase: context.phase,
        trigger: context.trigger,
        originalDoer: context.originalDoer,
      },
      'SEM intervention triggered'
    );

    // Step 1: Snapshot & Claim
    await this.snapshotAndClaim(context, interventionId);

    const executionLog: string[] = [];
    const toolsUsed: string[] = [];
    const guardResults: any[] = [];
    const artifacts: any[] = [];

    try {
      // Step 2: Micro-Plan
      executionLog.push(`[${new Date().toISOString()}] Generating micro-plan...`);
      const microPlan = await this.generateMicroPlan(context);

      executionLog.push(`[${new Date().toISOString()}] Micro-plan generated: ${microPlan.tasks.length} tasks`);
      logger.debug({ microPlan }, 'Micro-plan created');

      // Emit planning event
      this.emit('sem.planning', {
        interventionId,
        runId: context.runId,
        phase: context.phase,
        microPlan,
      });

      // Step 3: Execute micro-plan
      executionLog.push(`[${new Date().toISOString()}] Executing micro-plan...`);

      for (const task of microPlan.tasks) {
        executionLog.push(`[${new Date().toISOString()}] Executing task: ${task.id} - ${task.description}`);

        const tool = this.toolRegistry.get(task.tool);
        if (!tool) {
          throw new Error(`Tool not found: ${task.tool}`);
        }

        // Execute tool
        const result = await tool.execute(task.inputs);

        toolsUsed.push(task.tool);
        executionLog.push(`[${new Date().toISOString()}] Task ${task.id} completed`);

        // Store artifact
        artifacts.push({
          taskId: task.id,
          tool: task.tool,
          output: result,
          timestamp: new Date().toISOString(),
        });

        // Run guards/tests
        for (const test of microPlan.tests) {
          executionLog.push(`[${new Date().toISOString()}] Running test: ${test.id} - ${test.description}`);

          const guardResult = await this.runGuard(test, result);
          guardResults.push(guardResult);

          if (!guardResult.passed) {
            executionLog.push(`[${new Date().toISOString()}] Test ${test.id} FAILED: ${guardResult.reason}`);
            throw new Error(`Guard failed: ${test.description}`);
          }

          executionLog.push(`[${new Date().toISOString()}] Test ${test.id} PASSED`);
        }
      }

      // Step 4: Validate & Hand-back
      executionLog.push(`[${new Date().toISOString()}] Validating artifacts...`);

      const validationResult = await this.validateArtifacts(context, artifacts);

      const interventionDurationMs = Date.now() - startTime;

      if (validationResult.gateScore >= 70) {
        // Artifacts pass gate checks
        executionLog.push(`[${new Date().toISOString()}] Validation PASSED (score: ${validationResult.gateScore})`);

        // Persist artifacts
        await this.persistArtifacts(context, artifacts);

        // Release claim
        await this.releaseClaim(interventionId);

        // Record successful intervention
        await this.recorder.recordStep({
          runId: context.runId,
          phase: context.phase,
          step: 'sem.intervention.success',
          actor: 'SelfExecutionMode',
          outputs: artifacts.map((a) => a.taskId),
          cost: {
            usd: validationResult.costUsd,
            tokens: validationResult.tokensUsed,
          },
          latency_ms: interventionDurationMs,
          status: 'succeeded',
          metadata: {
            trigger: context.trigger,
            originalDoer: context.originalDoer,
            toolsUsed,
            gateScore: validationResult.gateScore,
          },
        });

        this.emit('sem.success', {
          interventionId,
          runId: context.runId,
          phase: context.phase,
          artifacts,
          gateScore: validationResult.gateScore,
        });

        logger.info(
          {
            runId: context.runId,
            phase: context.phase,
            durationMs: interventionDurationMs,
            gateScore: validationResult.gateScore,
          },
          'SEM intervention succeeded'
        );

        return {
          success: true,
          artifacts,
          interventionDurationMs,
          toolsUsed,
          costUsd: validationResult.costUsd,
          tokensUsed: validationResult.tokensUsed,
          gateScore: validationResult.gateScore,
          handbackStatus: 'continued_to_next_phase',
          evidence: {
            microPlan: JSON.stringify(microPlan),
            executionLog,
            guardResults,
          },
        };
      } else {
        // Validation failed - hand back to original doer with hints
        executionLog.push(`[${new Date().toISOString()}] Validation FAILED (score: ${validationResult.gateScore})`);

        await this.releaseClaim(interventionId);

        this.emit('sem.validation_failed', {
          interventionId,
          runId: context.runId,
          phase: context.phase,
          gateScore: validationResult.gateScore,
          hints: validationResult.hints,
        });

        logger.warn(
          {
            runId: context.runId,
            phase: context.phase,
            gateScore: validationResult.gateScore,
          },
          'SEM intervention validation failed, returning to doer'
        );

        return {
          success: false,
          artifacts,
          interventionDurationMs: Date.now() - startTime,
          toolsUsed,
          costUsd: validationResult.costUsd,
          tokensUsed: validationResult.tokensUsed,
          gateScore: validationResult.gateScore,
          handbackStatus: 'returned_to_doer',
          evidence: {
            microPlan: JSON.stringify(microPlan),
            executionLog,
            guardResults,
          },
        };
      }
    } catch (error: any) {
      executionLog.push(`[${new Date().toISOString()}] ERROR: ${error.message}`);

      await this.releaseClaim(interventionId);

      await this.recorder.recordStep({
        runId: context.runId,
        phase: context.phase,
        step: 'sem.intervention.failed',
        actor: 'SelfExecutionMode',
        cost: { usd: 0, tokens: 0 },
        latency_ms: Date.now() - startTime,
        status: 'failed',
        metadata: {
          error: error.message,
          trigger: context.trigger,
          originalDoer: context.originalDoer,
        },
      });

      this.emit('sem.failed', {
        interventionId,
        runId: context.runId,
        phase: context.phase,
        error: error.message,
      });

      logger.error(
        {
          error,
          runId: context.runId,
          phase: context.phase,
        },
        'SEM intervention failed'
      );

      return {
        success: false,
        artifacts: [],
        interventionDurationMs: Date.now() - startTime,
        toolsUsed,
        costUsd: 0,
        tokensUsed: 0,
        handbackStatus: 'failed',
        evidence: {
          microPlan: '',
          executionLog,
          guardResults,
        },
      };
    }
  }

  /**
   * Step 1: Snapshot & Claim
   * Freeze the blocking step's context and claim exclusive control
   */
  private async snapshotAndClaim(
    context: BlockedStepContext,
    interventionId: string
  ): Promise<void> {
    // Mark intervention as active
    this.activeInterventions.set(interventionId, new Date());

    // Snapshot current state to database
    await this.db.query(
      `
      INSERT INTO sem_interventions (
        intervention_id, run_id, phase, task_id, trigger, original_doer,
        context_snapshot, claimed_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'active')
    `,
      [
        interventionId,
        context.runId,
        context.phase,
        context.taskId,
        context.trigger,
        context.originalDoer,
        JSON.stringify(context),
      ]
    );

    // Mark original task/doer as blocked
    if (context.taskId) {
      await this.db.query(
        `UPDATE tasks SET status = 'blocked_by_sem', blocked_at = NOW() WHERE task_id = $1`,
        [context.taskId]
      );
    }

    logger.debug({ interventionId }, 'Context snapshotted and claimed');
  }

  /**
   * Step 2: Generate Micro-Plan
   * Draft a minimal plan with tasks, tools, and tests
   */
  private async generateMicroPlan(context: BlockedStepContext): Promise<MicroPlan> {
    // Query Knowledge Map for relevant context
    let kmContext = '';
    if (this.kmClient) {
      try {
        const nodes = await this.kmClient.getExistingNodes(context.phase, context.runId, 20);
        kmContext = nodes.map((n: any) => `Q: ${n.question}\nA: ${n.answer}`).join('\n\n');
      } catch (error) {
        logger.warn({ error }, 'Failed to fetch KM context');
      }
    }

    // Determine required artifacts for this phase
    const requiredArtifacts = context.requiredArtifacts;

    // Select tools from allowlist that can help
    const availableTools = context.allowlistedTools
      .map((toolName) => this.toolRegistry.get(toolName))
      .filter((t) => t !== undefined);

    // Create micro-plan (simplified - in production would use LLM)
    const microPlan: MicroPlan = {
      goal: `Produce required artifacts for ${context.phase}: ${requiredArtifacts.join(', ')}`,
      tasks: [],
      tests: [],
      estimatedTokens: 10000,
      estimatedMinutes: 5,
    };

    // Generate tasks based on required artifacts
    for (let i = 0; i < requiredArtifacts.length; i++) {
      const artifact = requiredArtifacts[i];

      // Pick first available tool (in production, would use VoI analysis)
      const tool = availableTools[i % availableTools.length];

      if (tool) {
        microPlan.tasks.push({
          id: `task-${i + 1}`,
          description: `Generate ${artifact} using ${tool.id}`,
          tool: tool.id,
          inputs: {
            ...context.inputs,
            artifact_type: artifact,
            phase: context.phase,
            km_context: kmContext,
          },
          expectedOutput: artifact,
        });

        // Add schema test
        microPlan.tests.push({
          id: `test-${i + 1}-schema`,
          description: `Validate ${artifact} schema`,
          assertionType: 'schema',
          criteria: {
            artifact_type: artifact,
            required_fields: ['type', 'content', 'metadata'],
          },
        });

        // Add quality test
        microPlan.tests.push({
          id: `test-${i + 1}-quality`,
          description: `Validate ${artifact} quality`,
          assertionType: 'quality',
          criteria: {
            min_completeness: 0.7,
            min_grounding: 0.6,
          },
        });
      }
    }

    return microPlan;
  }

  /**
   * Run guard/test on artifact
   */
  private async runGuard(
    test: MicroPlan['tests'][0],
    artifact: any
  ): Promise<{ passed: boolean; reason?: string }> {
    switch (test.assertionType) {
      case 'schema':
        // Check required fields
        const requiredFields = test.criteria.required_fields || [];
        for (const field of requiredFields) {
          if (!(field in artifact)) {
            return {
              passed: false,
              reason: `Missing required field: ${field}`,
            };
          }
        }
        return { passed: true };

      case 'content':
        // Check content is not empty
        if (!artifact.content || artifact.content.length === 0) {
          return {
            passed: false,
            reason: 'Content is empty',
          };
        }
        return { passed: true };

      case 'quality':
        // Simplified quality check (in production would use actual metrics)
        const completeness = Math.random() * 0.5 + 0.5; // Simulate 0.5-1.0
        const grounding = Math.random() * 0.5 + 0.5;

        if (completeness < test.criteria.min_completeness) {
          return {
            passed: false,
            reason: `Completeness too low: ${completeness.toFixed(2)} < ${test.criteria.min_completeness}`,
          };
        }

        if (grounding < test.criteria.min_grounding) {
          return {
            passed: false,
            reason: `Grounding too low: ${grounding.toFixed(2)} < ${test.criteria.min_grounding}`,
          };
        }

        return { passed: true };

      default:
        return { passed: true };
    }
  }

  /**
   * Step 4: Validate artifacts against gate
   */
  private async validateArtifacts(
    context: BlockedStepContext,
    artifacts: any[]
  ): Promise<{
    gateScore: number;
    costUsd: number;
    tokensUsed: number;
    hints: string[];
  }> {
    // Simulate gate validation (in production would use actual Gatekeeper)
    const gateScore = Math.random() * 40 + 60; // 60-100
    const costUsd = artifacts.length * 0.05; // $0.05 per artifact
    const tokensUsed = artifacts.length * 5000; // 5k tokens per artifact

    const hints: string[] = [];
    if (gateScore < 70) {
      hints.push('Completeness needs improvement');
      hints.push('Add more grounding evidence');
    }

    return {
      gateScore,
      costUsd,
      tokensUsed,
      hints,
    };
  }

  /**
   * Persist artifacts to database
   */
  private async persistArtifacts(
    context: BlockedStepContext,
    artifacts: any[]
  ): Promise<void> {
    for (const artifact of artifacts) {
      await this.db.query(
        `
        INSERT INTO artifacts (run_id, phase, artifact_type, content, source, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `,
        [
          context.runId,
          context.phase,
          artifact.tool,
          JSON.stringify(artifact.output),
          'SelfExecutionMode',
        ]
      );
    }

    logger.debug(
      { runId: context.runId, count: artifacts.length },
      'Artifacts persisted'
    );
  }

  /**
   * Release claim on intervention
   */
  private async releaseClaim(interventionId: string): Promise<void> {
    this.activeInterventions.delete(interventionId);

    await this.db.query(
      `UPDATE sem_interventions SET status = 'completed', completed_at = NOW() WHERE intervention_id = $1`,
      [interventionId]
    );

    logger.debug({ interventionId }, 'Claim released');
  }

  /**
   * Check if SEM should be triggered
   */
  shouldTrigger(
    missedHeartbeats?: number,
    slopeValue?: number,
    failureCount?: number
  ): { trigger: boolean; reason?: SEMTrigger } {
    // Heartbeat timeout (3+ missed)
    if (missedHeartbeats !== undefined && missedHeartbeats >= 3) {
      return { trigger: true, reason: SEMTrigger.HEARTBEAT_TIMEOUT };
    }

    // Progress stalled (slope near 0)
    if (slopeValue !== undefined && Math.abs(slopeValue) < 0.01) {
      return { trigger: true, reason: SEMTrigger.PROGRESS_STALLED };
    }

    // Repeated failures (3+ failures)
    if (failureCount !== undefined && failureCount >= 3) {
      return { trigger: true, reason: SEMTrigger.SCHEMA_FAILURE };
    }

    return { trigger: false };
  }

  /**
   * Get intervention statistics
   */
  async getStats(runId?: string): Promise<{
    total_interventions: number;
    success_rate: number;
    avg_duration_ms: number;
    active_interventions: number;
  }> {
    const whereClause = runId ? 'WHERE run_id = $1' : '';
    const params = runId ? [runId] : [];

    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successes,
        AVG(EXTRACT(EPOCH FROM (completed_at - claimed_at)) * 1000) as avg_duration_ms
      FROM sem_interventions
      ${whereClause}
    `,
      params
    );

    const row = result.rows[0];
    const total = parseInt(row.total, 10);
    const successes = parseInt(row.successes, 10);

    return {
      total_interventions: total,
      success_rate: total > 0 ? successes / total : 0,
      avg_duration_ms: parseFloat(row.avg_duration_ms) || 0,
      active_interventions: this.activeInterventions.size,
    };
  }
}

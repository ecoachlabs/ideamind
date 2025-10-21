import pino from 'pino';

const logger = pino({ name: 'loop-until-pass' });

/**
 * Gate evaluation result
 */
export interface GateResult {
  pass: boolean;
  score: number;
  reasons: string[];
  evidence_pack_id?: string;
  issues?: GateIssue[];
}

/**
 * Gate issue with fix strategy
 */
export interface GateIssue {
  type: string; // e.g., 'grounding', 'coverage', 'security', 'contradictions'
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  fixStrategy?: string; // Suggested fix strategy
  metadata?: any;
}

/**
 * Phase executor interface
 */
export interface PhaseExecutor {
  execute(ctx: any): Promise<any>;
  runQAVLoop?(draft: any, ctx: any, options?: any): Promise<any>;
  runAgents?(agents: string[], ctx: any): Promise<any>;
  runSecurityScans?(ctx: any): Promise<any>;
  getDraft?(): any;
}

/**
 * Auto-fix strategy
 */
export type AutoFixStrategy =
  | 'rerun-qav'
  | 'add-missing-agents'
  | 'rerun-security'
  | 'stricter-validation'
  | 'reduce-scope'
  | 'manual-intervention';

/**
 * Loop-Until-Pass Gate Pattern
 *
 * Features:
 * - Automatic retry when gate fails
 * - Multiple fix strategies based on issue type
 * - Configurable max attempts
 * - Detailed logging of each attempt
 * - Escalation to human after max attempts
 *
 * Spec: orchestrator.txt:239 (`if (!gate.pass) { await autoFix(); continue; }`)
 */
export class LoopUntilPassGate {
  constructor(
    private maxAttempts: number = 5,
    private enableAutoFix: boolean = true
  ) {}

  /**
   * Execute phase with loop-until-pass gate logic
   *
   * @param phaseExecutor - Phase executor instance
   * @param gateEvaluator - Function to evaluate gate
   * @param context - Execution context
   * @returns Final result after gate passes or max attempts reached
   */
  async executeWithGate<T>(
    phaseExecutor: PhaseExecutor,
    gateEvaluator: (phaseResult: any) => Promise<GateResult>,
    context: any
  ): Promise<{
    result: T;
    gateResult: GateResult;
    attempts: number;
    autoFixApplied: boolean;
  }> {
    let attempts = 0;
    let lastResult: any;
    let lastGateResult: GateResult | undefined;
    let autoFixApplied = false;

    logger.info(
      {
        phase: context.phase,
        maxAttempts: this.maxAttempts,
        autoFixEnabled: this.enableAutoFix,
      },
      'Starting loop-until-pass gate execution'
    );

    while (attempts < this.maxAttempts) {
      attempts++;

      logger.info(
        {
          phase: context.phase,
          attempt: attempts,
          maxAttempts: this.maxAttempts,
        },
        'Executing phase (attempt)'
      );

      try {
        // Execute phase
        const startTime = Date.now();
        lastResult = await phaseExecutor.execute(context);
        const duration = Date.now() - startTime;

        logger.debug(
          {
            phase: context.phase,
            attempt: attempts,
            durationMs: duration,
          },
          'Phase execution complete'
        );

        // Evaluate gate
        lastGateResult = await gateEvaluator(lastResult);

        logger.info(
          {
            phase: context.phase,
            attempt: attempts,
            gatePass: lastGateResult.pass,
            gateScore: lastGateResult.score,
            issues: lastGateResult.issues?.length || 0,
          },
          'Gate evaluated'
        );

        if (lastGateResult.pass) {
          // Gate passed - success!
          logger.info(
            {
              phase: context.phase,
              attempts,
              autoFixApplied,
            },
            'Gate passed, phase complete'
          );

          return {
            result: lastResult,
            gateResult: lastGateResult,
            attempts,
            autoFixApplied,
          };
        } else {
          // Gate failed - auto-fix and retry
          logger.warn(
            {
              phase: context.phase,
              attempt: attempts,
              reasons: lastGateResult.reasons,
              issues: lastGateResult.issues,
            },
            'Gate failed'
          );

          if (this.enableAutoFix && attempts < this.maxAttempts) {
            logger.info(
              {
                phase: context.phase,
                attempt: attempts,
              },
              'Applying auto-fix'
            );

            await this.applyAutoFix(
              phaseExecutor,
              lastGateResult.issues || [],
              context
            );

            autoFixApplied = true;

            // Continue to next iteration
          } else {
            logger.warn(
              {
                phase: context.phase,
                attempts,
                reason: this.enableAutoFix ? 'max attempts reached' : 'auto-fix disabled',
              },
              'Cannot auto-fix, stopping'
            );
            break;
          }
        }
      } catch (error) {
        logger.error(
          {
            error,
            phase: context.phase,
            attempt: attempts,
          },
          'Phase execution failed with error'
        );

        // If execution fails, don't continue
        throw error;
      }
    }

    // Max attempts reached without gate passing
    logger.error(
      {
        phase: context.phase,
        attempts,
        lastGateScore: lastGateResult?.score,
      },
      'Gate failed after max attempts'
    );

    throw new Error(
      `Gate failed after ${attempts} attempts for phase ${context.phase}. ` +
      `Last score: ${lastGateResult?.score}. ` +
      `Reasons: ${lastGateResult?.reasons.join(', ')}`
    );
  }

  /**
   * Apply auto-fix based on issue types
   *
   * Implements different fix strategies:
   * - grounding: Re-run Q/A/V with stricter thresholds
   * - coverage: Add missing agents
   * - security: Re-run security scans
   * - contradictions: Run stricter validation
   */
  private async applyAutoFix(
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    logger.info(
      {
        issueCount: issues.length,
        issueTypes: issues.map((i) => i.type),
      },
      'Applying auto-fix for issues'
    );

    // Group issues by type
    const issuesByType = new Map<string, GateIssue[]>();
    for (const issue of issues) {
      if (!issuesByType.has(issue.type)) {
        issuesByType.set(issue.type, []);
      }
      issuesByType.get(issue.type)!.push(issue);
    }

    // Apply fixes for each issue type
    for (const [issueType, typeIssues] of issuesByType.entries()) {
      const strategy = this.getFixStrategy(issueType);

      logger.info(
        {
          issueType,
          issueCount: typeIssues.length,
          strategy,
        },
        'Applying fix strategy'
      );

      try {
        await this.applyStrategy(
          strategy,
          phaseExecutor,
          typeIssues,
          context
        );
      } catch (error) {
        logger.error(
          {
            error,
            issueType,
            strategy,
          },
          'Fix strategy failed'
        );
        // Continue with other fixes
      }
    }

    logger.info('Auto-fix complete');
  }

  /**
   * Get fix strategy for issue type
   */
  private getFixStrategy(issueType: string): AutoFixStrategy {
    const strategyMap: Record<string, AutoFixStrategy> = {
      grounding: 'rerun-qav',
      'low-grounding': 'rerun-qav',
      coverage: 'add-missing-agents',
      'missing-agents': 'add-missing-agents',
      security: 'rerun-security',
      cve: 'rerun-security',
      vulnerability: 'rerun-security',
      contradictions: 'stricter-validation',
      ambiguity: 'stricter-validation',
      'scope-too-large': 'reduce-scope',
    };

    return strategyMap[issueType] || 'manual-intervention';
  }

  /**
   * Apply specific fix strategy
   */
  private async applyStrategy(
    strategy: AutoFixStrategy,
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    switch (strategy) {
      case 'rerun-qav':
        await this.fixGrounding(phaseExecutor, issues, context);
        break;

      case 'add-missing-agents':
        await this.fixCoverage(phaseExecutor, issues, context);
        break;

      case 'rerun-security':
        await this.fixSecurity(phaseExecutor, issues, context);
        break;

      case 'stricter-validation':
        await this.fixValidation(phaseExecutor, issues, context);
        break;

      case 'reduce-scope':
        await this.reduceScope(phaseExecutor, issues, context);
        break;

      case 'manual-intervention':
        logger.warn(
          {
            issues: issues.map((i) => i.description),
          },
          'Manual intervention required (no auto-fix available)'
        );
        break;

      default:
        logger.warn({ strategy }, 'Unknown fix strategy');
    }
  }

  /**
   * Fix grounding issues (re-run Q/A/V with stricter thresholds)
   */
  private async fixGrounding(
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    logger.info({ issueCount: issues.length }, 'Fixing grounding issues');

    if (!phaseExecutor.runQAVLoop || !phaseExecutor.getDraft) {
      logger.warn('Phase executor does not support Q/A/V loop');
      return;
    }

    const draft = phaseExecutor.getDraft();

    await phaseExecutor.runQAVLoop(draft, context, {
      strictMode: true,
      minGroundingScore: 0.9, // Stricter threshold
      maxIterations: 5,
    });
  }

  /**
   * Fix coverage issues (add missing agents)
   */
  private async fixCoverage(
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    logger.info({ issueCount: issues.length }, 'Fixing coverage issues');

    if (!phaseExecutor.runAgents) {
      logger.warn('Phase executor does not support running agents');
      return;
    }

    // Identify missing agents from issues
    const missingAgents = this.identifyMissingAgents(issues);

    if (missingAgents.length > 0) {
      logger.info(
        { missingAgents },
        'Running missing agents'
      );

      await phaseExecutor.runAgents(missingAgents, context);
    }
  }

  /**
   * Fix security issues (re-run security scans)
   */
  private async fixSecurity(
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    logger.info({ issueCount: issues.length }, 'Fixing security issues');

    if (!phaseExecutor.runSecurityScans) {
      logger.warn('Phase executor does not support security scans');
      return;
    }

    await phaseExecutor.runSecurityScans(context);
  }

  /**
   * Fix validation issues (stricter validation)
   */
  private async fixValidation(
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    logger.info({ issueCount: issues.length }, 'Applying stricter validation');

    // Update context with stricter validation rules
    context.strictValidation = true;
    context.maxContradictions = 0;
    context.maxAmbiguity = 0.05;
  }

  /**
   * Reduce scope (for too-large specs)
   */
  private async reduceScope(
    phaseExecutor: PhaseExecutor,
    issues: GateIssue[],
    context: any
  ): Promise<void> {
    logger.info({ issueCount: issues.length }, 'Reducing scope');

    // Update context to reduce scope
    context.reducedScope = true;
    context.chunkSize = Math.floor((context.chunkSize || 10000) * 0.7); // Reduce by 30%
  }

  /**
   * Identify missing agents from coverage issues
   */
  private identifyMissingAgents(issues: GateIssue[]): string[] {
    const missingAgents: string[] = [];

    for (const issue of issues) {
      if (issue.metadata?.missingAgent) {
        missingAgents.push(issue.metadata.missingAgent);
      }
    }

    // Remove duplicates
    return Array.from(new Set(missingAgents));
  }

  /**
   * Get statistics about gate attempts
   */
  getStats(attempts: number, autoFixApplied: boolean): {
    totalAttempts: number;
    autoFixUsed: boolean;
    successRate: number;
  } {
    return {
      totalAttempts: attempts,
      autoFixUsed: autoFixApplied,
      successRate: attempts > 0 ? 1 / attempts : 0,
    };
  }
}

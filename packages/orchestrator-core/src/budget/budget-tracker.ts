import pino from 'pino';

const logger = pino({ name: 'budget-tracker' });

/**
 * Budget allocation for a phase or task
 */
export interface Budget {
  tokens: number;
  tools_minutes: number;
  wallclock_minutes: number;
}

/**
 * Current usage tracking
 */
export interface Usage {
  tokens: number;
  tools_minutes: number;
  wallclock_ms: number;
}

/**
 * Budget status
 */
export interface BudgetStatus {
  allocated: Budget;
  used: Usage;
  remaining: {
    tokens: number;
    tools_minutes: number;
    wallclock_minutes: number;
  };
  utilization: {
    tokens_percent: number;
    tools_percent: number;
    wallclock_percent: number;
  };
  exceeded: {
    tokens: boolean;
    tools: boolean;
    wallclock: boolean;
  };
}

/**
 * Budget Tracker
 * 
 * Tracks and enforces budget limits for runs, phases, and tasks
 * Spec: orchestrator.txt:208-215
 */
export class BudgetTracker {
  private budgets: Map<string, Budget> = new Map();
  private usage: Map<string, Usage> = new Map();
  private startTimes: Map<string, number> = new Map();

  constructor(private db: any) {}

  /**
   * Set budget for a scope (run, phase, or task)
   * 
   * @param scope - Scope identifier (e.g., "run:123", "phase:prd", "task:abc")
   * @param budget - Budget allocation
   */
  setBudget(scope: string, budget: Budget): void {
    this.budgets.set(scope, budget);
    this.usage.set(scope, {
      tokens: 0,
      tools_minutes: 0,
      wallclock_ms: 0,
    });

    logger.info(
      {
        scope,
        budget,
      },
      'Budget allocated'
    );
  }

  /**
   * Start tracking wall-clock time for a scope
   */
  startTracking(scope: string): void {
    this.startTimes.set(scope, Date.now());

    logger.debug({ scope }, 'Started tracking wall-clock time');
  }

  /**
   * Stop tracking wall-clock time and update usage
   */
  stopTracking(scope: string): void {
    const startTime = this.startTimes.get(scope);
    if (!startTime) {
      logger.warn({ scope }, 'No start time found for scope');
      return;
    }

    const elapsed = Date.now() - startTime;
    const usage = this.usage.get(scope);
    if (usage) {
      usage.wallclock_ms += elapsed;
    }

    this.startTimes.delete(scope);

    logger.debug(
      {
        scope,
        elapsed_ms: elapsed,
      },
      'Stopped tracking wall-clock time'
    );
  }

  /**
   * Record token usage
   * 
   * @param scope - Scope identifier
   * @param tokens - Number of tokens consumed
   * @throws Error if budget exceeded
   */
  recordTokens(scope: string, tokens: number): void {
    const usage = this.usage.get(scope);
    if (!usage) {
      throw new Error(`No usage tracking for scope: ${scope}`);
    }

    usage.tokens += tokens;

    // Check if budget exceeded
    const budget = this.budgets.get(scope);
    if (budget && usage.tokens > budget.tokens) {
      const exceeded = usage.tokens - budget.tokens;

      logger.error(
        {
          scope,
          tokens_used: usage.tokens,
          tokens_budget: budget.tokens,
          exceeded,
        },
        'Token budget exceeded'
      );

      throw new Error(
        `Token budget exceeded for ${scope}: used ${usage.tokens}, budget ${budget.tokens}`
      );
    }

    logger.debug(
      {
        scope,
        tokens,
        total_tokens: usage.tokens,
      },
      'Tokens recorded'
    );
  }

  /**
   * Record tool usage time
   * 
   * @param scope - Scope identifier
   * @param minutes - Tool usage time in minutes
   * @throws Error if budget exceeded
   */
  recordToolTime(scope: string, minutes: number): void {
    const usage = this.usage.get(scope);
    if (!usage) {
      throw new Error(`No usage tracking for scope: ${scope}`);
    }

    usage.tools_minutes += minutes;

    // Check if budget exceeded
    const budget = this.budgets.get(scope);
    if (budget && usage.tools_minutes > budget.tools_minutes) {
      const exceeded = usage.tools_minutes - budget.tools_minutes;

      logger.error(
        {
          scope,
          tools_used: usage.tools_minutes,
          tools_budget: budget.tools_minutes,
          exceeded,
        },
        'Tool time budget exceeded'
      );

      throw new Error(
        `Tool time budget exceeded for ${scope}: used ${usage.tools_minutes}, budget ${budget.tools_minutes}`
      );
    }

    logger.debug(
      {
        scope,
        minutes,
        total_minutes: usage.tools_minutes,
      },
      'Tool time recorded'
    );
  }

  /**
   * Check if wall-clock budget is exceeded
   * 
   * @param scope - Scope identifier
   * @returns True if exceeded
   */
  isWallclockExceeded(scope: string): boolean {
    const budget = this.budgets.get(scope);
    const usage = this.usage.get(scope);

    if (!budget || !usage) {
      return false;
    }

    const budgetMs = budget.wallclock_minutes * 60 * 1000;

    // Add current elapsed time if still tracking
    let totalMs = usage.wallclock_ms;
    const startTime = this.startTimes.get(scope);
    if (startTime) {
      totalMs += Date.now() - startTime;
    }

    const exceeded = totalMs > budgetMs;

    if (exceeded) {
      logger.warn(
        {
          scope,
          used_minutes: totalMs / 60000,
          budget_minutes: budget.wallclock_minutes,
        },
        'Wall-clock budget exceeded'
      );
    }

    return exceeded;
  }

  /**
   * Get budget status for a scope
   * 
   * @param scope - Scope identifier
   * @returns Budget status including utilization and exceeded flags
   */
  getStatus(scope: string): BudgetStatus | null {
    const budget = this.budgets.get(scope);
    const usage = this.usage.get(scope);

    if (!budget || !usage) {
      return null;
    }

    // Add current elapsed time if still tracking
    let totalWallclockMs = usage.wallclock_ms;
    const startTime = this.startTimes.get(scope);
    if (startTime) {
      totalWallclockMs += Date.now() - startTime;
    }

    const budgetWallclockMs = budget.wallclock_minutes * 60 * 1000;
    const wallclockMinutes = totalWallclockMs / 60000;

    return {
      allocated: budget,
      used: {
        tokens: usage.tokens,
        tools_minutes: usage.tools_minutes,
        wallclock_ms: totalWallclockMs,
      },
      remaining: {
        tokens: Math.max(0, budget.tokens - usage.tokens),
        tools_minutes: Math.max(0, budget.tools_minutes - usage.tools_minutes),
        wallclock_minutes: Math.max(0, budget.wallclock_minutes - wallclockMinutes),
      },
      utilization: {
        tokens_percent: (usage.tokens / budget.tokens) * 100,
        tools_percent: (usage.tools_minutes / budget.tools_minutes) * 100,
        wallclock_percent: (totalWallclockMs / budgetWallclockMs) * 100,
      },
      exceeded: {
        tokens: usage.tokens > budget.tokens,
        tools: usage.tools_minutes > budget.tools_minutes,
        wallclock: totalWallclockMs > budgetWallclockMs,
      },
    };
  }

  /**
   * Get usage for a scope
   */
  getUsage(scope: string): Usage | null {
    const usage = this.usage.get(scope);
    if (!usage) {
      return null;
    }

    // Add current elapsed time if still tracking
    let totalWallclockMs = usage.wallclock_ms;
    const startTime = this.startTimes.get(scope);
    if (startTime) {
      totalWallclockMs += Date.now() - startTime;
    }

    return {
      tokens: usage.tokens,
      tools_minutes: usage.tools_minutes,
      wallclock_ms: totalWallclockMs,
    };
  }

  /**
   * Split budget across N tasks
   * 
   * @param totalBudget - Total budget to split
   * @param count - Number of tasks
   * @returns Per-task budget
   */
  splitBudget(totalBudget: Budget, count: number): Budget {
    if (count <= 0) {
      throw new Error('Cannot split budget for 0 or negative tasks');
    }

    return {
      tokens: Math.floor(totalBudget.tokens / count),
      tools_minutes: totalBudget.tools_minutes / count,
      wallclock_minutes: totalBudget.wallclock_minutes / count,
    };
  }

  /**
   * Calculate cost in USD from usage
   * 
   * Pricing (example rates, adjust as needed):
   * - Tokens: $0.02 per 1000 tokens
   * - Tools: $5 per minute
   * 
   * @param usage - Usage to calculate cost for
   * @returns Cost in USD
   */
  calculateCost(usage: Usage): number {
    const TOKEN_COST_PER_1K = 0.02;
    const TOOL_COST_PER_MINUTE = 5.0;

    const tokenCost = (usage.tokens / 1000) * TOKEN_COST_PER_1K;
    const toolCost = usage.tools_minutes * TOOL_COST_PER_MINUTE;

    return tokenCost + toolCost;
  }

  /**
   * Persist budget and usage to database
   */
  async persist(scope: string, runId: string): Promise<void> {
    const status = this.getStatus(scope);
    if (!status) {
      return;
    }

    await this.db.query(
      `
      INSERT INTO budget_tracking (run_id, scope, budget, usage, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (run_id, scope) DO UPDATE
      SET usage = EXCLUDED.usage, updated_at = NOW()
    `,
      [
        runId,
        scope,
        JSON.stringify(status.allocated),
        JSON.stringify(status.used),
      ]
    );

    logger.debug({ scope, runId }, 'Budget persisted to database');
  }

  /**
   * Get all scopes with exceeded budgets
   */
  getExceededScopes(): string[] {
    const exceeded: string[] = [];

    for (const [scope, budget] of this.budgets.entries()) {
      const status = this.getStatus(scope);
      if (
        status &&
        (status.exceeded.tokens || status.exceeded.tools || status.exceeded.wallclock)
      ) {
        exceeded.push(scope);
      }
    }

    return exceeded;
  }

  /**
   * Clear tracking for a scope
   */
  clear(scope: string): void {
    this.budgets.delete(scope);
    this.usage.delete(scope);
    this.startTimes.delete(scope);

    logger.debug({ scope }, 'Budget tracking cleared');
  }
}

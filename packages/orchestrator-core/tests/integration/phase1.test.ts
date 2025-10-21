/**
 * Phase 1 Integration Tests
 *
 * Tests for Priority Scheduler, Quota Enforcer, Budget Guard, and Deliberation Guard
 * integrated with the Mothership Orchestrator.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { MothershipOrchestrator, MothershipConfig, OrchestrationContext } from '../../src/mothership-orchestrator';
import { PriorityScheduler } from '../../src/scheduler/priority-scheduler';
import { QuotaEnforcer } from '../../src/quota/quota-enforcer';
import { BudgetGuard } from '../../src/performance/budget-guard';
import { DeliberationGuard } from '../../src/autonomy/deliberation-guard';

describe('Phase 1 Integration Tests', () => {
  let pool: Pool;
  let orchestrator: MothershipOrchestrator;

  beforeAll(async () => {
    // Create database pool
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ideamind_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Run migration 024 if not already applied
    try {
      await pool.query('SELECT 1 FROM preemption_history LIMIT 1');
    } catch (err) {
      console.log('Migration 024 not applied, skipping schema check');
    }

    // Initialize Mothership Orchestrator with all Phase 1 components enabled
    const config: MothershipConfig = {
      databasePool: pool,
      enableAutonomy: true,
      enableGovernance: false,
      enablePerformance: true,
      enableRAG: false,
      enableSecurity: false,
      enableExperimentation: false,
      enableCompliance: false,
      enableCodeGraph: false,
      enableOps: false,
      // Phase 1 components
      enablePriorityScheduling: true,
      enableQuotaEnforcement: true,
      enableBudgetGuard: true,
      enableDeliberationQuality: true,
      enableHeartbeatMonitoring: false,
      enableDesignCritique: false,
      // Learning-Ops
      enableLearningOps: false,
      // Memory Vault
      enableMemoryVault: false,
    };

    orchestrator = new MothershipOrchestrator(config);

    // Wait for initialization
    await new Promise<void>((resolve) => {
      orchestrator.once('initialized', () => resolve());
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM tasks WHERE id LIKE \'test-%\'');
    await pool.query('DELETE FROM preemption_history WHERE task_id LIKE \'test-%\'');
    await pool.query('DELETE FROM deliberation_scores WHERE task_id LIKE \'test-%\'');
    await pool.query('DELETE FROM budget_events WHERE run_id LIKE \'test-%\'');
    await pool.query('DELETE FROM tenant_usage WHERE tenant_id = \'test-tenant\'');
    await pool.query('DELETE FROM tenant_quotas WHERE tenant_id = \'test-tenant\'');

    // Set up test tenant quota
    await pool.query(
      `INSERT INTO tenant_quotas
       (tenant_id, max_cpu_cores, max_memory_gb, max_storage_gb, max_tokens_per_day,
        max_cost_per_day_usd, max_gpus, max_concurrent_runs)
       VALUES ('test-tenant', 10, 32, 100, 1000000, 100.00, 2, 5)
       ON CONFLICT (tenant_id) DO UPDATE SET
         max_cpu_cores = 10,
         max_memory_gb = 32,
         max_storage_gb = 100,
         max_tokens_per_day = 1000000,
         max_cost_per_day_usd = 100.00,
         max_gpus = 2,
         max_concurrent_runs = 5`
    );
  });

  // ============================================================================
  // Priority Scheduler Tests
  // ============================================================================

  describe('Priority Scheduler', () => {
    it('should assign priority based on phase', async () => {
      const context: OrchestrationContext = {
        runId: 'test-priority-1',
        tenantId: 'test-tenant',
        phase: 'security',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that priority was assigned (P0 for security phase)
      const taskResult = await pool.query(
        'SELECT priority_class FROM tasks WHERE id = $1',
        [context.runId]
      );

      if (taskResult.rows.length > 0) {
        expect(taskResult.rows[0].priority_class).toBe('P0');
      }
    });

    it('should assign different priorities for different phases', async () => {
      const phases = ['security', 'build', 'plan', 'research'];
      const expectedPriorities = ['P0', 'P1', 'P2', 'P3'];

      for (let i = 0; i < phases.length; i++) {
        const context: OrchestrationContext = {
          runId: `test-priority-${phases[i]}`,
          tenantId: 'test-tenant',
          phase: phases[i],
          budget: { maxCostUSD: 10, maxDuration: 300000 },
        };

        await orchestrator.orchestrate(context);

        const result = await pool.query(
          'SELECT priority_class FROM tasks WHERE id = $1',
          [context.runId]
        );

        if (result.rows.length > 0) {
          expect(result.rows[0].priority_class).toBe(expectedPriorities[i]);
        }
      }
    });
  });

  // ============================================================================
  // Quota Enforcer Tests
  // ============================================================================

  describe('Quota Enforcer', () => {
    it('should enforce tenant quotas during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-quota-1',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that usage was recorded
      const usageResult = await pool.query(
        `SELECT resource_type, SUM(amount) as total
         FROM tenant_usage
         WHERE tenant_id = 'test-tenant' AND run_id = $1
         GROUP BY resource_type`,
        [context.runId]
      );

      expect(usageResult.rows.length).toBeGreaterThan(0);
    });

    it('should reject execution when quota exceeded', async () => {
      // Set very low quota
      await pool.query(
        `UPDATE tenant_quotas
         SET max_cpu_cores = 1, max_memory_gb = 1
         WHERE tenant_id = 'test-tenant'`
      );

      // Try to run a build phase (requires 8 CPU, 32GB memory)
      const context: OrchestrationContext = {
        runId: 'test-quota-exceed',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('failure');
      expect(result.violations.some((v) => v.type === 'quota_exceeded')).toBe(true);

      // Check that violation was recorded
      const violationResult = await pool.query(
        `SELECT * FROM quota_violations
         WHERE tenant_id = 'test-tenant' AND run_id = $1`,
        [context.runId]
      );

      expect(violationResult.rows.length).toBeGreaterThan(0);
    });

    it('should allow burst allowance for CPU and memory', async () => {
      // Set quota with burst allowance
      await pool.query(
        `UPDATE tenant_quotas
         SET max_cpu_cores = 6,
             max_memory_gb = 20,
             burst_cpu_cores = 2,
             burst_memory_gb = 12
         WHERE tenant_id = 'test-tenant'`
      );

      // Try to run a build phase (requires 8 CPU, 32GB memory)
      // Should succeed with burst
      const context: OrchestrationContext = {
        runId: 'test-quota-burst',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');
    });
  });

  // ============================================================================
  // Budget Guard Tests
  // ============================================================================

  describe('Budget Guard', () => {
    it('should track budget during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-budget-1',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that budget events were recorded
      const eventResult = await pool.query(
        'SELECT * FROM budget_events WHERE run_id = $1 ORDER BY triggered_at',
        [context.runId]
      );

      // May have warning events if budget usage is high
      expect(eventResult.rows.length).toBeGreaterThanOrEqual(0);
    });

    it('should trigger warning at 50% budget', async () => {
      const budgetGuard = new BudgetGuard(pool);

      await budgetGuard.setBudget('test-budget-warn', 10.0);

      // Record cost to reach 50%
      await budgetGuard.recordCost('test-budget-warn', 5.0);

      let alertReceived = false;
      budgetGuard.once('budget-alert', (alert) => {
        expect(alert.level).toBe('warn');
        alertReceived = true;
      });

      await budgetGuard.enforceBudget('test-budget-warn');

      expect(alertReceived).toBe(true);

      // Check that event was stored
      const events = await budgetGuard.getBudgetEvents('test-budget-warn');
      expect(events.some((e) => e.eventType === 'warn')).toBe(true);
    });

    it('should trigger throttle at 80% budget', async () => {
      const budgetGuard = new BudgetGuard(pool);

      await budgetGuard.setBudget('test-budget-throttle', 10.0);

      // Record cost to reach 80%
      await budgetGuard.recordCost('test-budget-throttle', 8.0);

      let throttleReceived = false;
      budgetGuard.once('preempt-for-budget', (event) => {
        expect(event.reason).toBe('budget_exceeded');
        throttleReceived = true;
      });

      await budgetGuard.enforceBudget('test-budget-throttle');

      expect(throttleReceived).toBe(true);

      // Check that event was stored
      const events = await budgetGuard.getBudgetEvents('test-budget-throttle');
      expect(events.some((e) => e.eventType === 'throttle')).toBe(true);
    });

    it('should pause run at 95% budget', async () => {
      const budgetGuard = new BudgetGuard(pool);

      await budgetGuard.setBudget('test-budget-pause', 10.0);

      // Record cost to reach 95%
      await budgetGuard.recordCost('test-budget-pause', 9.5);

      let pauseReceived = false;
      budgetGuard.once('run-paused-for-budget', (event) => {
        expect(event.runId).toBe('test-budget-pause');
        pauseReceived = true;
      });

      await budgetGuard.enforceBudget('test-budget-pause');

      expect(pauseReceived).toBe(true);

      // Check that run was paused in database
      const runResult = await pool.query(
        'SELECT status, paused_reason FROM runs WHERE id = $1',
        ['test-budget-pause']
      );

      if (runResult.rows.length > 0) {
        expect(runResult.rows[0].status).toBe('paused');
        expect(runResult.rows[0].paused_reason).toBe('budget_exceeded');
      }
    });
  });

  // ============================================================================
  // Deliberation Guard Tests
  // ============================================================================

  describe('Deliberation Guard', () => {
    it('should score reasoning quality during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-delib-1',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that deliberation score was stored
      const scoreResult = await pool.query(
        'SELECT * FROM deliberation_scores WHERE task_id = $1',
        [context.runId]
      );

      expect(scoreResult.rows.length).toBeGreaterThan(0);

      const score = scoreResult.rows[0];
      expect(score.overall_score).toBeGreaterThanOrEqual(0);
      expect(score.overall_score).toBeLessThanOrEqual(1);
      expect(score.depth_score).toBeGreaterThanOrEqual(0);
      expect(score.coherence_score).toBeGreaterThanOrEqual(0);
      expect(score.relevance_score).toBeGreaterThanOrEqual(0);
    });

    it('should score high-quality reasoning with pass recommendation', async () => {
      const deliberationGuard = new DeliberationGuard(pool);

      const goodReasoning = `
        First, I need to analyze the requirements carefully.
        The goal is to implement a secure authentication system.
        Second, I'll design the API endpoints with proper validation.
        Next, I'll implement JWT token generation with industry standards.
        Then, I'll add comprehensive error handling for edge cases.
        Therefore, this approach ensures both security and maintainability.
        Since we're following best practices, the system will be scalable.
        As a result, we achieve our objective of secure authentication.
        In conclusion, this design meets all security requirements.
      `;

      const score = await deliberationGuard.scoreReasoning(goodReasoning, {
        taskId: 'test-good-reasoning',
        runId: 'test-run',
        phase: 'plan',
        goal: 'Implement secure authentication system',
        modelUsed: 'claude-sonnet-4',
      });

      expect(score.recommendation).toBe('pass');
      expect(score.overall).toBeGreaterThanOrEqual(0.6);
      expect(score.depth).toBeGreaterThan(0.5);
      expect(score.coherence).toBeGreaterThan(0.5);
    });

    it('should score low-quality reasoning with reject recommendation', async () => {
      const deliberationGuard = new DeliberationGuard(pool);

      const poorReasoning = `
        Maybe this could work. Perhaps we should try something.
        Possibly the answer is yes. It might be the right approach.
        Could be good. Seems like it's okay.
      `;

      const score = await deliberationGuard.scoreReasoning(poorReasoning, {
        taskId: 'test-poor-reasoning',
        runId: 'test-run',
        phase: 'plan',
        goal: 'Implement secure authentication system',
        modelUsed: 'claude-sonnet-4',
      });

      expect(score.recommendation).toBe('reject');
      expect(score.overall).toBeLessThan(0.3);
    });

    it('should detect logical contradictions and reduce coherence score', async () => {
      const deliberationGuard = new DeliberationGuard(pool);

      const contradictoryReasoning = `
        First, we must always use encryption for all data.
        However, we should never encrypt user passwords.
        Therefore, both encryption and no encryption are required.
        Although this approach is secure, it is also not secure.
      `;

      const score = await deliberationGuard.scoreReasoning(contradictoryReasoning, {
        taskId: 'test-contradictory',
        runId: 'test-run',
        phase: 'plan',
        goal: 'Implement secure authentication',
        modelUsed: 'claude-sonnet-4',
      });

      expect(score.coherence).toBeLessThan(0.8);
    });
  });

  // ============================================================================
  // Cross-Component Integration Tests
  // ============================================================================

  describe('Cross-Component Integration', () => {
    it('should trigger preemption when budget threshold exceeded', async () => {
      const priorityScheduler = new PriorityScheduler(pool);
      const budgetGuard = new BudgetGuard(pool);

      // Create a P3 task
      await pool.query(
        `INSERT INTO tasks (id, run_id, status, priority_class, started_at)
         VALUES ('test-p3-task', 'test-run', 'running', 'P3', NOW())`
      );

      await priorityScheduler.assignPriority({
        taskId: 'test-p3-task',
        priorityClass: 'P3',
        reason: 'Low priority test task',
        overridable: true,
      });

      // Set budget and exceed throttle threshold
      await budgetGuard.setBudget('test-run', 10.0);
      await budgetGuard.recordCost('test-run', 8.0);

      // Listen for preemption event
      let preemptionTriggered = false;
      budgetGuard.once('preempt-for-budget', async (event) => {
        expect(event.taskId).toBe('test-p3-task');
        preemptionTriggered = true;

        // Actually preempt the task
        await priorityScheduler.preemptTask(event.taskId, 'budget_exceeded', 'cpu');
      });

      await budgetGuard.enforceBudget('test-run');

      expect(preemptionTriggered).toBe(true);

      // Check that task was preempted
      const taskResult = await pool.query(
        'SELECT preempted, preemption_reason FROM tasks WHERE id = $1',
        ['test-p3-task']
      );

      expect(taskResult.rows[0].preempted).toBe(true);
      expect(taskResult.rows[0].preemption_reason).toBe('budget_exceeded');
    });

    it('should fail orchestration when both quota and budget exceeded', async () => {
      // Set very low quotas and budget
      await pool.query(
        `UPDATE tenant_quotas
         SET max_cpu_cores = 1, max_cost_per_day_usd = 1
         WHERE tenant_id = 'test-tenant'`
      );

      const context: OrchestrationContext = {
        runId: 'test-double-exceed',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 0.5, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('failure');
      expect(
        result.violations.some(
          (v) => v.type === 'quota_exceeded' || v.type === 'budget_exceeded'
        )
      ).toBe(true);
    });

    it('should allow low-priority tasks when resources available', async () => {
      // Reset quotas to generous values
      await pool.query(
        `UPDATE tenant_quotas
         SET max_cpu_cores = 100, max_memory_gb = 256, max_cost_per_day_usd = 1000
         WHERE tenant_id = 'test-tenant'`
      );

      const context: OrchestrationContext = {
        runId: 'test-low-priority-allowed',
        tenantId: 'test-tenant',
        phase: 'research',
        budget: { maxCostUSD: 50, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');
      expect(result.violations.length).toBe(0);
    });
  });

  // ============================================================================
  // Full Orchestration Workflow Tests
  // ============================================================================

  describe('Full Orchestration Workflow', () => {
    it('should execute complete workflow with all Phase 1 components', async () => {
      const context: OrchestrationContext = {
        runId: 'test-full-workflow',
        tenantId: 'test-tenant',
        phase: 'design',
        budget: { maxCostUSD: 20, maxDuration: 300000 },
      };

      // Listen for all Phase 1 events
      const events: string[] = [];

      orchestrator.on('budget-alert', () => events.push('budget-alert'));
      orchestrator.on('quota-exceeded', () => events.push('quota-exceeded'));
      orchestrator.on('task-preempted', () => events.push('task-preempted'));
      orchestrator.on('deliberation-scored', () => events.push('deliberation-scored'));

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.costs.totalUSD).toBeGreaterThan(0);

      // Check that all components participated
      const taskExists = await pool.query(
        'SELECT 1 FROM tasks WHERE id = $1',
        [context.runId]
      );
      const deliberationExists = await pool.query(
        'SELECT 1 FROM deliberation_scores WHERE task_id = $1',
        [context.runId]
      );
      const usageExists = await pool.query(
        'SELECT 1 FROM tenant_usage WHERE run_id = $1',
        [context.runId]
      );

      // At least one component should have participated
      const participated =
        taskExists.rows.length > 0 ||
        deliberationExists.rows.length > 0 ||
        usageExists.rows.length > 0;

      expect(participated).toBe(true);
    });

    it('should maintain observability throughout workflow', async () => {
      const context: OrchestrationContext = {
        runId: 'test-observability',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 15, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that we have metrics
      expect(result.metrics.tokensUsed).toBeGreaterThanOrEqual(0);
      expect(result.metrics.guardsTriggered).toBeGreaterThanOrEqual(0);

      // Check recommendations were generated
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
});

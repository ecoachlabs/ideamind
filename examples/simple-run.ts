/**
 * Simple Orchestration Run Example
 *
 * Demonstrates:
 * - Basic orchestrator setup
 * - OpenTelemetry tracing integration
 * - Idempotent task execution
 * - Budget tracking
 * - Event monitoring
 * - Database persistence
 *
 * Prerequisites:
 * - PostgreSQL running with migrations applied
 * - Redis running
 * - Jaeger running (optional, for tracing visualization)
 * - ANTHROPIC_API_KEY environment variable set
 */

import { Pool } from 'pg';
import pino from 'pino';
import { initializeTracer, getTracer } from '../packages/orchestrator-core/src/tracing';
import { IdempotencyManager } from '../packages/orchestrator-core/src/utils/idempotence';

const logger = pino({
  name: 'simple-run',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

/**
 * Main execution function
 */
async function main() {
  logger.info('🚀 Starting IdeaMine Orchestrator Example\n');

  // ========================================================================
  // 1. INITIALIZE SERVICES
  // ========================================================================

  logger.info('📦 Initializing services...');

  // Initialize OpenTelemetry tracing
  initializeTracer({
    serviceName: 'ideamine-orchestrator',
    jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    environment: process.env.NODE_ENV || 'development',
    enabled: true,
  });

  logger.info('✅ OpenTelemetry initialized');
  logger.info('   Jaeger UI: http://localhost:16686');

  // Initialize database
  const db = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ideamine',
  });

  try {
    await db.query('SELECT 1');
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error({ error }, '❌ Database connection failed');
    process.exit(1);
  }

  // Initialize idempotency manager
  const idempotencyManager = new IdempotencyManager(db, {
    ttlSeconds: 86400, // 24 hours
  });

  logger.info('✅ Idempotency manager initialized\n');

  // ========================================================================
  // 2. CREATE RUN
  // ========================================================================

  const runId = `example_run_${Date.now()}`;

  logger.info('📝 Creating orchestration run...');
  logger.info(`   Run ID: ${runId}`);

  // Create run in database
  const runResult = await db.query(
    `INSERT INTO workflow_runs (id, status, context, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    [runId, 'pending', JSON.stringify({ idea: 'Simple Todo App' })]
  );

  logger.info('✅ Run created in database\n');

  // ========================================================================
  // 3. EXECUTE WITH TRACING
  // ========================================================================

  logger.info('🔍 Starting traced execution...');

  const tracer = getTracer();

  // Create run span
  const runSpan = tracer.startRunSpan(runId, {
    'run.type': 'example',
    'run.idea': 'Simple Todo App',
  });

  try {
    // ========================================================================
    // 4. EXECUTE INTAKE PHASE
    // ========================================================================

    logger.info('\n📍 PHASE: Intake');

    const phaseSpan = tracer.startPhaseSpan(runId, 'intake', runSpan, {
      'phase.parallelism': 'sequential',
    });

    // Create phase record
    await db.query(
      `INSERT INTO phases (run_id, phase_id, status, budgets, started_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        runId,
        'intake',
        'running',
        JSON.stringify({ tokens: 50000, tools_minutes: 30 }),
      ]
    );

    logger.info('   Status: Running');
    logger.info('   Budget: 50,000 tokens, 30 minutes');

    // ========================================================================
    // 5. EXECUTE TASK WITH IDEMPOTENCY
    // ========================================================================

    logger.info('\n   📌 Task: IntakeAgent');

    const taskSpec = {
      type: 'agent' as const,
      target: 'IntakeAgent',
      input: {
        idea: {
          name: 'Simple Todo App',
          description: 'A basic todo list application',
          category: 'productivity',
        },
      },
      runId,
      phaseId: 'intake',
    };

    // Check idempotency
    const idempotencyCheck = await idempotencyManager.checkIdempotency(taskSpec);

    if (idempotencyCheck.isIdempotent) {
      logger.info('   ⚡ Using cached result (idempotent)');
      logger.info(`   Idempotency key: ${idempotencyCheck.idempotencyKey.substring(0, 16)}...`);
    } else {
      logger.info('   🔧 Executing fresh task');
      logger.info(`   Idempotency key: ${idempotencyCheck.idempotencyKey.substring(0, 16)}...`);

      // Create task span
      const taskSpan = tracer.startTaskSpan(
        runId,
        'intake',
        'task_001',
        'agent',
        'IntakeAgent',
        phaseSpan
      );

      // Simulate task execution
      const taskStartTime = Date.now();

      // Create task record
      const taskResult = await db.query(
        `INSERT INTO tasks (phase_id, run_id, type, target, input, status, idempotence_key, started_at)
         VALUES (
           (SELECT id FROM phases WHERE run_id = $1 AND phase_id = $2),
           $1, $3, $4, $5, $6, $7, NOW()
         )
         RETURNING id`,
        [
          runId,
          'intake',
          'agent',
          'IntakeAgent',
          JSON.stringify(taskSpec.input),
          'running',
          idempotencyCheck.idempotencyKey,
        ]
      );

      const taskId = taskResult.rows[0].id;

      // Simulate work
      await sleep(2000);

      // Complete task
      const taskDuration = Date.now() - taskStartTime;
      await db.query(
        `UPDATE tasks
         SET status = $1, result = $2, duration_ms = $3, tokens_used = $4, completed_at = NOW()
         WHERE id = $5`,
        [
          'completed',
          JSON.stringify({ idea_spec: { viability_score: 0.85, feasibility: 'high' } }),
          taskDuration,
          1500,
          taskId,
        ]
      );

      // End task span
      tracer.endSpan(taskSpan, {
        'task.tokens_used': 1500,
        'task.duration_ms': taskDuration,
      });

      logger.info(`   ✅ Task completed (${taskDuration}ms, 1500 tokens)`);
    }

    // ========================================================================
    // 6. COMPLETE PHASE
    // ========================================================================

    // Update phase
    await db.query(
      `UPDATE phases
       SET status = $1, completed_at = NOW(), usage = $2
       WHERE run_id = $3 AND phase_id = $4`,
      [
        'completed',
        JSON.stringify({ tokens_used: 1500, tools_minutes_used: 0.05 }),
        runId,
        'intake',
      ]
    );

    // Create evidence pack
    await db.query(
      `INSERT INTO evidence_packs (run_id, phase_id, artifacts, guard_reports)
       VALUES ($1, $2, $3, $4)`,
      [
        runId,
        'intake',
        JSON.stringify([{ type: 'IdeaSpec', id: 'artifact_001' }]),
        JSON.stringify([{ guard: 'completeness', passed: true, score: 0.95 }]),
      ]
    );

    // End phase span
    tracer.endSpan(phaseSpan, {
      'phase.status': 'completed',
      'phase.artifacts_count': 1,
    });

    logger.info('\n   ✅ Phase completed');

    // ========================================================================
    // 7. RECORD IN LEDGER
    // ========================================================================

    logger.info('\n📝 Recording to immutable ledger...');

    await db.query(
      `INSERT INTO ledger (run_id, type, data, provenance)
       VALUES ($1, $2, $3, $4)`,
      [
        runId,
        'task',
        JSON.stringify({
          task_id: 'task_001',
          type: 'agent',
          target: 'IntakeAgent',
          status: 'completed',
        }),
        JSON.stringify({
          who: 'IntakeAgent',
          when: new Date().toISOString(),
          tool_version: '1.0.0',
        }),
      ]
    );

    logger.info('   ✅ Ledger entry created');

    // ========================================================================
    // 8. RECORD METRICS
    // ========================================================================

    logger.info('\n📊 Recording phase metrics...');

    await db.query(
      `INSERT INTO phase_metrics (run_id, phase, data)
       VALUES ($1, $2, $3)`,
      [
        runId,
        'intake',
        JSON.stringify({
          duration_ms: 2000,
          tokens_used: 1500,
          cost_usd: 0.03,
          gate_pass: true,
          gate_score: 0.95,
        }),
      ]
    );

    logger.info('   ✅ Metrics recorded');

    // ========================================================================
    // 9. COMPLETE RUN
    // ========================================================================

    await db.query(
      `UPDATE workflow_runs
       SET status = $1, completed_at = NOW()
       WHERE id = $2`,
      ['completed', runId]
    );

    // End run span
    tracer.endSpan(runSpan, {
      'run.status': 'completed',
      'run.phases_completed': 1,
      'run.total_cost_usd': 0.03,
    });

    logger.info('\n✅ Run completed successfully!');

  } catch (error) {
    logger.error({ error }, '\n❌ Run failed');
    tracer.endSpanWithError(runSpan, error as Error);
    throw error;
  }

  // ========================================================================
  // 10. QUERY RESULTS
  // ========================================================================

  logger.info('\n' + '='.repeat(60));
  logger.info('📈 RUN SUMMARY');
  logger.info('='.repeat(60));

  // Get run details
  const runDetails = await db.query(
    'SELECT * FROM workflow_runs WHERE id = $1',
    [runId]
  );

  logger.info(`\nRun ID: ${runId}`);
  logger.info(`Status: ${runDetails.rows[0].status}`);
  logger.info(`Created: ${runDetails.rows[0].created_at}`);
  logger.info(`Completed: ${runDetails.rows[0].completed_at}`);

  // Get phase details
  const phaseDetails = await db.query(
    'SELECT * FROM phases WHERE run_id = $1',
    [runId]
  );

  logger.info(`\nPhases: ${phaseDetails.rows.length}`);
  for (const phase of phaseDetails.rows) {
    logger.info(`  - ${phase.phase_id}: ${phase.status}`);
  }

  // Get metrics
  const metrics = await db.query(
    'SELECT * FROM phase_metrics WHERE run_id = $1',
    [runId]
  );

  logger.info('\nMetrics:');
  for (const metric of metrics.rows) {
    const data = metric.data;
    logger.info(`  ${metric.phase}:`);
    logger.info(`    Duration: ${data.duration_ms}ms`);
    logger.info(`    Tokens: ${data.tokens_used}`);
    logger.info(`    Cost: $${data.cost_usd}`);
    logger.info(`    Gate: ${data.gate_pass ? 'PASSED' : 'FAILED'} (${data.gate_score})`);
  }

  // Get ledger entries
  const ledgerCount = await db.query(
    'SELECT COUNT(*) FROM ledger WHERE run_id = $1',
    [runId]
  );

  logger.info(`\nLedger entries: ${ledgerCount.rows[0].count}`);

  // Get idempotency stats
  const idempotencyStats = await idempotencyManager.getStats();
  logger.info(`\nIdempotency:`);
  logger.info(`  Total tasks with keys: ${idempotencyStats.totalWithKeys}`);
  logger.info(`  Recent duplicates prevented: ${idempotencyStats.recentDuplicates}`);

  logger.info('\n' + '='.repeat(60));
  logger.info('📊 VIEW TRACES');
  logger.info('='.repeat(60));
  logger.info('\nJaeger UI: http://localhost:16686');
  logger.info('  1. Select service: ideamine-orchestrator');
  logger.info('  2. Click "Find Traces"');
  logger.info(`  3. Look for run: ${runId}`);

  logger.info('\n' + '='.repeat(60));
  logger.info('🎉 EXAMPLE COMPLETE');
  logger.info('='.repeat(60));

  // Cleanup
  await db.end();
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run example
 */
if (require.main === module) {
  main().catch((error) => {
    console.error('Example failed:', error);
    process.exit(1);
  });
}

export default main;

/**
 * Simple Orchestration Example: Todo App
 *
 * Complexity: Simple
 * Budget: $500
 * Timeline: 2 weeks
 * Phases: Intake → Ideation → PRD
 *
 * This example demonstrates a minimal orchestration for a simple application.
 */

import { Pool } from 'pg';
import pino from 'pino';
import { initializeTracer } from '../../packages/orchestrator-core/src/tracing';
import { EnhancedOrchestrator } from '../../packages/orchestrator-core/src/enhanced-orchestrator';

const logger = pino({
  name: 'simple-todo-app-orchestration',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

async function main() {
  logger.info('🚀 Starting Simple Todo App Orchestration\n');

  // Initialize tracing
  initializeTracer({
    serviceName: 'ideamine-orchestrator',
    jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    environment: process.env.NODE_ENV || 'development',
    enabled: true,
  });

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

  // Initialize orchestrator
  const orchestrator = new EnhancedOrchestrator({
    db,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });

  // Define idea
  const idea = {
    name: 'Simple Todo App',
    description: 'A basic todo list application for personal task management',
    target_users: 'Individual users who want to organize daily tasks',
    category: 'productivity',
    constraints: [
      'Must be mobile-first',
      'Simple and intuitive UI',
      'Offline-capable',
    ],
    budget: 500,
    timeline: '2 weeks',
  };

  logger.info({ idea }, '📝 Idea defined');

  // Execute orchestration (first 3 phases for simple app)
  const run = await orchestrator.execute({
    runId: `todo_app_${Date.now()}`,
    idea,
    phases: ['intake', 'ideation', 'prd'],
    budgets: {
      tokens: 50000,  // Lower budget for simple app
      tools_minutes: 30,
      wallclock_minutes: 60,
    },
  });

  logger.info('\n✅ Orchestration complete!');
  logger.info(`Status: ${run.status}`);
  logger.info(`Duration: ${run.duration_ms}ms`);
  logger.info(`Phases completed: ${run.phases_completed.length}`);
  logger.info(`Artifacts: ${run.artifacts.length}`);
  logger.info(`Total cost: $${run.total_cost_usd}`);

  // Display artifacts
  logger.info('\n📦 Artifacts produced:');
  for (const artifact of run.artifacts) {
    logger.info(`  - ${artifact.type}: ${artifact.id}`);
  }

  // Display evidence packs
  logger.info('\n📊 Evidence packs:');
  for (const evidence of run.evidence_packs) {
    logger.info(`  - Phase ${evidence.phase}: ${evidence.guard_reports.length} guard reports`);
  }

  logger.info('\n📊 View traces at: http://localhost:16686');

  await db.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Orchestration failed:', error);
    process.exit(1);
  });
}

export default main;

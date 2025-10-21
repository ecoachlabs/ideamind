/**
 * Medium Complexity Orchestration: IoT Dashboard
 *
 * Complexity: Medium
 * Budget: $15,000
 * Timeline: 3 months
 * Phases: Intake → Ideation → PRD → Architecture → Security → Build
 *
 * This example demonstrates a medium-complexity orchestration with
 * real-time data processing and visualization requirements.
 */

import { Pool } from 'pg';
import pino from 'pino';
import { initializeTracer } from '../../packages/orchestrator-core/src/tracing';
import { EnhancedOrchestrator } from '../../packages/orchestrator-core/src/enhanced-orchestrator';

const logger = pino({
  name: 'iot-dashboard-orchestration',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

async function main() {
  logger.info('🚀 Starting IoT Dashboard Orchestration\n');

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
    name: 'Industrial IoT Monitoring Dashboard',
    description: 'Real-time monitoring dashboard for 500+ IoT sensors with alerting and analytics',
    target_users: 'Industrial facility managers and operators',
    category: 'iot',
    scale: {
      devices: 500,
      data_frequency: 'Every 30 seconds',
      users: 50,
      uptime_requirement: '99.9%',
    },
    features: [
      'Real-time sensor data visualization',
      'Threshold-based alerting',
      'Historical data analytics',
      'Device health monitoring',
      'Multi-tenant support',
      'Mobile app for alerts',
    ],
    technical_requirements: [
      'WebSocket for real-time updates',
      'Time-series database (TimescaleDB)',
      'MQTT for device communication',
      'REST API for integrations',
      'Redis for caching and pub/sub',
    ],
    constraints: [
      'Must handle 500 sensors × 30-second intervals = ~16 data points/sec',
      'Sub-second alert latency',
      'Data retention: 1 year',
      'ISO 27001 compliance',
    ],
    budget: 15000,
    timeline: '3 months',
  };

  logger.info({ idea }, '📝 Idea defined');

  // Execute orchestration (up to build phase)
  const run = await orchestrator.execute({
    runId: `iot_dashboard_${Date.now()}`,
    idea,
    phases: ['intake', 'ideation', 'prd', 'architecture', 'security', 'build'],
    budgets: {
      tokens: 200000,  // Medium budget for complex app
      tools_minutes: 120,
      wallclock_minutes: 240,
    },
  });

  logger.info('\n✅ Orchestration complete!');
  logger.info(`Status: ${run.status}`);
  logger.info(`Duration: ${(run.duration_ms / 1000 / 60).toFixed(2)} minutes`);
  logger.info(`Phases completed: ${run.phases_completed.join(', ')}`);
  logger.info(`Artifacts: ${run.artifacts.length}`);
  logger.info(`Total cost: $${run.total_cost_usd.toFixed(2)}`);

  // Display key artifacts
  logger.info('\n📦 Key Artifacts:');
  const ideaSpec = run.artifacts.find((a: any) => a.type === 'IdeaSpec');
  const prd = run.artifacts.find((a: any) => a.type === 'PRD');
  const architecture = run.artifacts.find((a: any) => a.type === 'ArchitectureDoc');
  const securityPlan = run.artifacts.find((a: any) => a.type === 'SecurityPlan');

  if (ideaSpec) logger.info('  ✅ IdeaSpec');
  if (prd) logger.info(`  ✅ PRD (${prd.content?.user_stories?.length || 0} user stories)`);
  if (architecture) logger.info('  ✅ Architecture Document');
  if (securityPlan) logger.info('  ✅ Security Plan');

  // Display metrics
  logger.info('\n📊 Performance Metrics:');
  for (const phase of run.phases_completed) {
    const metrics = run.metrics.find((m: any) => m.phase === phase);
    if (metrics) {
      logger.info(`  ${phase}:`);
      logger.info(`    Duration: ${metrics.duration_ms}ms`);
      logger.info(`    Tokens: ${metrics.tokens_used}`);
      logger.info(`    Cost: $${metrics.cost_usd.toFixed(2)}`);
      logger.info(`    Gate: ${metrics.gate_pass ? 'PASSED' : 'FAILED'} (${metrics.gate_score})`);
    }
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

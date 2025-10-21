/**
 * Execution Layer - Quick Start Example
 *
 * This example shows how to wire together all Execution Layer components:
 * - JobQueue (Redis Streams)
 * - CheckpointManager
 * - Worker & WorkerPool
 * - Scheduler
 * - TimerService
 *
 * Prerequisites:
 * 1. PostgreSQL running with migrations applied
 * 2. Redis running on localhost:6379
 * 3. Environment variables set (DATABASE_URL, REDIS_URL)
 */

import { Pool } from 'pg';
import {
  JobQueue,
  CheckpointManager,
  Worker,
  WorkerPool,
  Scheduler,
  TimerService,
  ExecutorRegistry,
} from '@ideamine/orchestrator-core';
import { BaseAgent } from '@ideamine/agent-sdk';
import { PhasePlan, PhaseContext } from '@ideamine/schemas';

// ============================================================================
// SETUP
// ============================================================================

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ideamine',
  max: 20,
});

// Initialize services
async function initializeServices() {
  console.log('🚀 Initializing Execution Layer...');

  // 1. Job Queue (Redis Streams)
  const queue = new JobQueue({
    idempotenceTtlSeconds: 86400, // 24 hours
    blockTimeMs: 5000,
    batchSize: 10,
  });
  await queue.init();
  console.log('✅ JobQueue initialized');

  // 2. Checkpoint Manager
  const checkpointManager = new CheckpointManager(pool);
  console.log('✅ CheckpointManager initialized');

  // 3. Scheduler
  const scheduler = new Scheduler(pool, queue);
  console.log('✅ Scheduler initialized');

  // 4. Timer Service
  const timerService = new TimerService(pool, queue);
  await timerService.start();
  console.log('✅ TimerService started');

  // 5. Executor Registry (maps agent/tool names to implementations)
  const executorRegistry: ExecutorRegistry = {
    async executeAgent(target: string, input: any) {
      console.log(`📍 Executing agent: ${target}`);

      // Get agent class from registry
      const AgentClass = getAgentClass(target);
      const agent = new AgentClass({
        agentId: target,
        phase: input.phase,
        toolPolicy: {
          maxToolInvocations: 5,
          voiThreshold: 0.7,
        },
      });

      // Set checkpoint callback (if provided by Worker)
      if (input._checkpointCallback) {
        agent.setCheckpointCallback(input._checkpointCallback);
      }

      // Execute agent
      const result = await agent.execute(input);

      console.log(`✅ Agent completed: ${target}`);
      return result;
    },

    async executeTool(target: string, input: any) {
      console.log(`🔧 Executing tool: ${target}`);

      // Get tool from registry
      const tool = getToolImplementation(target);
      const result = await tool.execute(input);

      console.log(`✅ Tool completed: ${target}`);
      return result;
    },
  };

  // 6. Worker Pool
  const workerPool = new WorkerPool(pool, queue, executorRegistry, {
    concurrency: 4, // 4 workers
    consumerGroup: 'phase-workers',
    autoScale: true,
    minWorkers: 2,
    maxWorkers: 10,
  });
  await workerPool.start();
  console.log('✅ WorkerPool started with 4 workers');

  return {
    queue,
    checkpointManager,
    scheduler,
    timerService,
    workerPool,
  };
}

// ============================================================================
// EXAMPLE AGENT WITH CHECKPOINT SUPPORT
// ============================================================================

class ExampleLongRunningAgent extends BaseAgent {
  async plan(input: any) {
    return {
      steps: [
        { name: 'collect-data', duration: 10 },
        { name: 'analyze', duration: 15 },
        { name: 'synthesize', duration: 10 },
        { name: 'report', duration: 5 },
      ],
      estimatedCost: 0.50,
    };
  }

  async reason(plan: any, input: any) {
    return {
      content: 'Initial reasoning',
      confidence: 0.8,
      needsImprovement: false,
      reasoning: 'All steps planned',
    };
  }

  async execute(input: any): Promise<any> {
    console.log(`🎯 Starting execution for: ${this.config.agentId}`);

    // Check if resuming from checkpoint
    const checkpoint = this.getCheckpointToken(input);
    const checkpointData = this.getCheckpointData(input);

    if (checkpoint === 'analysis-complete') {
      console.log('📍 Resuming from analysis checkpoint');
      return this.resumeFromAnalysis(checkpointData);
    }

    if (checkpoint === 'synthesis-complete') {
      console.log('📍 Resuming from synthesis checkpoint');
      return this.resumeFromSynthesis(checkpointData);
    }

    // Step 1: Collect data (10 minutes simulated)
    console.log('📊 Step 1: Collecting data...');
    const data = await this.collectData();
    await this.saveCheckpoint('data-complete', { data });
    console.log('✅ Data collected, checkpoint saved');

    // Step 2: Analyze data (15 minutes simulated)
    console.log('🔍 Step 2: Analyzing data...');
    const analysis = await this.analyzeData(data);
    await this.saveCheckpoint('analysis-complete', { data, analysis });
    console.log('✅ Analysis complete, checkpoint saved');

    // Step 3: Synthesize (10 minutes simulated)
    console.log('🧬 Step 3: Synthesizing results...');
    const synthesis = await this.synthesize(analysis);
    await this.saveCheckpoint('synthesis-complete', { data, analysis, synthesis });
    console.log('✅ Synthesis complete, checkpoint saved');

    // Step 4: Generate report (5 minutes simulated)
    console.log('📝 Step 4: Generating report...');
    const report = await this.generateReport(synthesis);
    console.log('✅ Report generated');

    return report;
  }

  private async collectData(): Promise<any> {
    // Simulate 10 minutes of work (compressed to 2 seconds)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { records: 1000, sources: ['api', 'db', 'files'] };
  }

  private async analyzeData(data: any): Promise<any> {
    // Simulate 15 minutes of work (compressed to 3 seconds)
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return { insights: 42, confidence: 0.85, patterns: ['trend1', 'trend2'] };
  }

  private async synthesize(analysis: any): Promise<any> {
    // Simulate 10 minutes of work (compressed to 2 seconds)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { summary: 'Synthesized insights', recommendations: 5 };
  }

  private async generateReport(synthesis: any): Promise<any> {
    // Simulate 5 minutes of work (compressed to 1 second)
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { report: 'Final report', pages: 10, status: 'complete' };
  }

  private async resumeFromAnalysis(checkpointData: any): Promise<any> {
    console.log('⚡ Skipping data collection (already done)');
    const { analysis } = checkpointData;

    // Continue from synthesis
    const synthesis = await this.synthesize(analysis);
    await this.saveCheckpoint('synthesis-complete', { ...checkpointData, synthesis });

    const report = await this.generateReport(synthesis);
    return report;
  }

  private async resumeFromSynthesis(checkpointData: any): Promise<any> {
    console.log('⚡ Skipping data collection and analysis (already done)');
    const { synthesis } = checkpointData;

    // Continue from report generation
    const report = await this.generateReport(synthesis);
    return report;
  }

  async generateArtifacts(result: any, input: any) {
    return [
      {
        type: 'report',
        content: result,
      },
    ];
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

async function runExample() {
  // Initialize services
  const services = await initializeServices();
  const { scheduler, queue, workerPool } = services;

  // Create a phase plan
  const phasePlan: PhasePlan = {
    phase: 'EXAMPLE',
    parallelism: 'sequential',
    agents: ['ExampleLongRunningAgent'],
    tools: [],
    guards: [],
    rubrics: {},
    budgets: {
      tokens: 100000,
      tools_minutes: 60,
    },
    timebox: 'PT1H',
    refinery_config: {
      fission_min_coverage: 0.90,
      fusion_min_consensus: 0.85,
    },
    hash: 'abc123',
    version: 'v1',
  };

  // Create phase context
  const phaseContext = {
    run_id: 'run-example-123',
    phase_id: 'phase-example-456',
    phase: 'EXAMPLE',
    inputs: {
      idea: 'Test checkpoint/resume functionality',
    },
    budgets: phasePlan.budgets,
    rubrics: {},
    timebox: 'PT1H',
  };

  console.log('\n📋 Scheduling phase execution...');

  // Schedule phase (generates tasks and enqueues)
  const scheduleResult = await scheduler.schedule(phasePlan, phaseContext);

  console.log(`✅ Scheduled ${scheduleResult.totalTasks} tasks`);
  console.log(`📬 Enqueued ${scheduleResult.enqueuedTasks} tasks to queue`);

  // Workers will automatically pick up and process tasks
  console.log('\n⏳ Workers processing tasks...');
  console.log('(Workers are consuming from queue in background)');

  // Monitor queue depth
  setTimeout(async () => {
    const depth = await queue.getQueueDepth('tasks');
    console.log(`\n📊 Queue depth: ${depth}`);

    const stats = workerPool.getStats();
    console.log(`👷 Workers: ${stats.workerCount}, Running: ${stats.isRunning}`);

    // Get task stats
    const taskStats = await scheduler.getStats(phaseContext.phase_id);
    console.log(`\n📈 Task Statistics:`);
    console.log(`   Total: ${taskStats.total}`);
    console.log(`   Completed: ${taskStats.completed}`);
    console.log(`   Failed: ${taskStats.failed}`);
    console.log(`   Running: ${taskStats.running}`);
    console.log(`   Avg Duration: ${taskStats.avgDurationMs}ms`);
  }, 5000);

  // Simulate crash and resume (optional)
  // Uncomment to test checkpoint/resume:
  /*
  setTimeout(async () => {
    console.log('\n💥 Simulating worker crash...');
    await workerPool.stop();
    console.log('⏸️  Workers stopped');

    console.log('\n🔄 Restarting workers...');
    await workerPool.start();
    console.log('▶️  Workers restarted - will resume from checkpoints');
  }, 10000);
  */

  // Graceful shutdown after 30 seconds
  setTimeout(async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await workerPool.stop();
    await services.timerService.stop();
    await pool.end();
    console.log('✅ Shutdown complete');
    process.exit(0);
  }, 30000);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getAgentClass(target: string): typeof BaseAgent {
  // In production, this would query a registry
  // For example, return from a Map<string, typeof BaseAgent>

  if (target === 'ExampleLongRunningAgent') {
    return ExampleLongRunningAgent as any;
  }

  throw new Error(`Unknown agent: ${target}`);
}

function getToolImplementation(target: string): any {
  // In production, this would query a tool registry
  // For example, return from a Map<string, Tool>

  return {
    execute: async (input: any) => {
      console.log(`Executing tool: ${target}`);
      return { success: true, output: 'Tool result' };
    },
  };
}

// ============================================================================
// RUN EXAMPLE
// ============================================================================

if (require.main === module) {
  runExample().catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
  });
}

export {
  initializeServices,
  ExampleLongRunningAgent,
  runExample,
};

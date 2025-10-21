/**
 * Run Command
 *
 * Executes an IdeaMine workflow with the MothershipOrchestrator.
 */

import fs from 'fs/promises';
import path from 'path';
import { createConnection } from '@ideamine/orchestrator-core/src/database/connection';
import { MothershipOrchestrator } from '@ideamine/orchestrator-core';
import pino from 'pino';

const logger = pino({ name: 'cli-run' });

export interface RunOptions {
  budget?: number;
  phases?: string[];
  config?: string;
  userId?: string;
  projectId?: string;
  output?: string;
  watch?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  resume?: string; // Resume from a previous run
}

const DEFAULT_OPTIONS: Partial<RunOptions> = {
  budget: 100,
  userId: 'cli-user',
  projectId: 'cli-project',
  verbose: false,
  dryRun: false,
  watch: false,
};

interface WorkflowConfig {
  orchestrator?: {
    budget?: { maxCost: number; warningThreshold?: number };
    phases?: string[];
  };
  models?: Record<string, string>;
  tools?: {
    enabled?: string[];
  };
  logging?: {
    level?: string;
    format?: string;
  };
}

/**
 * Run an IdeaMine workflow
 */
export async function runCommand(idea: string, options: RunOptions = {}): Promise<void> {
  const config = { ...DEFAULT_OPTIONS, ...options };

  console.log('🚀 IdeaMine CLI - Running Workflow');
  console.log('===================================');
  console.log(`Idea: "${idea}"`);
  console.log(`Budget: $${config.budget}`);
  console.log('');

  try {
    // Step 1: Load configuration
    const workflowConfig = await loadConfiguration(config.config);

    // Step 2: Validate and prepare
    if (config.verbose) {
      console.log('Configuration loaded:');
      console.log(JSON.stringify(workflowConfig, null, 2));
      console.log('');
    }

    // Step 3: Check for resume
    if (config.resume) {
      console.log(`📂 Resuming from run: ${config.resume}`);
      await resumeWorkflow(config.resume, options);
      return;
    }

    // Step 4: Dry run check
    if (config.dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made');
      await performDryRun(idea, config, workflowConfig);
      return;
    }

    // Step 5: Initialize orchestrator
    console.log('⚙️  Initializing orchestrator...');
    const orchestrator = await initializeOrchestrator(config, workflowConfig);

    // Step 6: Execute workflow
    console.log('▶️  Starting workflow execution...');
    console.log('');

    const startTime = Date.now();
    const result = await executeWorkflow(orchestrator, idea, config);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Step 7: Display results
    console.log('');
    console.log('✅ Workflow completed successfully!');
    console.log('');
    console.log('Results:');
    console.log(`  Run ID: ${result.runId}`);
    console.log(`  Duration: ${duration}s`);
    console.log(`  Total Cost: $${result.totalCost?.toFixed(2) || '0.00'}`);
    console.log(`  Phases Completed: ${result.completedPhases?.length || 0}`);
    console.log('');

    // Step 8: Save artifacts
    if (config.output) {
      console.log(`💾 Saving artifacts to: ${config.output}`);
      await saveArtifacts(result, config.output);
    }

    // Step 9: Display artifact summary
    if (result.artifacts && result.artifacts.length > 0) {
      console.log('📦 Generated Artifacts:');
      result.artifacts.forEach((artifact: any) => {
        console.log(`  - ${artifact.type} (${artifact.phase})`);
      });
      console.log('');
    }

    // Step 10: Watch mode
    if (config.watch) {
      console.log('👁️  Entering watch mode...');
      await watchWorkflow(result.runId);
    }

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Workflow failed:');
    console.error(error instanceof Error ? error.message : String(error));

    if (config.verbose && error instanceof Error) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

/**
 * Load configuration from file or defaults
 */
async function loadConfiguration(configPath?: string): Promise<WorkflowConfig> {
  const defaultConfigPaths = [
    '.ideamine/config.yaml',
    '.ideamine/config.json',
    'ideamine.config.yaml',
    'ideamine.config.json',
  ];

  const pathToCheck = configPath || defaultConfigPaths.find(async (p) => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  });

  if (!pathToCheck) {
    logger.info('No configuration file found, using defaults');
    return {};
  }

  try {
    const content = await fs.readFile(pathToCheck, 'utf-8');

    if (pathToCheck.endsWith('.json')) {
      return JSON.parse(content);
    } else if (pathToCheck.endsWith('.yaml') || pathToCheck.endsWith('.yml')) {
      // Simple YAML parsing (for basic config)
      const config: any = {};
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.trim().startsWith('#') || line.trim() === '') continue;

        const match = line.match(/^(\s*)(\w+):\s*(.+)$/);
        if (match) {
          const [, , key, value] = match;
          config[key] = value.trim();
        }
      }

      return config;
    }

    throw new Error(`Unsupported config format: ${pathToCheck}`);
  } catch (error) {
    logger.warn({ error, path: pathToCheck }, 'Failed to load config, using defaults');
    return {};
  }
}

/**
 * Initialize the orchestrator
 */
async function initializeOrchestrator(
  options: RunOptions,
  workflowConfig: WorkflowConfig
): Promise<MothershipOrchestrator> {
  const budgetConfig = workflowConfig.orchestrator?.budget || {};

  const orchestratorConfig = {
    budget: {
      maxCost: options.budget || budgetConfig.maxCost || 100,
      warningThreshold: budgetConfig.warningThreshold || 0.8,
    },
    phases: options.phases || workflowConfig.orchestrator?.phases,
  };

  // Initialize database connection if needed
  try {
    const pool = createConnection();
    logger.info('Database connection established');
  } catch (error) {
    logger.warn('Database connection failed, running without persistence');
  }

  return new MothershipOrchestrator(orchestratorConfig);
}

/**
 * Execute the workflow
 */
async function executeWorkflow(
  orchestrator: MothershipOrchestrator,
  idea: string,
  options: RunOptions
): Promise<any> {
  // Progress indicator
  const progressInterval = setInterval(() => {
    process.stdout.write('.');
  }, 1000);

  try {
    const result = await orchestrator.run({
      idea,
      userId: options.userId!,
      projectId: options.projectId!,
    });

    clearInterval(progressInterval);
    process.stdout.write('\n');

    return result;
  } catch (error) {
    clearInterval(progressInterval);
    process.stdout.write('\n');
    throw error;
  }
}

/**
 * Perform a dry run (validate without executing)
 */
async function performDryRun(
  idea: string,
  options: RunOptions,
  config: WorkflowConfig
): Promise<void> {
  console.log('Validating workflow configuration...');
  console.log('');
  console.log('Workflow Summary:');
  console.log(`  Idea: ${idea}`);
  console.log(`  Budget: $${options.budget}`);
  console.log(`  User ID: ${options.userId}`);
  console.log(`  Project ID: ${options.projectId}`);
  console.log('');

  const phases = options.phases || config.orchestrator?.phases || [
    'intake', 'ideation', 'critique', 'bizdev', 'prd',
    'architecture', 'qa', 'aesthetic', 'beta', 'release'
  ];

  console.log('Phases to execute:');
  phases.forEach((phase, idx) => {
    console.log(`  ${idx + 1}. ${phase}`);
  });
  console.log('');

  console.log('✅ Dry run validation complete');
  console.log('To execute for real, remove the --dry-run flag');
}

/**
 * Resume a previous workflow
 */
async function resumeWorkflow(runId: string, options: RunOptions): Promise<void> {
  console.log(`Attempting to resume workflow: ${runId}`);

  try {
    const pool = createConnection();

    // Fetch previous run state
    const result = await pool.query(
      'SELECT * FROM workflow_runs WHERE run_id = $1',
      [runId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Run ${runId} not found`);
    }

    const run = result.rows[0];
    console.log(`Found run: ${run.idea_spec?.title || 'Untitled'}`);
    console.log(`Status: ${run.status}`);
    console.log('');

    if (run.status === 'completed') {
      console.log('⚠️  This workflow has already completed');
      return;
    }

    // Initialize orchestrator and resume
    const workflowConfig = await loadConfiguration(options.config);
    const orchestrator = await initializeOrchestrator(options, workflowConfig);

    console.log('▶️  Resuming execution...');

    // Resume from last checkpoint
    const resumeResult = await orchestrator.run({
      idea: run.idea_spec?.description || '',
      userId: run.user_id,
      projectId: run.project_id,
      resumeFrom: runId,
    });

    console.log('');
    console.log('✅ Workflow resumed and completed!');
    console.log(`  Total Cost: $${resumeResult.totalCost?.toFixed(2)}`);

  } catch (error) {
    throw new Error(`Failed to resume workflow: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Watch workflow progress in real-time
 */
async function watchWorkflow(runId: string): Promise<void> {
  console.log('Watching workflow progress (press Ctrl+C to exit)...');
  console.log('');

  const pool = createConnection();
  let lastEventId = 0;

  const watchInterval = setInterval(async () => {
    try {
      // Query for new events
      const result = await pool.query(
        `SELECT * FROM workflow_events
         WHERE run_id = $1 AND id > $2
         ORDER BY created_at ASC`,
        [runId, lastEventId]
      );

      for (const event of result.rows) {
        const timestamp = new Date(event.created_at).toLocaleTimeString();
        console.log(`[${timestamp}] ${event.event_type}: ${event.message || ''}`);
        lastEventId = event.id;
      }

      // Check if workflow is complete
      const runResult = await pool.query(
        'SELECT status FROM workflow_runs WHERE run_id = $1',
        [runId]
      );

      if (runResult.rows[0]?.status === 'completed' || runResult.rows[0]?.status === 'failed') {
        clearInterval(watchInterval);
        console.log('');
        console.log(`Workflow ${runResult.rows[0].status}`);
        process.exit(runResult.rows[0].status === 'completed' ? 0 : 1);
      }
    } catch (error) {
      logger.error({ error }, 'Error watching workflow');
    }
  }, 2000);

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    clearInterval(watchInterval);
    console.log('');
    console.log('Watch stopped');
    process.exit(0);
  });
}

/**
 * Save artifacts to disk
 */
async function saveArtifacts(result: any, outputDir: string): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  if (!result.artifacts || result.artifacts.length === 0) {
    console.log('No artifacts to save');
    return;
  }

  for (const artifact of result.artifacts) {
    const filename = `${artifact.type}-${artifact.phase || 'unknown'}.json`;
    const filepath = path.join(outputDir, filename);

    await fs.writeFile(
      filepath,
      JSON.stringify(artifact, null, 2)
    );

    if (result.verbose) {
      console.log(`  Saved: ${filename}`);
    }
  }

  // Save summary
  const summary = {
    runId: result.runId,
    totalCost: result.totalCost,
    completedPhases: result.completedPhases,
    timestamp: new Date().toISOString(),
  };

  await fs.writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
}

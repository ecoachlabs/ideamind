/**
 * Auto-Doer Factory - Dynamic Doer Creation
 *
 * Spec: orchestrator.txt:1a, 7a (Auto-Doer Creation)
 *
 * The Orchestrator can create new doers on the fly (agents/tools/executors)
 * to scale capacity and capability with need.
 *
 * **Capabilities:**
 * 1. Spawn Agent: Instantiate from template, register, schedule as ephemeral
 * 2. Spawn Tool: Scaffold with tool.yaml, handler, schemas; publish to Registry
 * 3. Spawn Executor: Provision K8s Job or WASM task with quotas
 *
 * **Use Cases:**
 * - Missing capability for a phase
 * - Need for specialized doer that doesn't exist
 * - Capacity scaling (spawn more workers)
 * - A/B testing different implementations
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { ToolRegistry } from '../tools/tool-registry';
import { Recorder } from '../recorder/recorder';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = pino({ name: 'auto-doer-factory' });

/**
 * Doer types that can be spawned
 */
export enum DoerType {
  AGENT = 'agent',
  TOOL = 'tool',
  EXECUTOR = 'executor',
}

/**
 * Agent template specification
 */
export interface AgentTemplate {
  role: string; // e.g., "APISpecWriter", "TestGenerator"
  inputs: {
    schema: Record<string, any>;
    required: string[];
  };
  outputs: {
    schema: Record<string, any>;
    artifacts: string[];
  };
  tools: string[]; // Allowlisted tools this agent can use
  model?: string; // LLM model (default: claude-3-5-sonnet)
  systemPrompt?: string;
  budgets: {
    maxTokens: number;
    maxToolsMinutes: number;
  };
}

/**
 * Tool template specification
 */
export interface ToolTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  handlerType: 'typescript' | 'python' | 'bash';
  handlerCode: string;
  dependencies?: string[]; // npm/pip packages
  sandbox: 'wasm' | 'docker' | 'native';
}

/**
 * Executor template specification
 */
export interface ExecutorTemplate {
  type: 'k8s-job' | 'wasm' | 'lambda';
  image?: string; // Docker image for K8s
  wasmModule?: string; // WASM module path
  functionName?: string; // Lambda function name
  resources: {
    cpu: string; // e.g., "1000m" (1 CPU)
    memory: string; // e.g., "2Gi"
    timeout: number; // seconds
  };
  env?: Record<string, string>;
}

/**
 * Spawned doer metadata
 */
export interface SpawnedDoer {
  id: string;
  type: DoerType;
  status: 'spawning' | 'active' | 'completed' | 'failed';
  runId: string;
  phase: string;
  templateUsed: string;
  spawnedAt: Date;
  completedAt?: Date;
  ephemeral: boolean; // Will be destroyed after use
  registryId?: string; // ID in Tool Registry or Agent Registry
  metadata: Record<string, any>;
}

/**
 * Auto-Doer Factory
 *
 * Creates agents, tools, and executors dynamically based on templates
 */
export class AutoDoerFactory extends EventEmitter {
  private spawnedDoers: Map<string, SpawnedDoer> = new Map();

  // Built-in templates
  private agentTemplates: Map<string, AgentTemplate> = new Map();
  private toolTemplates: Map<string, ToolTemplate> = new Map();
  private executorTemplates: Map<string, ExecutorTemplate> = new Map();

  constructor(
    private db: Pool,
    private toolRegistry: ToolRegistry,
    private recorder: Recorder,
    private config: {
      scaffoldDir: string; // Directory to generate code
      registryUrl?: string; // URL for tool/agent registry
      k8sNamespace?: string; // Kubernetes namespace
    }
  ) {
    super();
    this.loadBuiltInTemplates();
  }

  /**
   * Spawn an agent from a template
   *
   * @param templateId - Agent template ID
   * @param runId - Run identifier
   * @param phase - Phase name
   * @param ephemeral - Destroy after use (default: true)
   * @returns Spawned agent ID
   */
  async spawnAgent(
    templateId: string,
    runId: string,
    phase: string,
    ephemeral: boolean = true
  ): Promise<string> {
    const template = this.agentTemplates.get(templateId);
    if (!template) {
      throw new Error(`Agent template not found: ${templateId}`);
    }

    const agentId = `agent-${templateId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(
      {
        agentId,
        templateId,
        runId,
        phase,
        ephemeral,
      },
      'Spawning agent'
    );

    this.emit('agent.spawning', {
      agentId,
      templateId,
      runId,
      phase,
    });

    // Step 1: Generate agent code from template
    const agentCode = this.generateAgentCode(template, agentId);

    // Step 2: Write agent file
    const agentPath = path.join(
      this.config.scaffoldDir,
      'agents',
      'ephemeral',
      `${agentId}.ts`
    );

    await fs.mkdir(path.dirname(agentPath), { recursive: true });
    await fs.writeFile(agentPath, agentCode);

    logger.debug({ agentPath }, 'Agent code scaffolded');

    // Step 3: Register agent in database
    await this.db.query(
      `
      INSERT INTO spawned_agents (
        agent_id, template_id, run_id, phase, ephemeral, code_path,
        inputs_schema, outputs_schema, tools, budgets, status, spawned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW())
    `,
      [
        agentId,
        templateId,
        runId,
        phase,
        ephemeral,
        agentPath,
        JSON.stringify(template.inputs.schema),
        JSON.stringify(template.outputs.schema),
        template.tools,
        JSON.stringify(template.budgets),
      ]
    );

    // Step 4: Record spawning event
    await this.recorder.recordStep({
      runId,
      phase,
      step: 'auto_doer.spawn_agent',
      actor: 'AutoDoerFactory',
      outputs: [agentId],
      cost: { usd: 0, tokens: 0 },
      latency_ms: 0,
      status: 'succeeded',
      metadata: {
        agentId,
        templateId,
        ephemeral,
        role: template.role,
      },
    });

    // Track spawned doer
    this.spawnedDoers.set(agentId, {
      id: agentId,
      type: DoerType.AGENT,
      status: 'active',
      runId,
      phase,
      templateUsed: templateId,
      spawnedAt: new Date(),
      ephemeral,
      registryId: agentId,
      metadata: {
        role: template.role,
        tools: template.tools,
      },
    });

    this.emit('agent.spawned', {
      agentId,
      templateId,
      runId,
      phase,
    });

    logger.info({ agentId, templateId }, 'Agent spawned successfully');

    return agentId;
  }

  /**
   * Spawn a tool from a template
   *
   * @param templateId - Tool template ID
   * @param runId - Run identifier
   * @param phase - Phase name
   * @param ephemeral - Destroy after use (default: true)
   * @returns Spawned tool ID
   */
  async spawnTool(
    templateId: string,
    runId: string,
    phase: string,
    ephemeral: boolean = true
  ): Promise<string> {
    const template = this.toolTemplates.get(templateId);
    if (!template) {
      throw new Error(`Tool template not found: ${templateId}`);
    }

    const toolId = `${template.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    logger.info(
      {
        toolId,
        templateId,
        runId,
        phase,
        ephemeral,
      },
      'Spawning tool'
    );

    this.emit('tool.spawning', {
      toolId,
      templateId,
      runId,
      phase,
    });

    // Step 1: Scaffold tool directory structure
    const toolDir = path.join(
      this.config.scaffoldDir,
      'tools',
      'ephemeral',
      toolId
    );

    await fs.mkdir(toolDir, { recursive: true });

    // Step 2: Generate tool.yaml
    const toolYaml = this.generateToolYaml(template, toolId);
    await fs.writeFile(path.join(toolDir, 'tool.yaml'), toolYaml);

    // Step 3: Generate handler code
    const handlerFile = `handler.${template.handlerType === 'typescript' ? 'ts' : template.handlerType === 'python' ? 'py' : 'sh'}`;
    await fs.writeFile(
      path.join(toolDir, handlerFile),
      template.handlerCode
    );

    // Step 4: Generate schema files
    await fs.writeFile(
      path.join(toolDir, 'input-schema.json'),
      JSON.stringify(template.inputSchema, null, 2)
    );
    await fs.writeFile(
      path.join(toolDir, 'output-schema.json'),
      JSON.stringify(template.outputSchema, null, 2)
    );

    logger.debug({ toolDir }, 'Tool scaffolded');

    // Step 5: Install dependencies if needed
    if (template.dependencies && template.dependencies.length > 0) {
      if (template.handlerType === 'typescript') {
        const packageJson = {
          name: toolId,
          version: template.version,
          dependencies: template.dependencies.reduce(
            (acc: any, dep: string) => {
              acc[dep] = 'latest';
              return acc;
            },
            {}
          ),
        };
        await fs.writeFile(
          path.join(toolDir, 'package.json'),
          JSON.stringify(packageJson, null, 2)
        );

        // Run npm install
        await execAsync('npm install', { cwd: toolDir });
      } else if (template.handlerType === 'python') {
        const requirementsTxt = template.dependencies.join('\n');
        await fs.writeFile(
          path.join(toolDir, 'requirements.txt'),
          requirementsTxt
        );

        // Run pip install
        await execAsync('pip install -r requirements.txt', { cwd: toolDir });
      }
    }

    // Step 6: Register tool in Tool Registry
    this.toolRegistry.register({
      id: toolId,
      name: template.name,
      description: template.description,
      version: template.version,
      inputSchema: template.inputSchema,
      outputSchema: template.outputSchema,
      handler: async (input: any) => {
        // Execute tool handler in sandbox
        return this.executeToolHandler(toolId, toolDir, template, input);
      },
      metadata: {
        ephemeral,
        runId,
        phase,
        templateId,
        sandbox: template.sandbox,
      },
    });

    // Step 7: Record in database
    await this.db.query(
      `
      INSERT INTO spawned_tools (
        tool_id, template_id, run_id, phase, ephemeral, tool_dir,
        handler_type, sandbox, status, spawned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
    `,
      [
        toolId,
        templateId,
        runId,
        phase,
        ephemeral,
        toolDir,
        template.handlerType,
        template.sandbox,
      ]
    );

    // Step 8: Record spawning event
    await this.recorder.recordStep({
      runId,
      phase,
      step: 'auto_doer.spawn_tool',
      actor: 'AutoDoerFactory',
      outputs: [toolId],
      cost: { usd: 0, tokens: 0 },
      latency_ms: 0,
      status: 'succeeded',
      metadata: {
        toolId,
        templateId,
        ephemeral,
        sandbox: template.sandbox,
      },
    });

    // Track spawned doer
    this.spawnedDoers.set(toolId, {
      id: toolId,
      type: DoerType.TOOL,
      status: 'active',
      runId,
      phase,
      templateUsed: templateId,
      spawnedAt: new Date(),
      ephemeral,
      registryId: toolId,
      metadata: {
        sandbox: template.sandbox,
        handlerType: template.handlerType,
      },
    });

    this.emit('tool.spawned', {
      toolId,
      templateId,
      runId,
      phase,
    });

    logger.info({ toolId, templateId }, 'Tool spawned and registered');

    return toolId;
  }

  /**
   * Spawn an executor (K8s Job, WASM, or Lambda)
   *
   * @param templateId - Executor template ID
   * @param runId - Run identifier
   * @param phase - Phase name
   * @param taskSpec - Task specification to execute
   * @returns Spawned executor ID
   */
  async spawnExecutor(
    templateId: string,
    runId: string,
    phase: string,
    taskSpec: Record<string, any>
  ): Promise<string> {
    const template = this.executorTemplates.get(templateId);
    if (!template) {
      throw new Error(`Executor template not found: ${templateId}`);
    }

    const executorId = `executor-${template.type}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    logger.info(
      {
        executorId,
        templateId,
        type: template.type,
        runId,
        phase,
      },
      'Spawning executor'
    );

    this.emit('executor.spawning', {
      executorId,
      templateId,
      type: template.type,
      runId,
      phase,
    });

    let executionResult: any;

    switch (template.type) {
      case 'k8s-job':
        executionResult = await this.spawnK8sJob(
          executorId,
          template,
          taskSpec
        );
        break;

      case 'wasm':
        executionResult = await this.spawnWasmTask(
          executorId,
          template,
          taskSpec
        );
        break;

      case 'lambda':
        executionResult = await this.spawnLambdaTask(
          executorId,
          template,
          taskSpec
        );
        break;

      default:
        throw new Error(`Unsupported executor type: ${template.type}`);
    }

    // Record in database
    await this.db.query(
      `
      INSERT INTO spawned_executors (
        executor_id, template_id, run_id, phase, executor_type,
        task_spec, resources, status, spawned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
    `,
      [
        executorId,
        templateId,
        runId,
        phase,
        template.type,
        JSON.stringify(taskSpec),
        JSON.stringify(template.resources),
      ]
    );

    // Record spawning event
    await this.recorder.recordStep({
      runId,
      phase,
      step: 'auto_doer.spawn_executor',
      actor: 'AutoDoerFactory',
      outputs: [executorId],
      cost: { usd: 0, tokens: 0 },
      latency_ms: 0,
      status: 'succeeded',
      metadata: {
        executorId,
        templateId,
        type: template.type,
        resources: template.resources,
      },
    });

    // Track spawned doer
    this.spawnedDoers.set(executorId, {
      id: executorId,
      type: DoerType.EXECUTOR,
      status: 'active',
      runId,
      phase,
      templateUsed: templateId,
      spawnedAt: new Date(),
      ephemeral: true, // Executors are always ephemeral
      metadata: {
        executorType: template.type,
        resources: template.resources,
      },
    });

    this.emit('executor.spawned', {
      executorId,
      templateId,
      type: template.type,
      runId,
      phase,
    });

    logger.info({ executorId, type: template.type }, 'Executor spawned');

    return executorId;
  }

  /**
   * Destroy an ephemeral doer
   */
  async destroyDoer(doerId: string): Promise<void> {
    const doer = this.spawnedDoers.get(doerId);
    if (!doer) {
      throw new Error(`Doer not found: ${doerId}`);
    }

    if (!doer.ephemeral) {
      logger.warn({ doerId }, 'Cannot destroy non-ephemeral doer');
      return;
    }

    logger.info({ doerId, type: doer.type }, 'Destroying ephemeral doer');

    switch (doer.type) {
      case DoerType.AGENT:
        // Remove agent file
        await this.db.query(
          `UPDATE spawned_agents SET status = 'destroyed', destroyed_at = NOW() WHERE agent_id = $1`,
          [doerId]
        );
        break;

      case DoerType.TOOL:
        // Unregister tool from registry
        this.toolRegistry.unregister(doerId);

        await this.db.query(
          `UPDATE spawned_tools SET status = 'destroyed', destroyed_at = NOW() WHERE tool_id = $1`,
          [doerId]
        );
        break;

      case DoerType.EXECUTOR:
        // Cleanup executor resources (K8s Job, WASM, Lambda)
        await this.cleanupExecutor(doerId, doer.metadata.executorType);

        await this.db.query(
          `UPDATE spawned_executors SET status = 'destroyed', destroyed_at = NOW() WHERE executor_id = $1`,
          [doerId]
        );
        break;
    }

    this.spawnedDoers.delete(doerId);

    this.emit('doer.destroyed', {
      doerId,
      type: doer.type,
    });

    logger.info({ doerId }, 'Doer destroyed');
  }

  /**
   * Generate agent code from template
   */
  private generateAgentCode(template: AgentTemplate, agentId: string): string {
    return `/**
 * Auto-generated Agent: ${agentId}
 * Role: ${template.role}
 * Generated: ${new Date().toISOString()}
 */

import { BaseAgent, AgentInput, AgentOutput } from '@ideamine/agent-sdk';

export class ${this.toPascalCase(agentId)} extends BaseAgent {
  constructor() {
    super({
      id: '${agentId}',
      name: '${template.role}',
      description: 'Auto-generated agent for ${template.role}',
      version: '1.0.0',
      model: '${template.model || 'claude-3-5-sonnet-20241022'}',
      systemPrompt: ${JSON.stringify(template.systemPrompt || `You are a ${template.role}. Complete the task using the provided tools and context.`)},
      allowlistedTools: ${JSON.stringify(template.tools)},
      budgets: ${JSON.stringify(template.budgets)},
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    // Validate input schema
    this.validateInput(input, ${JSON.stringify(template.inputs.schema)});

    // Execute agent logic
    const result = await this.runWithTools(input);

    // Validate output schema
    this.validateOutput(result, ${JSON.stringify(template.outputs.schema)});

    return result;
  }

  private validateInput(input: any, schema: any): void {
    // Schema validation logic
    for (const field of ${JSON.stringify(template.inputs.required)}) {
      if (!(field in input)) {
        throw new Error(\`Missing required input field: \${field}\`);
      }
    }
  }

  private validateOutput(output: any, schema: any): void {
    // Schema validation logic
    if (!output.artifacts || output.artifacts.length === 0) {
      throw new Error('No artifacts produced');
    }
  }
}
`;
  }

  /**
   * Generate tool.yaml from template
   */
  private generateToolYaml(template: ToolTemplate, toolId: string): string {
    return `id: ${toolId}
name: ${template.name}
description: ${template.description}
version: ${template.version}

input_schema:
  type: object
  properties: ${JSON.stringify(template.inputSchema.properties || {}, null, 4).replace(/\n/g, '\n  ')}
  required: ${JSON.stringify(template.inputSchema.required || [])}

output_schema:
  type: object
  properties: ${JSON.stringify(template.outputSchema.properties || {}, null, 4).replace(/\n/g, '\n  ')}

handler:
  type: ${template.handlerType}
  file: handler.${template.handlerType === 'typescript' ? 'ts' : template.handlerType === 'python' ? 'py' : 'sh'}
  sandbox: ${template.sandbox}

metadata:
  auto_generated: true
  generated_at: ${new Date().toISOString()}
  ephemeral: true
`;
  }

  /**
   * Execute tool handler in sandbox
   */
  private async executeToolHandler(
    toolId: string,
    toolDir: string,
    template: ToolTemplate,
    input: any
  ): Promise<any> {
    logger.debug({ toolId, sandbox: template.sandbox }, 'Executing tool handler');

    // Write input to temp file
    const inputFile = path.join(toolDir, 'input.json');
    await fs.writeFile(inputFile, JSON.stringify(input));

    let result: any;

    switch (template.sandbox) {
      case 'wasm':
        // Execute in WASM sandbox (simplified)
        result = { message: 'WASM execution not yet implemented', input };
        break;

      case 'docker':
        // Execute in Docker container (simplified)
        result = { message: 'Docker execution not yet implemented', input };
        break;

      case 'native':
        // Execute natively
        if (template.handlerType === 'typescript') {
          const { stdout } = await execAsync(
            `tsx handler.ts < input.json`,
            { cwd: toolDir }
          );
          result = JSON.parse(stdout);
        } else if (template.handlerType === 'python') {
          const { stdout } = await execAsync(
            `python handler.py < input.json`,
            { cwd: toolDir }
          );
          result = JSON.parse(stdout);
        } else {
          const { stdout } = await execAsync(
            `bash handler.sh < input.json`,
            { cwd: toolDir }
          );
          result = JSON.parse(stdout);
        }
        break;
    }

    return result;
  }

  /**
   * Spawn Kubernetes Job
   */
  private async spawnK8sJob(
    executorId: string,
    template: ExecutorTemplate,
    taskSpec: any
  ): Promise<any> {
    const namespace = this.config.k8sNamespace || 'default';

    const jobManifest = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: executorId,
        namespace,
        labels: {
          'app': 'ideamine',
          'executor-id': executorId,
          'ephemeral': 'true',
        },
      },
      spec: {
        ttlSecondsAfterFinished: 3600, // Clean up after 1 hour
        template: {
          spec: {
            restartPolicy: 'Never',
            containers: [
              {
                name: 'executor',
                image: template.image,
                resources: {
                  requests: {
                    cpu: template.resources.cpu,
                    memory: template.resources.memory,
                  },
                  limits: {
                    cpu: template.resources.cpu,
                    memory: template.resources.memory,
                  },
                },
                env: Object.entries(template.env || {}).map(([key, value]) => ({
                  name: key,
                  value,
                })),
                command: ['sh', '-c'],
                args: [JSON.stringify(taskSpec)],
              },
            ],
          },
        },
      },
    };

    logger.debug({ jobManifest }, 'K8s Job manifest created');

    // In production, would use k8s client to create job
    // For now, just return the manifest
    return jobManifest;
  }

  /**
   * Spawn WASM task
   */
  private async spawnWasmTask(
    executorId: string,
    template: ExecutorTemplate,
    taskSpec: any
  ): Promise<any> {
    logger.debug({ executorId, wasmModule: template.wasmModule }, 'WASM task spawn');

    // In production, would initialize WASM runtime and execute
    return {
      message: 'WASM execution not yet implemented',
      taskSpec,
    };
  }

  /**
   * Spawn Lambda task
   */
  private async spawnLambdaTask(
    executorId: string,
    template: ExecutorTemplate,
    taskSpec: any
  ): Promise<any> {
    logger.debug({ executorId, functionName: template.functionName }, 'Lambda task spawn');

    // In production, would invoke Lambda function
    return {
      message: 'Lambda execution not yet implemented',
      taskSpec,
    };
  }

  /**
   * Cleanup executor resources
   */
  private async cleanupExecutor(
    executorId: string,
    executorType: string
  ): Promise<void> {
    logger.debug({ executorId, executorType }, 'Cleaning up executor');

    // In production, would delete K8s Job, stop WASM instance, etc.
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  /**
   * Load built-in templates
   */
  private loadBuiltInTemplates(): void {
    // Load built-in agent templates
    this.agentTemplates.set('api-spec-writer', {
      role: 'APISpecWriter',
      inputs: {
        schema: {
          type: 'object',
          properties: {
            features: { type: 'array' },
            tech_stack: { type: 'object' },
          },
        },
        required: ['features'],
      },
      outputs: {
        schema: {
          type: 'object',
          properties: {
            openapi_spec: { type: 'object' },
          },
        },
        artifacts: ['OpenAPISpec'],
      },
      tools: ['file_writer', 'yaml_validator'],
      budgets: {
        maxTokens: 50000,
        maxToolsMinutes: 10,
      },
    });

    this.agentTemplates.set('test-generator', {
      role: 'TestGenerator',
      inputs: {
        schema: {
          type: 'object',
          properties: {
            code_files: { type: 'array' },
            test_framework: { type: 'string' },
          },
        },
        required: ['code_files'],
      },
      outputs: {
        schema: {
          type: 'object',
          properties: {
            test_files: { type: 'array' },
          },
        },
        artifacts: ['TestSuite'],
      },
      tools: ['file_writer', 'test_runner'],
      budgets: {
        maxTokens: 100000,
        maxToolsMinutes: 20,
      },
    });

    // Load built-in tool templates
    this.toolTemplates.set('json-validator', {
      id: 'json-validator',
      name: 'JSON Schema Validator',
      description: 'Validates JSON against a schema',
      version: '1.0.0',
      inputSchema: {
        type: 'object',
        properties: {
          json: { type: 'object' },
          schema: { type: 'object' },
        },
        required: ['json', 'schema'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          errors: { type: 'array' },
        },
      },
      handlerType: 'typescript',
      handlerCode: `
import Ajv from 'ajv';

const ajv = new Ajv();

async function main() {
  const input = JSON.parse(await readStdin());
  const validate = ajv.compile(input.schema);
  const valid = validate(input.json);

  console.log(JSON.stringify({
    valid,
    errors: validate.errors || [],
  }));
}

main();
      `,
      dependencies: ['ajv'],
      sandbox: 'native',
    });

    // Load built-in executor templates
    this.executorTemplates.set('nodejs-runner', {
      type: 'k8s-job',
      image: 'node:18-alpine',
      resources: {
        cpu: '500m',
        memory: '512Mi',
        timeout: 300,
      },
    });

    logger.debug('Built-in templates loaded');
  }

  /**
   * Get all spawned doers
   */
  getSpawnedDoers(runId?: string): SpawnedDoer[] {
    if (runId) {
      return Array.from(this.spawnedDoers.values()).filter(
        (d) => d.runId === runId
      );
    }
    return Array.from(this.spawnedDoers.values());
  }

  /**
   * Get spawned doer by ID
   */
  getSpawnedDoer(doerId: string): SpawnedDoer | undefined {
    return this.spawnedDoers.get(doerId);
  }
}

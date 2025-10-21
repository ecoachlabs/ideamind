/**
 * Model Router Agent
 *
 * Roadmap: M1 - Autonomy Core
 *
 * Routes tasks to best LLM (or local) by skill/cost/policy.
 * Inputs: { taskAffinity, size, tools, privacyMode }
 * Outputs: { selectedModel, rationale, fallbackList }
 *
 * Features:
 * - Health-aware failover
 * - Skill tags (code, long-context, tool-use)
 * - Cost caps per tenant
 *
 * Acceptance:
 * - 99% of tasks pick a healthy model
 * - cost/run ≤ budget
 * - failover works in chaos test
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'model-router' });

// ============================================================================
// Types
// ============================================================================

export type TaskAffinity =
  | 'code_generation'
  | 'code_review'
  | 'long_context'
  | 'tool_use'
  | 'reasoning'
  | 'creativity'
  | 'analysis'
  | 'translation'
  | 'general';

export type PrivacyMode = 'public' | 'confidential' | 'local_only';

export interface ModelCapabilities {
  maxTokens: number;
  supportedTools: boolean;
  codeOptimized: boolean;
  costPerMToken: number; // Cost per million tokens
  latencyP95Ms: number;
  skills: TaskAffinity[];
}

export interface ModelHealth {
  modelId: string;
  isHealthy: boolean;
  lastCheck: Date;
  errorRate: number;
  avgLatencyMs: number;
  availability: number; // 0.0 to 1.0
}

export interface RoutingRequest {
  taskAffinity: TaskAffinity;
  estimatedTokens: number;
  requiresTools: boolean;
  privacyMode: PrivacyMode;
  maxCostUSD?: number;
  maxLatencyMs?: number;
  tenantId?: string;
}

export interface RoutingDecision {
  selectedModel: string;
  rationale: string;
  fallbackList: string[];
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number; // 0.0 to 1.0
}

// ============================================================================
// Model Registry
// ============================================================================

export class ModelRegistry {
  private models: Map<string, ModelCapabilities> = new Map();
  private health: Map<string, ModelHealth> = new Map();

  constructor(private db: Pool) {
    this.registerDefaultModels();
  }

  private registerDefaultModels() {
    // Anthropic Claude models
    this.register('claude-sonnet-4.5', {
      maxTokens: 200000,
      supportedTools: true,
      codeOptimized: true,
      costPerMToken: 3.0, // $3 per million input tokens (example)
      latencyP95Ms: 2000,
      skills: ['code_generation', 'code_review', 'tool_use', 'reasoning', 'analysis'],
    });

    this.register('claude-sonnet-3.5', {
      maxTokens: 200000,
      supportedTools: true,
      codeOptimized: true,
      costPerMToken: 3.0,
      latencyP95Ms: 1800,
      skills: ['code_generation', 'code_review', 'tool_use', 'reasoning', 'analysis'],
    });

    this.register('claude-opus-3', {
      maxTokens: 200000,
      supportedTools: true,
      codeOptimized: true,
      costPerMToken: 15.0,
      latencyP95Ms: 3000,
      skills: [
        'long_context',
        'reasoning',
        'code_generation',
        'code_review',
        'tool_use',
        'analysis',
      ],
    });

    this.register('claude-haiku-3', {
      maxTokens: 200000,
      supportedTools: true,
      codeOptimized: false,
      costPerMToken: 0.25,
      latencyP95Ms: 800,
      skills: ['general', 'tool_use', 'analysis'],
    });

    // OpenAI models
    this.register('gpt-4-turbo', {
      maxTokens: 128000,
      supportedTools: true,
      codeOptimized: true,
      costPerMToken: 10.0,
      latencyP95Ms: 2500,
      skills: ['code_generation', 'reasoning', 'tool_use', 'analysis'],
    });

    this.register('gpt-3.5-turbo', {
      maxTokens: 16000,
      supportedTools: true,
      codeOptimized: false,
      costPerMToken: 0.5,
      latencyP95Ms: 1000,
      skills: ['general', 'tool_use'],
    });

    // Local models (for privacy mode)
    this.register('local-codellama-34b', {
      maxTokens: 16000,
      supportedTools: false,
      codeOptimized: true,
      costPerMToken: 0, // No API cost
      latencyP95Ms: 5000,
      skills: ['code_generation', 'code_review'],
    });

    // Initialize health for all models
    for (const modelId of this.models.keys()) {
      this.health.set(modelId, {
        modelId,
        isHealthy: true,
        lastCheck: new Date(),
        errorRate: 0,
        avgLatencyMs: this.models.get(modelId)!.latencyP95Ms,
        availability: 1.0,
      });
    }
  }

  register(modelId: string, capabilities: ModelCapabilities) {
    this.models.set(modelId, capabilities);
  }

  getCapabilities(modelId: string): ModelCapabilities | undefined {
    return this.models.get(modelId);
  }

  getHealth(modelId: string): ModelHealth | undefined {
    return this.health.get(modelId);
  }

  getAllHealthy(): string[] {
    return Array.from(this.health.entries())
      .filter(([_, health]) => health.isHealthy && health.availability >= 0.95)
      .map(([modelId, _]) => modelId);
  }

  updateHealth(modelId: string, update: Partial<ModelHealth>) {
    const current = this.health.get(modelId);
    if (current) {
      this.health.set(modelId, {
        ...current,
        ...update,
        lastCheck: new Date(),
      });
    }
  }

  /**
   * Mark model as unhealthy (e.g., after failures)
   */
  markUnhealthy(modelId: string, reason: string) {
    this.updateHealth(modelId, { isHealthy: false, availability: 0 });
    logger.warn({ modelId, reason }, 'Model marked unhealthy');
  }

  /**
   * Restore model to healthy (e.g., after recovery)
   */
  markHealthy(modelId: string) {
    this.updateHealth(modelId, { isHealthy: true, availability: 1.0, errorRate: 0 });
    logger.info({ modelId }, 'Model restored to healthy');
  }
}

// ============================================================================
// Model Router Agent
// ============================================================================

export class ModelRouterAgent extends EventEmitter {
  private registry: ModelRegistry;
  private costBudgets: Map<string, number> = new Map(); // tenantId → remaining budget

  constructor(private db: Pool) {
    super();
    this.registry = new ModelRegistry(db);
    this.startHealthCheck();
  }

  /**
   * Route a task to the best model
   */
  async route(request: RoutingRequest): Promise<RoutingDecision> {
    logger.debug({ request }, 'Routing task');

    // Filter by privacy mode
    const privacyCandidates = this.filterByPrivacy(request.privacyMode);

    // Filter by capabilities
    const capableCandidates = this.filterByCapabilities(privacyCandidates, request);

    // Filter by health
    const healthyCandidates = this.filterByHealth(capableCandidates);

    if (healthyCandidates.length === 0) {
      throw new Error('No healthy models available for request');
    }

    // Score and rank candidates
    const ranked = this.rankCandidates(healthyCandidates, request);

    // Select best model
    const selected = ranked[0];
    const fallbackList = ranked.slice(1, 4).map((c) => c.modelId);

    // Check cost budget
    if (request.tenantId && request.maxCostUSD) {
      const remaining = this.costBudgets.get(request.tenantId) || request.maxCostUSD;
      if (selected.estimatedCost > remaining) {
        // Try cheaper fallback
        const cheaper = ranked.find((c) => c.estimatedCost <= remaining);
        if (!cheaper) {
          throw new Error('Cost budget exceeded, no cheaper models available');
        }
        return {
          selectedModel: cheaper.modelId,
          rationale: `Selected ${cheaper.modelId} (cheaper fallback) due to budget constraints`,
          fallbackList: ranked.slice(1, 4).map((c) => c.modelId),
          estimatedCost: cheaper.estimatedCost,
          estimatedLatency: cheaper.estimatedLatency,
          confidence: cheaper.score,
        };
      }
    }

    logger.info(
      {
        selected: selected.modelId,
        cost: selected.estimatedCost,
        latency: selected.estimatedLatency,
      },
      'Model selected'
    );

    return {
      selectedModel: selected.modelId,
      rationale: `Selected ${selected.modelId} for ${request.taskAffinity} (score: ${selected.score.toFixed(2)})`,
      fallbackList,
      estimatedCost: selected.estimatedCost,
      estimatedLatency: selected.estimatedLatency,
      confidence: selected.score,
    };
  }

  /**
   * Record actual usage for budget tracking
   */
  async recordUsage(tenantId: string, modelId: string, actualTokens: number, costUSD: number) {
    // Deduct from budget
    const current = this.costBudgets.get(tenantId) || 0;
    this.costBudgets.set(tenantId, current - costUSD);

    // Store in database
    await this.db.query(
      `
      INSERT INTO model_usage (tenant_id, model_id, tokens, cost_usd, timestamp)
      VALUES ($1, $2, $3, $4, NOW())
    `,
      [tenantId, modelId, actualTokens, costUSD]
    );

    // Update model health with actual latency
    // (would come from separate telemetry)
  }

  /**
   * Set cost budget for tenant
   */
  setBudget(tenantId: string, budgetUSD: number) {
    this.costBudgets.set(tenantId, budgetUSD);
  }

  /**
   * Failover to next model in fallback list
   */
  async failover(
    originalDecision: RoutingDecision,
    reason: string
  ): Promise<RoutingDecision> {
    logger.warn(
      { original: originalDecision.selectedModel, reason },
      'Failing over to fallback model'
    );

    // Mark original model as unhealthy
    this.registry.markUnhealthy(originalDecision.selectedModel, reason);

    // Select first fallback
    if (originalDecision.fallbackList.length === 0) {
      throw new Error('No fallback models available');
    }

    const fallbackModel = originalDecision.fallbackList[0];
    const capabilities = this.registry.getCapabilities(fallbackModel);

    if (!capabilities) {
      throw new Error(`Fallback model ${fallbackModel} not found in registry`);
    }

    return {
      selectedModel: fallbackModel,
      rationale: `Failover to ${fallbackModel} due to: ${reason}`,
      fallbackList: originalDecision.fallbackList.slice(1),
      estimatedCost: capabilities.costPerMToken * 1000, // Rough estimate
      estimatedLatency: capabilities.latencyP95Ms,
      confidence: 0.8, // Lower confidence for failover
    };
  }

  // =========================================================================
  // Private Helper Methods
  // =========================================================================

  private filterByPrivacy(privacyMode: PrivacyMode): string[] {
    const allModels = Array.from(this.registry['models'].keys());

    if (privacyMode === 'local_only') {
      return allModels.filter((id) => id.startsWith('local-'));
    }

    if (privacyMode === 'confidential') {
      // Only use models with strict data policies (exclude free tiers)
      return allModels.filter((id) => !id.includes('3.5') && !id.includes('haiku'));
    }

    return allModels;
  }

  private filterByCapabilities(
    candidates: string[],
    request: RoutingRequest
  ): string[] {
    return candidates.filter((modelId) => {
      const caps = this.registry.getCapabilities(modelId);
      if (!caps) return false;

      // Check token limit
      if (request.estimatedTokens > caps.maxTokens) return false;

      // Check tools requirement
      if (request.requiresTools && !caps.supportedTools) return false;

      // Check skill match
      if (!caps.skills.includes(request.taskAffinity) && !caps.skills.includes('general')) {
        return false;
      }

      return true;
    });
  }

  private filterByHealth(candidates: string[]): string[] {
    return candidates.filter((modelId) => {
      const health = this.registry.getHealth(modelId);
      return health && health.isHealthy && health.availability >= 0.95;
    });
  }

  private rankCandidates(
    candidates: string[],
    request: RoutingRequest
  ): Array<{
    modelId: string;
    score: number;
    estimatedCost: number;
    estimatedLatency: number;
  }> {
    const scored = candidates.map((modelId) => {
      const caps = this.registry.getCapabilities(modelId)!;
      const health = this.registry.getHealth(modelId)!;

      // Scoring formula (higher is better)
      let score = 0;

      // Skill match (50% weight)
      const skillMatch = caps.skills.includes(request.taskAffinity) ? 1.0 : 0.5;
      score += skillMatch * 50;

      // Cost efficiency (30% weight)
      const costScore = 1 / (1 + caps.costPerMToken / 10); // Normalize
      score += costScore * 30;

      // Latency (10% weight)
      const latencyScore = 1 / (1 + caps.latencyP95Ms / 10000);
      score += latencyScore * 10;

      // Health (10% weight)
      score += health.availability * 10;

      // Penalties
      if (request.maxLatencyMs && caps.latencyP95Ms > request.maxLatencyMs) {
        score *= 0.5;
      }

      const estimatedCost = (request.estimatedTokens / 1000000) * caps.costPerMToken;
      const estimatedLatency = caps.latencyP95Ms;

      return {
        modelId,
        score,
        estimatedCost,
        estimatedLatency,
      };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Periodic health check (every 60s)
   */
  private startHealthCheck() {
    setInterval(async () => {
      // TODO: Implement actual health checks
      // For now, models stay healthy unless explicitly marked unhealthy
      logger.debug('Health check tick');
    }, 60000);
  }

  /**
   * Get registry (for testing/admin)
   */
  getRegistry(): ModelRegistry {
    return this.registry;
  }
}

// ============================================================================
// Database Migration (add model_usage table)
// ============================================================================

export const MODEL_USAGE_MIGRATION = `
-- Model usage tracking
CREATE TABLE IF NOT EXISTS model_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255),
  model_id VARCHAR(100) NOT NULL,
  tokens INTEGER NOT NULL,
  cost_usd NUMERIC(10, 4) NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_model_usage_tenant ON model_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_model ON model_usage(model_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_timestamp ON model_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_model_usage_run ON model_usage(run_id);

COMMENT ON TABLE model_usage IS 'Tracks model usage and costs for routing decisions';
`;

/**
 * Explain Agent
 *
 * Provides explainability for system decisions through trace-to-knowledge mapping.
 * Records decisions with context and generates audience-targeted explanations.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'explain-agent' });

export interface DecisionExplanation {
  decision: string;
  rationale: string;
  alternatives: string[];
  traceToKnowledgeMap?: string;
}

export interface Decision {
  decisionId: string;
  runId?: string;
  taskId?: string;
  tenantId?: string;
  decisionType: 'model_selection' | 'routing' | 'preemption' | 'quota' | 'budget' | 'quality' | 'other';
  decisionMaker: string; // Component that made decision
  decisionSummary: string;
  rationale: string;
  inputContext: Record<string, any>;
  constraints?: Record<string, any>;
  alternatives: Array<{option: string; score?: number; reason?: string}>;
  selectedOption: string;
  outcome?: 'success' | 'failure' | 'partial' | 'reverted' | 'unknown';
  outcomeMetrics?: Record<string, number>;
  knowledgeMapRefs?: string[];
  parentDecisionId?: string;
  decidedAt: Date;
}

export interface ExplanationOptions {
  audience?: 'developer' | 'product' | 'executive' | 'customer';
  format?: 'summary' | 'detailed' | 'technical' | 'business';
  includeAlternatives?: boolean;
  includeTrace?: boolean;
}

export interface DecisionStats {
  totalDecisions: number;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  avgOutcomeMetrics: Record<string, number>;
}

// Keep backward compatibility
export type Explanation = DecisionExplanation;

const DEFAULT_EXPLANATION_OPTIONS: ExplanationOptions = {
  audience: 'developer',
  format: 'detailed',
  includeAlternatives: true,
  includeTrace: true,
};

export class ExplainAgent extends EventEmitter {
  constructor(private pool: Pool) {
    super();
  }

  /**
   * Record a decision for explainability
   */
  async recordDecision(decision: Omit<Decision, 'decidedAt'>): Promise<string> {
    logger.info({ decisionId: decision.decisionId, type: decision.decisionType }, 'Recording decision');

    await this.pool.query(
      `INSERT INTO decisions
       (decision_id, run_id, task_id, tenant_id, decision_type, decision_maker,
        decision_summary, rationale, input_context, constraints, alternatives,
        selected_option, outcome, outcome_metrics, knowledge_map_refs, parent_decision_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        decision.decisionId,
        decision.runId || null,
        decision.taskId || null,
        decision.tenantId || null,
        decision.decisionType,
        decision.decisionMaker,
        decision.decisionSummary,
        decision.rationale,
        JSON.stringify(decision.inputContext),
        JSON.stringify(decision.constraints || {}),
        JSON.stringify(decision.alternatives),
        decision.selectedOption,
        decision.outcome || null,
        JSON.stringify(decision.outcomeMetrics || {}),
        JSON.stringify(decision.knowledgeMapRefs || []),
        decision.parentDecisionId || null,
      ]
    );

    this.emit('decision-recorded', { decisionId: decision.decisionId });

    logger.debug({ decisionId: decision.decisionId }, 'Decision recorded');

    return decision.decisionId;
  }

  /**
   * Update decision outcome
   */
  async updateOutcome(
    decisionId: string,
    outcome: Decision['outcome'],
    metrics?: Record<string, number>
  ): Promise<void> {
    await this.pool.query(
      `UPDATE decisions
       SET outcome = $1, outcome_metrics = $2
       WHERE decision_id = $3`,
      [outcome, JSON.stringify(metrics || {}), decisionId]
    );

    // Invalidate cached explanations
    await this.invalidateCache(decisionId);

    logger.info({ decisionId, outcome }, 'Decision outcome updated');
  }

  /**
   * Explain a decision
   */
  async explainDecision(
    decisionId: string,
    options: ExplanationOptions = {}
  ): Promise<DecisionExplanation> {
    const opts = { ...DEFAULT_EXPLANATION_OPTIONS, ...options };

    logger.info({ decisionId, audience: opts.audience, format: opts.format }, 'Explaining decision');

    // Check cache first
    const cached = await this.getCachedExplanation(decisionId, opts.format!, opts.audience!);
    if (cached) {
      logger.debug({ decisionId }, 'Using cached explanation');
      return this.parseExplanation(cached);
    }

    // Fetch decision from database
    const result = await this.pool.query(
      'SELECT * FROM decisions WHERE decision_id = $1',
      [decisionId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    const decision = this.mapRowToDecision(result.rows[0]);

    // Generate explanation based on audience and format
    const explanation = this.generateExplanation(decision, opts);

    // Cache the explanation
    await this.cacheExplanation(decisionId, opts.format!, opts.audience!, JSON.stringify(explanation));

    this.emit('explanation-generated', { decisionId, audience: opts.audience, format: opts.format });

    return explanation;
  }

  /**
   * Generate explanation based on audience and format
   */
  private generateExplanation(decision: Decision, options: ExplanationOptions): DecisionExplanation {
    const { audience, format, includeAlternatives, includeTrace } = options;

    let explanation: DecisionExplanation;

    if (audience === 'executive' || format === 'summary') {
      explanation = this.generateExecutiveSummary(decision);
    } else if (audience === 'product' || format === 'business') {
      explanation = this.generateProductExplanation(decision);
    } else if (audience === 'customer') {
      explanation = this.generateCustomerExplanation(decision);
    } else {
      // Developer / technical
      explanation = this.generateTechnicalExplanation(decision);
    }

    // Add alternatives if requested
    if (!includeAlternatives) {
      explanation.alternatives = [];
    }

    // Remove trace if not requested
    if (!includeTrace) {
      delete explanation.traceToKnowledgeMap;
    }

    return explanation;
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(decision: Decision): DecisionExplanation {
    return {
      decision: `${decision.decisionSummary} → ${decision.selectedOption}`,
      rationale: this.summarizeRationale(decision.rationale),
      alternatives: decision.alternatives.map(a => a.option),
      traceToKnowledgeMap: this.buildKnowledgeMapRef(decision),
    };
  }

  /**
   * Generate product explanation
   */
  private generateProductExplanation(decision: Decision): DecisionExplanation {
    const impact = decision.outcomeMetrics?.user_impact || 'unknown';
    const rationale = `${decision.rationale}\n\nUser Impact: ${impact}`;

    return {
      decision: decision.decisionSummary,
      rationale,
      alternatives: decision.alternatives.map(a =>
        `${a.option}${a.reason ? ': ' + a.reason : ''}`
      ),
      traceToKnowledgeMap: this.buildKnowledgeMapRef(decision),
    };
  }

  /**
   * Generate customer explanation
   */
  private generateCustomerExplanation(decision: Decision): DecisionExplanation {
    // Simplify for customers
    const simpleRationale = this.simplifyForCustomer(decision.rationale, decision.decisionType);

    return {
      decision: decision.decisionSummary,
      rationale: simpleRationale,
      alternatives: [], // Don't show alternatives to customers
    };
  }

  /**
   * Generate technical explanation
   */
  private generateTechnicalExplanation(decision: Decision): DecisionExplanation {
    let rationale = decision.rationale;

    // Add context details
    if (Object.keys(decision.inputContext).length > 0) {
      rationale += '\n\n**Input Context:**\n';
      rationale += Object.entries(decision.inputContext)
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join('\n');
    }

    // Add constraints
    if (decision.constraints && Object.keys(decision.constraints).length > 0) {
      rationale += '\n\n**Constraints:**\n';
      rationale += Object.entries(decision.constraints)
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join('\n');
    }

    // Add outcome metrics
    if (decision.outcomeMetrics && Object.keys(decision.outcomeMetrics).length > 0) {
      rationale += '\n\n**Outcome Metrics:**\n';
      rationale += Object.entries(decision.outcomeMetrics)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n');
    }

    return {
      decision: decision.decisionSummary,
      rationale,
      alternatives: decision.alternatives.map(a =>
        `${a.option} (score: ${a.score || 'N/A'})${a.reason ? ' - ' + a.reason : ''}`
      ),
      traceToKnowledgeMap: this.buildKnowledgeMapRef(decision),
    };
  }

  /**
   * Build knowledge map reference
   */
  private buildKnowledgeMapRef(decision: Decision): string {
    if (!decision.knowledgeMapRefs || decision.knowledgeMapRefs.length === 0) {
      return `knowledge-map://${decision.decisionType}/${decision.decisionId}`;
    }

    return decision.knowledgeMapRefs.join(', ');
  }

  /**
   * Summarize rationale for executive summary
   */
  private summarizeRationale(rationale: string): string {
    // Take first sentence or first 100 chars
    const firstSentence = rationale.split(/[.!?]/)[0];
    return firstSentence.length > 100 ? firstSentence.substring(0, 100) + '...' : firstSentence;
  }

  /**
   * Simplify explanation for customers
   */
  private simplifyForCustomer(rationale: string, type: string): string {
    const customerFriendly: Record<string, string> = {
      model_selection: 'We selected the best AI model for your request to provide optimal quality and speed.',
      routing: 'Your request was routed to the most appropriate system component.',
      preemption: 'Your task was temporarily paused to prioritize more urgent requests.',
      quota: 'Your usage limit was checked to ensure fair resource allocation.',
      budget: 'Cost controls were applied to stay within your budget.',
      quality: 'Quality checks ensured the output meets our standards.',
    };

    return customerFriendly[type] || 'A decision was made to optimize your experience.';
  }

  /**
   * Get cached explanation
   */
  private async getCachedExplanation(
    decisionId: string,
    format: string,
    audience: string
  ): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT explanation FROM explanation_cache
       WHERE decision_id = $1
         AND explanation_type = $2
         AND audience = $3
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [decisionId, format, audience]
    );

    return result.rows.length > 0 ? result.rows[0].explanation : null;
  }

  /**
   * Cache explanation
   */
  private async cacheExplanation(
    decisionId: string,
    format: string,
    audience: string,
    explanation: string
  ): Promise<void> {
    // Cache for 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO explanation_cache
       (decision_id, explanation_type, audience, explanation, format, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (decision_id, explanation_type, audience)
       DO UPDATE SET explanation = $4, generated_at = NOW(), expires_at = $6`,
      [decisionId, format, audience, explanation, 'json', expiresAt]
    );
  }

  /**
   * Invalidate cached explanations for a decision
   */
  private async invalidateCache(decisionId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM explanation_cache WHERE decision_id = $1',
      [decisionId]
    );

    logger.debug({ decisionId }, 'Cache invalidated');
  }

  /**
   * Parse cached explanation JSON
   */
  private parseExplanation(json: string): DecisionExplanation {
    try {
      return JSON.parse(json);
    } catch (err) {
      logger.warn({ err }, 'Failed to parse cached explanation');
      throw err;
    }
  }

  /**
   * Map database row to Decision object
   */
  private mapRowToDecision(row: any): Decision {
    return {
      decisionId: row.decision_id,
      runId: row.run_id,
      taskId: row.task_id,
      tenantId: row.tenant_id,
      decisionType: row.decision_type,
      decisionMaker: row.decision_maker,
      decisionSummary: row.decision_summary,
      rationale: row.rationale,
      inputContext: row.input_context,
      constraints: row.constraints,
      alternatives: row.alternatives,
      selectedOption: row.selected_option,
      outcome: row.outcome,
      outcomeMetrics: row.outcome_metrics,
      knowledgeMapRefs: row.knowledge_map_refs,
      parentDecisionId: row.parent_decision_id,
      decidedAt: row.decided_at,
    };
  }

  /**
   * Trace decision path (get parent decisions)
   */
  async traceDecisionPath(decisionId: string): Promise<Decision[]> {
    const path: Decision[] = [];
    let currentId: string | undefined = decisionId;

    while (currentId) {
      const result = await this.pool.query(
        'SELECT * FROM decisions WHERE decision_id = $1',
        [currentId]
      );

      if (result.rows.length === 0) break;

      const decision = this.mapRowToDecision(result.rows[0]);
      path.push(decision);

      currentId = decision.parentDecisionId;
    }

    return path;
  }

  /**
   * Get decision statistics
   */
  async getDecisionStats(filters?: {
    runId?: string;
    tenantId?: string;
    decisionType?: string;
  }): Promise<DecisionStats> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters?.runId) {
      conditions.push(`run_id = $${paramIndex++}`);
      values.push(filters.runId);
    }

    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      values.push(filters.tenantId);
    }

    if (filters?.decisionType) {
      conditions.push(`decision_type = $${paramIndex++}`);
      values.push(filters.decisionType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query(
      `SELECT
         COUNT(*) as total,
         decision_type,
         outcome,
         COUNT(*) OVER (PARTITION BY decision_type) as type_count,
         COUNT(*) OVER (PARTITION BY outcome) as outcome_count
       FROM decisions
       ${whereClause}`,
      values
    );

    const byType: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};

    for (const row of result.rows) {
      byType[row.decision_type] = parseInt(row.type_count);
      if (row.outcome) {
        byOutcome[row.outcome] = parseInt(row.outcome_count);
      }
    }

    return {
      totalDecisions: result.rows.length > 0 ? parseInt(result.rows[0].total) : 0,
      byType,
      byOutcome,
      avgOutcomeMetrics: {}, // Would need separate query for averages
    };
  }

  /**
   * Find similar decisions
   */
  async findSimilarDecisions(
    decisionContext: { decisionType: string; inputContext: Record<string, any> },
    limit: number = 10
  ): Promise<Decision[]> {
    // Simple implementation: find decisions of same type
    // In production, would use vector similarity or more sophisticated matching
    const result = await this.pool.query(
      `SELECT * FROM decisions
       WHERE decision_type = $1
       ORDER BY decided_at DESC
       LIMIT $2`,
      [decisionContext.decisionType, limit]
    );

    return result.rows.map(row => this.mapRowToDecision(row));
  }

  /**
   * Get recent decisions
   */
  async getRecentDecisions(limit: number = 10): Promise<Decision[]> {
    const result = await this.pool.query(
      'SELECT * FROM decisions ORDER BY decided_at DESC LIMIT $1',
      [limit]
    );

    return result.rows.map(row => this.mapRowToDecision(row));
  }
}

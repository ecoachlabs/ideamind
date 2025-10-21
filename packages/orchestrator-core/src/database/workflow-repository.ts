import { DatabaseConnection } from './connection';
import { WorkflowRunRow, PhaseExecutionRow, AgentExecutionRow, GateResultRow } from './types';
import { WorkflowRun, PhaseExecution, AgentExecution, GateResult } from '../types';
import { WorkflowState } from '@ideamine/event-schemas';

/**
 * Workflow Repository
 *
 * Manages persistence of workflow runs, phases, agents, and gates
 */
export class WorkflowRepository {
  constructor(private db: DatabaseConnection) {}

  /**
   * Create a new workflow run
   */
  async createWorkflowRun(run: WorkflowRun): Promise<void> {
    const query = `
      INSERT INTO workflow_runs (
        id, state, idea_spec_id, user_id, max_cost_usd, current_cost_usd,
        max_tokens, current_tokens, max_retries, retry_count, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await this.db.query(query, [
      run.id,
      run.state,
      run.ideaSpecId,
      run.userId,
      run.budget.maxCostUsd,
      run.budget.currentCostUsd ?? 0,
      run.budget.maxTokens,
      run.budget.currentTokens ?? 0,
      run.budget.maxRetries,
      run.retryCount,
      JSON.stringify(run.metadata ?? {}),
    ]);

    console.log(`[WorkflowRepository] Created workflow run: ${run.id}`);
  }

  /**
   * Get workflow run by ID
   */
  async getWorkflowRun(id: string): Promise<WorkflowRun | null> {
    const query = 'SELECT * FROM workflow_runs WHERE id = $1';
    const result = await this.db.query<WorkflowRunRow>(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Load related data
    const phases = await this.getPhaseExecutions(id);
    const gates = await this.getGateResults(id);
    const artifacts = await this.getArtifacts(id);

    return {
      id: row.id,
      state: row.state as WorkflowState,
      ideaSpecId: row.idea_spec_id,
      userId: row.user_id,
      budget: {
        maxCostUsd: row.max_cost_usd,
        currentCostUsd: row.current_cost_usd,
        maxTokens: row.max_tokens,
        currentTokens: row.current_tokens,
        maxRetries: row.max_retries,
      },
      phases,
      gates,
      artifacts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      retryCount: row.retry_count,
      metadata: row.metadata,
    };
  }

  /**
   * Get artifacts for a workflow run
   */
  async getArtifacts(workflowRunId: string): Promise<any[]> {
    const query = `
      SELECT
        artifact_id,
        artifact_type,
        phase_id,
        content_hash,
        storage_location,
        size_bytes,
        metadata,
        created_at
      FROM artifacts
      WHERE workflow_run_id = $1
      ORDER BY created_at ASC
    `;

    try {
      const result = await this.db.query(query, [workflowRunId]);

      return result.rows.map((row: any) => ({
        artifactId: row.artifact_id,
        artifactType: row.artifact_type,
        phaseId: row.phase_id,
        contentHash: row.content_hash,
        storageLocation: row.storage_location,
        sizeBytes: row.size_bytes,
        metadata: row.metadata,
        createdAt: row.created_at,
      }));
    } catch (error) {
      // If artifacts table doesn't exist yet, return empty array
      console.warn('[WorkflowRepository] Failed to load artifacts:', error);
      return [];
    }
  }

  /**
   * Update workflow run state
   */
  async updateWorkflowState(id: string, state: WorkflowState): Promise<void> {
    const query = `
      UPDATE workflow_runs
      SET state = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await this.db.query(query, [state, id]);

    console.log(`[WorkflowRepository] Updated workflow ${id} state to ${state}`);
  }

  /**
   * Update workflow budget
   */
  async updateWorkflowBudget(
    id: string,
    costUsd: number,
    tokens: number
  ): Promise<void> {
    const query = `
      UPDATE workflow_runs
      SET current_cost_usd = current_cost_usd + $1,
          current_tokens = current_tokens + $2,
          updated_at = NOW()
      WHERE id = $3
    `;

    await this.db.query(query, [costUsd, tokens, id]);
  }

  /**
   * Create phase execution
   */
  async createPhaseExecution(
    workflowRunId: string,
    phase: PhaseExecution
  ): Promise<number> {
    const query = `
      INSERT INTO phase_executions (
        workflow_run_id, phase_id, phase_name, state, started_at,
        completed_at, cost_usd, retry_count, error, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const result = await this.db.query<{ id: number }>(query, [
      workflowRunId,
      phase.phaseId,
      phase.phaseName,
      phase.state,
      phase.startedAt,
      phase.completedAt,
      phase.costUsd,
      phase.retryCount,
      phase.error,
      JSON.stringify(phase.artifacts ?? []),
    ]);

    return result.rows[0].id;
  }

  /**
   * Get phase executions for a workflow run
   */
  async getPhaseExecutions(workflowRunId: string): Promise<PhaseExecution[]> {
    const query = `
      SELECT * FROM phase_executions
      WHERE workflow_run_id = $1
      ORDER BY id ASC
    `;

    const result = await this.db.query<PhaseExecutionRow>(query, [workflowRunId]);

    return Promise.all(
      result.rows.map(async (row) => {
        const agents = await this.getAgentExecutions(row.id);

        return {
          phaseId: row.phase_id,
          phaseName: row.phase_name,
          state: row.state as any,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          agents,
          artifacts: [],
          costUsd: row.cost_usd,
          retryCount: row.retry_count,
          error: row.error,
        };
      })
    );
  }

  /**
   * Create agent execution
   */
  async createAgentExecution(
    phaseExecutionId: number,
    agent: AgentExecution
  ): Promise<number> {
    const query = `
      INSERT INTO agent_executions (
        phase_execution_id, agent_id, agent_type, state, started_at,
        completed_at, cost_usd, tokens_used, tools_invoked, error, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    const result = await this.db.query<{ id: number }>(query, [
      phaseExecutionId,
      agent.agentId,
      agent.agentType,
      agent.state,
      agent.startedAt,
      agent.completedAt,
      agent.costUsd,
      agent.tokensUsed,
      agent.toolsInvoked,
      agent.error,
      JSON.stringify({}),
    ]);

    return result.rows[0].id;
  }

  /**
   * Get agent executions for a phase
   */
  async getAgentExecutions(phaseExecutionId: number): Promise<AgentExecution[]> {
    const query = `
      SELECT * FROM agent_executions
      WHERE phase_execution_id = $1
      ORDER BY id ASC
    `;

    const result = await this.db.query<AgentExecutionRow>(query, [phaseExecutionId]);

    return result.rows.map((row) => ({
      agentId: row.agent_id,
      agentType: row.agent_type,
      state: row.state as any,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      costUsd: row.cost_usd,
      tokensUsed: row.tokens_used,
      toolsInvoked: row.tools_invoked,
      error: row.error,
    }));
  }

  /**
   * Create gate result
   */
  async createGateResult(
    workflowRunId: string,
    gate: GateResult
  ): Promise<void> {
    const query = `
      INSERT INTO gate_results (
        workflow_run_id, gate_id, gate_name, phase, result, score,
        human_review_required, evidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.db.query(query, [
      workflowRunId,
      gate.gateId,
      gate.gateName,
      gate.phase,
      gate.result,
      gate.score,
      gate.humanReviewRequired,
      JSON.stringify(gate.evidence),
    ]);
  }

  /**
   * Get gate results for a workflow run
   */
  async getGateResults(workflowRunId: string): Promise<GateResult[]> {
    const query = `
      SELECT * FROM gate_results
      WHERE workflow_run_id = $1
      ORDER BY evaluated_at ASC
    `;

    const result = await this.db.query<GateResultRow>(query, [workflowRunId]);

    return result.rows.map((row) => ({
      gateId: row.gate_id,
      gateName: row.gate_name,
      phase: row.phase,
      result: row.result,
      score: row.score,
      evidence: (row.evidence as any) ?? [],
      humanReviewRequired: row.human_review_required,
      evaluatedAt: row.evaluated_at,
    }));
  }

  /**
   * List workflow runs with filters
   */
  async listWorkflowRuns(options: {
    userId?: string;
    state?: WorkflowState;
    limit?: number;
    offset?: number;
  }): Promise<WorkflowRun[]> {
    // SECURITY FIX #1: Validate enum values to prevent SQL injection
    const validStates: WorkflowState[] = [
      'created',
      'running',
      'paused',
      'completed',
      'failed',
      'cancelled',
    ];

    if (options.state && !validStates.includes(options.state)) {
      throw new Error(`Invalid workflow state: ${options.state}`);
    }

    // SECURITY FIX #9: Enforce maximum limits to prevent DoS
    const MAX_LIMIT = 1000;
    const DEFAULT_LIMIT = 100;
    const limit = options.limit !== undefined
      ? Math.min(Math.max(options.limit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const offset = Math.max(options.offset ?? 0, 0);

    // PERFORMANCE FIX #5: Use JOIN to load related data in single query (no N+1)
    let query = `
      SELECT
        wr.*,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', pe.id,
            'phase_id', pe.phase_id,
            'phase_name', pe.phase_name,
            'state', pe.state,
            'started_at', pe.started_at,
            'completed_at', pe.completed_at,
            'cost_usd', pe.cost_usd,
            'retry_count', pe.retry_count,
            'error', pe.error
          )) FILTER (WHERE pe.id IS NOT NULL),
          '[]'::json
        ) as phases,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'gate_id', gr.gate_id,
            'gate_name', gr.gate_name,
            'phase', gr.phase,
            'result', gr.result,
            'score', gr.score,
            'human_review_required', gr.human_review_required,
            'evidence', gr.evidence,
            'evaluated_at', gr.evaluated_at
          )) FILTER (WHERE gr.gate_id IS NOT NULL),
          '[]'::json
        ) as gates
      FROM workflow_runs wr
      LEFT JOIN phase_executions pe ON pe.workflow_run_id = wr.id
      LEFT JOIN gate_results gr ON gr.workflow_run_id = wr.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (options.userId) {
      query += ` AND wr.user_id = $${paramIndex}`;
      params.push(options.userId);
      paramIndex++;
    }

    if (options.state) {
      query += ` AND wr.state = $${paramIndex}`;
      params.push(options.state);
      paramIndex++;
    }

    query += ' GROUP BY wr.id ORDER BY wr.created_at DESC';

    query += ` LIMIT $${paramIndex}`;
    params.push(limit);
    paramIndex++;

    query += ` OFFSET $${paramIndex}`;
    params.push(offset);

    const result = await this.db.query<any>(query, params);

    return result.rows.map((row) => this.mapRowToWorkflowRun(row));
  }

  /**
   * Map database row to WorkflowRun object
   */
  private mapRowToWorkflowRun(row: any): WorkflowRun {
    return {
      id: row.id,
      state: row.state as WorkflowState,
      ideaSpecId: row.idea_spec_id,
      userId: row.user_id,
      budget: {
        maxCostUsd: row.max_cost_usd,
        currentCostUsd: row.current_cost_usd,
        maxTokens: row.max_tokens,
        currentTokens: row.current_tokens,
        maxRetries: row.max_retries,
      },
      phases: (row.phases || []).map((p: any) => ({
        phaseId: p.phase_id,
        phaseName: p.phase_name,
        state: p.state,
        startedAt: p.started_at,
        completedAt: p.completed_at,
        agents: [],
        artifacts: [],
        costUsd: p.cost_usd,
        retryCount: p.retry_count,
        error: p.error,
      })),
      gates: (row.gates || []).map((g: any) => ({
        gateId: g.gate_id,
        gateName: g.gate_name,
        phase: g.phase,
        result: g.result,
        score: g.score,
        evidence: g.evidence ?? [],
        humanReviewRequired: g.human_review_required,
        evaluatedAt: g.evaluated_at,
      })),
      artifacts: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      retryCount: row.retry_count,
      metadata: row.metadata,
    };
  }
}

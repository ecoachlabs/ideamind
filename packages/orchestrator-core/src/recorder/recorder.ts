/**
 * Recorder - Comprehensive logging for every step, artifact, decision, score, and cost
 *
 * Records all execution details for audit trails, debugging, cost attribution,
 * and quality analysis. Follows the Level-2 microflow specification.
 *
 * Log Entry Schema:
 * - runId: Master run identifier
 * - phase: Current pipeline phase
 * - step: Specific microflow step (e.g., "tool.prd.traceMatrix")
 * - actor: Who executed (Agent, Tool, Gatekeeper, etc.)
 * - inputs/outputs: Artifact IDs
 * - score: Quality metrics
 * - cost: USD and token consumption
 * - latency_ms: Execution time
 * - decision: Why this action was taken
 * - gate: Associated gate if applicable
 * - status: succeeded | failed | retrying
 * - ts: ISO 8601 timestamp
 */

export interface RecorderLogEntry {
  runId: string;
  phase: string;
  step: string;
  actor: string;
  inputs: string[];
  outputs: string[];
  score?: Record<string, number>;
  cost: {
    usd: number;
    tokens: number;
  };
  latency_ms: number;
  decision?: string;
  gate?: string;
  status: 'succeeded' | 'failed' | 'retrying' | 'blocked';
  metadata?: Record<string, any>;
  ts: string;
}

export interface ArtifactRecord {
  id: string;
  type: string;
  runId: string;
  phase: string;
  producedBy: string;
  content?: any;
  contentHash?: string;
  size?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface DecisionRecord {
  runId: string;
  phase: string;
  actor: string;
  decisionType: 'tool_selection' | 'gate_evaluation' | 'retry' | 'escalation' | 'budget_adjustment';
  inputs: any;
  outputs: any;
  reasoning: string;
  confidence?: number;
  alternatives?: any[];
  ts: string;
}

export interface ScoreRecord {
  runId: string;
  phase: string;
  scoreType: string;
  value: number;
  target?: number;
  status: 'pass' | 'fail' | 'warn';
  details?: Record<string, any>;
  ts: string;
}

export interface CostRecord {
  runId: string;
  phase: string;
  actor: string;
  usd: number;
  tokens: number;
  budgetRemaining: {
    usd: number;
    tokens: number;
  };
  ts: string;
}

export interface RecorderStorage {
  writeLog(entry: RecorderLogEntry): Promise<void>;
  writeArtifact(record: ArtifactRecord): Promise<void>;
  writeDecision(record: DecisionRecord): Promise<void>;
  writeScore(record: ScoreRecord): Promise<void>;
  writeCost(record: CostRecord): Promise<void>;

  queryLogs(filter: Partial<RecorderLogEntry>): Promise<RecorderLogEntry[]>;
  queryArtifacts(filter: Partial<ArtifactRecord>): Promise<ArtifactRecord[]>;
  queryDecisions(filter: Partial<DecisionRecord>): Promise<DecisionRecord[]>;
  queryScores(filter: Partial<ScoreRecord>): Promise<ScoreRecord[]>;
  queryCosts(filter: Partial<CostRecord>): Promise<CostRecord[]>;
}

/**
 * In-memory storage implementation (for development/testing)
 * Production should use persistent storage (PostgreSQL, TimescaleDB, ClickHouse)
 */
export class InMemoryRecorderStorage implements RecorderStorage {
  private logs: RecorderLogEntry[] = [];
  private artifacts: ArtifactRecord[] = [];
  private decisions: DecisionRecord[] = [];
  private scores: ScoreRecord[] = [];
  private costs: CostRecord[] = [];

  async writeLog(entry: RecorderLogEntry): Promise<void> {
    this.logs.push(entry);
  }

  async writeArtifact(record: ArtifactRecord): Promise<void> {
    this.artifacts.push(record);
  }

  async writeDecision(record: DecisionRecord): Promise<void> {
    this.decisions.push(record);
  }

  async writeScore(record: ScoreRecord): Promise<void> {
    this.scores.push(record);
  }

  async writeCost(record: CostRecord): Promise<void> {
    this.costs.push(record);
  }

  async queryLogs(filter: Partial<RecorderLogEntry>): Promise<RecorderLogEntry[]> {
    return this.logs.filter((log) => this.matches(log, filter));
  }

  async queryArtifacts(filter: Partial<ArtifactRecord>): Promise<ArtifactRecord[]> {
    return this.artifacts.filter((artifact) => this.matches(artifact, filter));
  }

  async queryDecisions(filter: Partial<DecisionRecord>): Promise<DecisionRecord[]> {
    return this.decisions.filter((decision) => this.matches(decision, filter));
  }

  async queryScores(filter: Partial<ScoreRecord>): Promise<ScoreRecord[]> {
    return this.scores.filter((score) => this.matches(score, filter));
  }

  async queryCosts(filter: Partial<CostRecord>): Promise<CostRecord[]> {
    return this.costs.filter((cost) => this.matches(cost, filter));
  }

  private matches(record: any, filter: any): boolean {
    return Object.entries(filter).every(([key, value]) => record[key] === value);
  }

  // Utility methods for analysis
  getTotalCost(runId: string): { usd: number; tokens: number } {
    const costs = this.costs.filter((c) => c.runId === runId);
    return costs.reduce(
      (acc, c) => ({
        usd: acc.usd + c.usd,
        tokens: acc.tokens + c.tokens,
      }),
      { usd: 0, tokens: 0 }
    );
  }

  getPhaseMetrics(runId: string, phase: string): {
    totalCost: { usd: number; tokens: number };
    avgLatency: number;
    successRate: number;
    retryCount: number;
  } {
    const logs = this.logs.filter((l) => l.runId === runId && l.phase === phase);
    const costs = this.costs.filter((c) => c.runId === runId && c.phase === phase);

    const totalCost = costs.reduce(
      (acc, c) => ({
        usd: acc.usd + c.usd,
        tokens: acc.tokens + c.tokens,
      }),
      { usd: 0, tokens: 0 }
    );

    const avgLatency = logs.reduce((sum, l) => sum + l.latency_ms, 0) / logs.length || 0;
    const succeeded = logs.filter((l) => l.status === 'succeeded').length;
    const successRate = succeeded / logs.length || 0;
    const retryCount = logs.filter((l) => l.status === 'retrying').length;

    return { totalCost, avgLatency, successRate, retryCount };
  }

  clear(): void {
    this.logs = [];
    this.artifacts = [];
    this.decisions = [];
    this.scores = [];
    this.costs = [];
  }
}

/**
 * Recorder - Main interface for logging all system activities
 */
export class Recorder {
  constructor(private storage: RecorderStorage) {}

  /**
   * Record a step execution
   */
  async recordStep(params: {
    runId: string;
    phase: string;
    step: string;
    actor: string;
    inputs?: string[];
    outputs?: string[];
    score?: Record<string, number>;
    cost: { usd: number; tokens: number };
    latency_ms: number;
    decision?: string;
    gate?: string;
    status: 'succeeded' | 'failed' | 'retrying' | 'blocked';
    metadata?: Record<string, any>;
  }): Promise<void> {
    const entry: RecorderLogEntry = {
      ...params,
      inputs: params.inputs || [],
      outputs: params.outputs || [],
      ts: new Date().toISOString(),
    };

    await this.storage.writeLog(entry);
  }

  /**
   * Record artifact creation
   */
  async recordArtifact(params: {
    id: string;
    type: string;
    runId: string;
    phase: string;
    producedBy: string;
    content?: any;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const record: ArtifactRecord = {
      ...params,
      createdAt: new Date().toISOString(),
    };

    await this.storage.writeArtifact(record);
  }

  /**
   * Record a decision (tool selection, gate evaluation, etc.)
   */
  async recordDecision(params: {
    runId: string;
    phase: string;
    actor: string;
    decisionType: 'tool_selection' | 'gate_evaluation' | 'retry' | 'escalation' | 'budget_adjustment';
    inputs: any;
    outputs: any;
    reasoning: string;
    confidence?: number;
    alternatives?: any[];
  }): Promise<void> {
    const record: DecisionRecord = {
      ...params,
      ts: new Date().toISOString(),
    };

    await this.storage.writeDecision(record);
  }

  /**
   * Record a quality/performance score
   */
  async recordScore(params: {
    runId: string;
    phase: string;
    scoreType: string;
    value: number;
    target?: number;
    status: 'pass' | 'fail' | 'warn';
    details?: Record<string, any>;
  }): Promise<void> {
    const record: ScoreRecord = {
      ...params,
      ts: new Date().toISOString(),
    };

    await this.storage.writeScore(record);
  }

  /**
   * Record cost consumption
   */
  async recordCost(params: {
    runId: string;
    phase: string;
    actor: string;
    usd: number;
    tokens: number;
    budgetRemaining: { usd: number; tokens: number };
  }): Promise<void> {
    const record: CostRecord = {
      ...params,
      ts: new Date().toISOString(),
    };

    await this.storage.writeCost(record);
  }

  /**
   * Query methods
   */
  async getRunLogs(runId: string): Promise<RecorderLogEntry[]> {
    return this.storage.queryLogs({ runId });
  }

  async getPhaseLogs(runId: string, phase: string): Promise<RecorderLogEntry[]> {
    return this.storage.queryLogs({ runId, phase });
  }

  async getRunArtifacts(runId: string): Promise<ArtifactRecord[]> {
    return this.storage.queryArtifacts({ runId });
  }

  async getPhaseArtifacts(runId: string, phase: string): Promise<ArtifactRecord[]> {
    return this.storage.queryArtifacts({ runId, phase });
  }

  async getRunDecisions(runId: string): Promise<DecisionRecord[]> {
    return this.storage.queryDecisions({ runId });
  }

  async getRunScores(runId: string): Promise<ScoreRecord[]> {
    return this.storage.queryScores({ runId });
  }

  async getRunCosts(runId: string): Promise<CostRecord[]> {
    return this.storage.queryCosts({ runId });
  }

  /**
   * Analysis methods
   */
  async getRunSummary(runId: string): Promise<{
    totalCost: { usd: number; tokens: number };
    totalSteps: number;
    successRate: number;
    avgLatency: number;
    phaseMetrics: Record<string, any>;
  }> {
    const logs = await this.getRunLogs(runId);
    const costs = await this.getRunCosts(runId);

    const totalCost = costs.reduce(
      (acc, c) => ({
        usd: acc.usd + c.usd,
        tokens: acc.tokens + c.tokens,
      }),
      { usd: 0, tokens: 0 }
    );

    const totalSteps = logs.length;
    const succeeded = logs.filter((l) => l.status === 'succeeded').length;
    const successRate = succeeded / totalSteps || 0;
    const avgLatency = logs.reduce((sum, l) => sum + l.latency_ms, 0) / totalSteps || 0;

    const phaseMetrics: Record<string, any> = {};
    const phases = [...new Set(logs.map((l) => l.phase))];

    for (const phase of phases) {
      const phaseLogs = logs.filter((l) => l.phase === phase);
      const phaseCosts = costs.filter((c) => c.phase === phase);

      phaseMetrics[phase] = {
        steps: phaseLogs.length,
        cost: phaseCosts.reduce(
          (acc, c) => ({
            usd: acc.usd + c.usd,
            tokens: acc.tokens + c.tokens,
          }),
          { usd: 0, tokens: 0 }
        ),
        avgLatency: phaseLogs.reduce((sum, l) => sum + l.latency_ms, 0) / phaseLogs.length || 0,
        successRate:
          phaseLogs.filter((l) => l.status === 'succeeded').length / phaseLogs.length || 0,
      };
    }

    return {
      totalCost,
      totalSteps,
      successRate,
      avgLatency,
      phaseMetrics,
    };
  }
}

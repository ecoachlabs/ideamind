/**
 * Analyzer - Value-of-Information (VoI) tool selection
 *
 * Implements intelligent tool selection from the Level-2 microflow specification:
 * - Classify task → map to capability class
 * - Estimate no-tool confidence (0..1)
 * - Query Tool Registry by class; filter by allowlist
 * - Score with Value-of-Information: (error_reduction × utility) − (cost + latency_penalty + risk_penalty)
 * - Policy checks (budget, egress, PII)
 * - Invoke top tool if score ≥ threshold; evaluate improvement; keep or rollback
 *
 * Default thresholds:
 * - min_confidence_no_tool = 0.78
 * - min_score_to_invoke = 0.22
 */

import { Recorder } from '../recorder/recorder';

/**
 * Capability classes for tool categorization
 */
export enum CapabilityClass {
  // Intake
  NORMALIZER = 'intake.normalizer',
  ONTOLOGY = 'intake.ontology',
  COMPLIANCE_SWEEP = 'intake.complianceSweep',
  FEASIBILITY = 'intake.feasibility',

  // Ideation
  USECASES = 'ideation.usecases',
  PERSONAS = 'ideation.personas',
  KPI_DESIGNER = 'ideation.kpiDesigner',

  // Critique
  SOCRATIC = 'critique.socratic',
  COUNTERFACTUALS = 'critique.counterfactuals',
  PREMORTEM = 'critique.premortem',
  CLONE_SIM = 'critique.cloneSim',
  USABILITY_FRICTION = 'critique.usabilityFriction',

  // PRD
  STORY_CUTTER = 'prd.storyCutter',
  UX_FLOW = 'prd.uxFlow',
  NFR_PACK = 'prd.nfrPack',
  TRACE_MATRIX = 'prd.traceMatrix',

  // BizDev
  ICP_SEGMENTATION = 'biz.icpSegmentation',
  PRICING_WIZARD = 'biz.pricingWizard',
  LTV_CAC_MODEL = 'biz.ltvCacModel',
  GTM_PLANNER = 'biz.gtmPlanner',
  PARTNER_MAP = 'biz.partnerMap',
  GROWTH_LOOPS = 'biz.growthLoops',

  // Architecture
  C4_GENERATOR = 'arch.c4Generator',
  API_SPEC = 'arch.apiSpec',
  API_LINTER = 'arch.apiLinter',
  DATA_MODELER = 'arch.dataModeler',
  THREAT_MODELER = 'arch.threatModeler',
  SLO_PLANNER = 'arch.sloPlanner',
  OBS_PLAN = 'arch.obsPlan',
  CAPACITY_PLAN = 'arch.capacityPlan',
  COST_PLAN = 'arch.costPlan',

  // Build
  REPO_SCAFFOLD = 'build.repoScaffold',
  CI_COMPOSER = 'build.ciComposer',
  IAC_COMPOSER = 'build.iacComposer',
  SECRETS_PROVISION = 'build.secretsProvision',
  FIXTURE_SEED = 'build.fixtureSeed',
  FLAG_SEEDER = 'build.flagSeeder',

  // Code
  CODEGEN = 'code.codegen',
  UNIT_SCAFFOLD = 'code.unitScaffold',
  CONTRACT_GEN = 'code.contractGen',
  STATIC_PACK = 'code.staticPack',
  DEP_SCAN = 'code.depScan',

  // QA
  E2E = 'qa.e2e',
  VISUAL_DIFF = 'qa.visualDiff',
  FUZZ = 'qa.fuzz',
  CHAOS = 'qa.chaos',
  LOAD = 'qa.load',
  MEM_LEAK = 'qa.memLeak',
  DAST = 'qa.dast',
  FLAKY_TRIAGER = 'qa.flakyTriager',

  // Aesthetic
  TOKENS = 'aesthetic.tokens',
  THEMING = 'aesthetic.theming',
  MOTION = 'aesthetic.motion',
  AXE = 'aesthetic.axe',
  CONTRAST = 'aesthetic.contrast',
  LIGHTHOUSE = 'aesthetic.lighthouse',
  SCREENSHOT = 'aesthetic.screenshot',

  // Release
  CONTAINERIZE = 'release.containerize',
  SBOM = 'release.sbom',
  SIGN = 'release.sign',
  MIGRATION_SHADOW = 'release.migrationShadow',
  CANARY_RULES = 'release.canaryRules',
  BLUE_GREEN = 'release.blueGreen',
  ROLLBACK_PLAN = 'release.rollbackPlan',
  NOTES = 'release.notes',

  // Beta & Telemetry
  COHORT_SLICER = 'beta.cohortSlicer',
  INVITE_MANAGER = 'beta.inviteManager',
  OTA = 'beta.ota',
  SDK_PACK = 'telemetry.sdkPack',
  REDACTOR = 'telemetry.redactor',
  SESSION_REPLAY = 'telemetry.sessionReplay',

  // Feedback
  INGEST_HUB = 'feedback.ingestHub',
  CLUSTER = 'feedback.cluster',
  MIN_REPRO = 'feedback.minRepro',
  ROOT_CAUSE = 'feedback.rootCause',
  FIX_SYNTH = 'feedback.fixSynth',
  USER_COMMS = 'feedback.userComms',

  // Docs & Growth
  GENERATOR = 'docs.generator',
  TOURS = 'growth.tours',
  EXPERIMENTER = 'growth.experimenter',
  COST_ATTRIBUTION = 'fin.costAttribution',
  ANOMALY = 'fin.anomaly',
}

/**
 * Tool definition
 */
export interface Tool {
  id: string;
  name: string;
  capability: CapabilityClass;
  description: string;
  version: string;
  execute: (input: any) => Promise<ToolResult>;
  estimateCost?: (input: any) => { usd: number; tokens: number };
  estimateLatency?: (input: any) => number; // milliseconds
  requiresApproval?: boolean;
  allowedDataTypes?: string[]; // PII restrictions
}

export interface ToolResult {
  success: boolean;
  output: any;
  confidence: number; // 0-1
  metadata?: {
    cost?: { usd: number; tokens: number };
    latency_ms?: number;
    toolVersion?: string;
  };
}

/**
 * Analyzer configuration
 */
export interface AnalyzerConfig {
  minConfidenceNoTool: number; // Default: 0.78
  minScoreToInvoke: number; // Default: 0.22
  budget?: {
    remainingUsd: number;
    remainingTokens: number;
  };
  allowlist?: CapabilityClass[]; // Only allow these tools
  denylist?: CapabilityClass[]; // Never allow these tools
  piiPolicy?: {
    allowPiiEgress: boolean;
    requiresApproval: boolean;
  };
}

/**
 * VoI scoring parameters
 */
export interface VoIScore {
  score: number; // Final VoI score
  errorReduction: number; // 0-1
  utility: number; // 0-1
  cost: number; // 0-1 (normalized)
  latencyPenalty: number; // 0-1
  riskPenalty: number; // 0-1
  components: {
    benefit: number; // error_reduction × utility
    cost: number; // cost + latency_penalty + risk_penalty
  };
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  useTools: boolean;
  selectedTool?: Tool;
  noToolConfidence: number;
  voiScore?: VoIScore;
  reasoning: string;
  alternatives?: Array<{ tool: Tool; score: VoIScore }>;
}

/**
 * Analyzer - Intelligent tool selection based on Value of Information
 */
export class Analyzer {
  constructor(
    private config: AnalyzerConfig,
    private toolRegistry: Map<CapabilityClass, Tool[]>,
    private recorder?: Recorder
  ) {}

  /**
   * Analyze task and decide whether to use tools
   */
  async analyze(params: {
    runId: string;
    phase: string;
    taskDescription: string;
    requiredCapability: CapabilityClass;
    noToolConfidence: number; // Agent's confidence without tools (0-1)
    input: any;
    utility: number; // How important is this task? (0-1)
  }): Promise<AnalysisResult> {
    const { runId, phase, taskDescription, requiredCapability, noToolConfidence, input, utility } =
      params;

    // Step 1: Check if confidence is already high enough
    if (noToolConfidence >= this.config.minConfidenceNoTool) {
      const result: AnalysisResult = {
        useTools: false,
        noToolConfidence,
        reasoning: `No-tool confidence (${noToolConfidence.toFixed(2)}) meets threshold (${this.config.minConfidenceNoTool.toFixed(2)})`,
      };

      await this.recordAnalysis(runId, phase, requiredCapability, result);
      return result;
    }

    // Step 2: Query tool registry by capability
    const candidateTools = this.getEligibleTools(requiredCapability);

    if (candidateTools.length === 0) {
      const result: AnalysisResult = {
        useTools: false,
        noToolConfidence,
        reasoning: `No eligible tools found for capability: ${requiredCapability}`,
      };

      await this.recordAnalysis(runId, phase, requiredCapability, result);
      return result;
    }

    // Step 3: Score each tool with VoI
    const scoredTools = await Promise.all(
      candidateTools.map(async (tool) => ({
        tool,
        score: await this.calculateVoI(tool, noToolConfidence, utility, input),
      }))
    );

    // Sort by score descending
    scoredTools.sort((a, b) => b.score.score - a.score.score);

    // Step 4: Check if top tool meets threshold
    const topTool = scoredTools[0];
    const useTools = topTool.score.score >= this.config.minScoreToInvoke;

    const result: AnalysisResult = {
      useTools,
      selectedTool: useTools ? topTool.tool : undefined,
      noToolConfidence,
      voiScore: topTool.score,
      reasoning: useTools
        ? `Selected ${topTool.tool.name} (VoI=${topTool.score.score.toFixed(2)} ≥ ${this.config.minScoreToInvoke.toFixed(2)})`
        : `Top tool ${topTool.tool.name} VoI=${topTool.score.score.toFixed(2)} < threshold ${this.config.minScoreToInvoke.toFixed(2)}`,
      alternatives: scoredTools.slice(1, 3), // Include top 2 alternatives
    };

    await this.recordAnalysis(runId, phase, requiredCapability, result);
    return result;
  }

  /**
   * Calculate Value of Information score
   * VoI = (error_reduction × utility) − (cost + latency_penalty + risk_penalty)
   */
  private async calculateVoI(
    tool: Tool,
    noToolConfidence: number,
    utility: number,
    input: any
  ): Promise<VoIScore> {
    // Error reduction: how much tool improves confidence
    // Assume tool can achieve ~0.95 confidence (conservative)
    const expectedToolConfidence = 0.95;
    const errorReduction = Math.max(0, expectedToolConfidence - noToolConfidence);

    // Estimate costs
    const estimatedCost = tool.estimateCost ? tool.estimateCost(input) : { usd: 0, tokens: 0 };
    const estimatedLatency = tool.estimateLatency ? tool.estimateLatency(input) : 1000; // 1s default

    // Normalize cost (0-1)
    // Assume $1 = penalty of 1.0
    const costPenalty = Math.min(1, estimatedCost.usd);

    // Latency penalty (0-1)
    // Assume 10 seconds = penalty of 1.0
    const latencyPenalty = Math.min(1, estimatedLatency / 10000);

    // Risk penalty (0-1)
    let riskPenalty = 0;

    // PII risk
    if (tool.allowedDataTypes && !this.checkPiiCompliance(tool)) {
      riskPenalty += 0.3;
    }

    // Approval required adds delay risk
    if (tool.requiresApproval) {
      riskPenalty += 0.2;
    }

    // Budget check
    if (this.config.budget) {
      if (
        estimatedCost.usd > this.config.budget.remainingUsd ||
        estimatedCost.tokens > this.config.budget.remainingTokens
      ) {
        riskPenalty += 0.5; // High penalty for budget overrun
      }
    }

    riskPenalty = Math.min(1, riskPenalty);

    // Calculate final VoI
    const benefit = errorReduction * utility;
    const cost = costPenalty + latencyPenalty + riskPenalty;
    const score = benefit - cost;

    return {
      score,
      errorReduction,
      utility,
      cost: costPenalty,
      latencyPenalty,
      riskPenalty,
      components: {
        benefit,
        cost,
      },
    };
  }

  /**
   * Get eligible tools for a capability
   */
  private getEligibleTools(capability: CapabilityClass): Tool[] {
    const tools = this.toolRegistry.get(capability) || [];

    return tools.filter((tool) => {
      // Check allowlist
      if (this.config.allowlist && !this.config.allowlist.includes(tool.capability)) {
        return false;
      }

      // Check denylist
      if (this.config.denylist && this.config.denylist.includes(tool.capability)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Check PII compliance
   */
  private checkPiiCompliance(tool: Tool): boolean {
    if (!this.config.piiPolicy) {
      return true; // No policy = allow
    }

    if (!this.config.piiPolicy.allowPiiEgress && tool.allowedDataTypes?.includes('PII')) {
      return false;
    }

    return true;
  }

  /**
   * Record analysis decision
   */
  private async recordAnalysis(
    runId: string,
    phase: string,
    capability: CapabilityClass,
    result: AnalysisResult
  ): Promise<void> {
    if (!this.recorder) return;

    await this.recorder.recordDecision({
      runId,
      phase,
      actor: 'Analyzer',
      decisionType: 'tool_selection',
      inputs: {
        capability,
        noToolConfidence: result.noToolConfidence,
      },
      outputs: {
        useTools: result.useTools,
        selectedTool: result.selectedTool?.name,
        voiScore: result.voiScore?.score,
      },
      reasoning: result.reasoning,
      confidence: result.noToolConfidence,
      alternatives: result.alternatives?.map((a) => ({
        tool: a.tool.name,
        score: a.score.score,
      })),
    });
  }

  /**
   * Update budget after tool execution
   */
  updateBudget(cost: { usd: number; tokens: number }): void {
    if (!this.config.budget) return;

    this.config.budget.remainingUsd -= cost.usd;
    this.config.budget.remainingTokens -= cost.tokens;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): { usd: number; tokens: number } | undefined {
    return this.config.budget;
  }
}

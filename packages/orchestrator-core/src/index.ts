export * from './workflow-engine';
export * from './workflow-state';
export * from './phase-orchestrator';
export * from './event-publisher';
export * from './types';

// Level-2 Microflow Architecture Components
// Comprehensive infrastructure for orchestration with:
// - Orchestrators, Agents, Tools, Executors
// - Gatekeepers, Triggers, Supervisors, Dispatchers, Recorders, Analyzers

// Recorder - Comprehensive logging
export {
  Recorder,
  InMemoryRecorderStorage,
  type RecorderStorage,
  type RecorderLogEntry,
  type ArtifactRecord,
  type DecisionRecord,
  type ScoreRecord,
  type CostRecord,
} from './recorder/recorder';

// Gatekeeper - Enforce quality gates
export {
  Gatekeeper,
  type GateRubric,
  type GateMetric,
  type GateEvaluationInput,
  type GateEvaluationResult,
  type MetricResult,
  type ArtifactCheck,
  type EvidencePack,
  type ToolProvenance,
  type Approval,
  type GateDecision,
} from './gatekeeper/gatekeeper';

// Concrete Gates
export {
  CritiqueGate,
  PRDGate,
  ViabilityGate,
  ArchitectureGate,
  SecurityGate,
  PerformanceGate,
  QAGate,
  AccessibilityGate,
  AestheticGate,
  // M1-M9 Gates
  APIBreakageGate,
  CostBudgetGate,
  RAGQualityGate,
  ComplianceGate,
  CodeQualityGate,
} from './gatekeeper/gates';

// Supervisor - Retry/backoff/restart logic
export {
  Supervisor,
  DEFAULT_RETRY_POLICIES,
  type RetryPolicy,
  type CircuitBreakerConfig,
  type HeartbeatConfig,
  type SupervisionConfig,
  type ExecutionContext,
  type RetryResult,
  type CircuitState,
  type HeartbeatState,
} from './supervisor/supervisor';

// Dispatcher - Event-driven orchestration
export {
  Dispatcher,
  EventTopic,
  type DispatchMessage,
  type DispatcherConfig,
  type MessageHandler,
  type DispatcherStats,
} from './dispatcher/dispatcher';

// Analyzer - VoI tool selection
export {
  Analyzer,
  CapabilityClass,
  type Tool,
  type ToolResult,
  type AnalyzerConfig,
  type VoIScore,
  type AnalysisResult,
} from './analyzer/analyzer';

// Tool Registry
export { ToolRegistry, createDefaultToolRegistry } from './analyzer/tool-registry';

// Phase-Gate Mapping Configuration
export {
  PHASE_GATE_MAPPING,
  getPhaseConfig,
  getPhasesWithGates,
  getTotalBudget,
  isValidPhase,
  getPhaseOrder,
  getNextPhase,
  getPreviousPhase,
  type PhaseGateConfig,
} from './config/phase-gate-mapping';

// Enhanced Base Classes
export { EnhancedPhaseCoordinator, type EnhancedPhaseCoordinatorConfig } from './base/enhanced-phase-coordinator';

// BetaGate
export { BetaGate } from './gatekeeper/beta-gate';

// ============================================================================
// M1-M9: Autonomous Innovation Components
// ============================================================================

// M1: Autonomy Core
export {
  ModelRouterAgent,
  SeedManager,
  ContentAddressedStore,
  ReplayHashManager,
  AnomalyDetector,
  type Model,
  type ModelCapabilities,
  type RoutingRequest,
  type RoutingDecision,
  type SeedContext,
  type CASEntry,
  type ReplayEntry,
  type TelemetrySnapshot,
  type AnomalyThreshold,
  type RunSnapshot,
  MODEL_ROUTER_MIGRATION,
  DETERMINISM_MIGRATION,
  KILL_SWITCH_MIGRATION,
} from './autonomy';

// M2: Governance I
export {
  APIBreakageGuard,
  APIDiffTestTool,
  APIBreakageGate,
  DatabaseMigratorAgent,
  type OpenAPISpec,
  type APIBreakageResult,
  type BreakingChange,
  type Migration,
  type MigrationPlan,
  type RehearsalReport,
  API_BREAKAGE_MIGRATION,
  DB_MIGRATOR_MIGRATION,
} from './governance';

// M3: Perf & Cost Optimizer
export {
  PerformanceProfilerAgent,
  FlamegraphTool,
  CostTracker,
  type ProfileSession,
  type ProfileReport,
  type PerformanceBottleneck,
  type CostEntry,
  type CostSummary,
  type Budget,
  type CostOptimization,
  PROFILER_MIGRATION,
  COST_TRACKER_MIGRATION,
} from './performance';

// M4: RAG Governance
export {
  RAGQualityGuard,
  RAGRefreshTool,
  type RAGMetrics,
  type CitationCoverage,
  type RAGQualityReport,
  type KnowledgeDocument,
  type RefreshSchedule,
  RAG_QUALITY_MIGRATION,
} from './rag';

// M5: Safety-in-Depth
export {
  PromptShieldGuard,
  ExfilGuard,
  RedTeamAgent,
  RuntimePolicyGuard,
  type PromptShieldResult,
  type PromptThreat,
  type ExfilScanResult,
  type ExfilViolation,
  type SensitivePattern,
  type AttackVector,
  type AttackResult,
  type RedTeamReport,
  type PolicyDecision,
  type PolicyContext,
  type Policy,
  type PolicyRule,
  type PolicyViolation,
  PROMPT_SHIELD_MIGRATION,
  EXFIL_GUARD_MIGRATION,
  REDTEAM_MIGRATION,
  RUNTIME_POLICY_MIGRATION,
} from './security';

// M6: Synthetic Cohorts & Experimentation (Stubs)
export {
  SyntheticCohortAgent,
  ExperimentRunner,
  MetricGuard,
  type Persona,
  type SyntheticTraffic,
  type Experiment,
  type ExperimentResult,
  type MetricGuardResult,
  SYNTHETIC_COHORT_MIGRATION,
  EXPERIMENT_MIGRATION,
  METRIC_GUARD_MIGRATION,
} from './experimentation';

// M7: Compliance Modes
export {
  LicenseGuard,
  IPProvenanceTool,
  TermsScannerGuard,
  type LicenseInfo,
  type Dependency,
  type LicenseScanResult,
  type LicenseViolation,
  type CodeArtifact,
  type ProvenanceRecord,
  type ProvenanceReport,
  type IPRiskAssessment,
  type TermsScanResult,
  type TermsViolation,
  type ComplianceFramework,
  LICENSE_GUARD_MIGRATION,
  IP_PROVENANCE_MIGRATION,
  TERMS_SCANNER_MIGRATION,
} from './compliance';

// M8: Code Graph & Diff-Aware Gen
export {
  CodeGraphBuilder,
  DeltaCoderAgent,
  type CodeGraph,
  type CodeNode,
  type CodeEdge,
  type CallChain,
  type ImpactAnalysis,
  type DeadCodeReport,
  type DependencyAnalysis,
  type ChangeRequest,
  type DeltaResult,
  type SurgicalEdit,
  CODE_GRAPH_MIGRATION,
  DELTA_CODER_MIGRATION,
} from './codegraph';

// M9: Ops & DR
export {
  GPUScheduler,
  DRRunner,
  type GPUResource,
  type GPUJob,
  type SchedulerConfig,
  type GPUMetrics,
  type DRDrill,
  type DrillExecution,
  type DrillReport,
  type BackupVerification,
  GPU_SCHEDULER_MIGRATION,
  DR_RUNNER_MIGRATION,
} from './ops';

// ============================================================================
// Extended Components: Priority, Quota, Learning, Intelligence
// ============================================================================

// Priority & Preemption System
export {
  PriorityScheduler,
  PriorityClass,
  PreemptionReason,
  type PriorityAssignment,
  type TaskPriority,
  type PreemptionConfig,
  type PreemptionEvent,
  type ResourceType,
  type PreemptionScore,
} from './scheduler';

// Quota Enforcement
export {
  QuotaEnforcer,
  type TenantQuotas,
  type ResourceUsage,
  type QuotaViolation,
  type QuotaCheckResult,
  DEFAULT_TENANT_QUOTAS,
} from './quota';

// Budget Guard
export {
  BudgetGuard,
  type BudgetStatus,
  type BudgetPolicy,
  type BudgetAlert,
} from './performance/budget-guard';

// Heartbeat Monitoring
export {
  HeartbeatGuard,
  type HeartbeatConfig,
  type HeartbeatStatus,
} from './heal/heartbeatGuard';

// Deliberation & Reasoning Quality
export {
  DeliberationGuard,
  type DeliberationScore,
} from './autonomy/deliberation-guard';

// Design Critique & Quality
export {
  DesignCriticAgent,
  type DesignReview,
  type DesignIssue,
} from './agents/design-critic';

export {
  DesignGate,
} from './gatekeeper/design-gate';

// Learning Loop
export {
  TelemetryLogger,
  DatasetCurator,
  type TaskOutcome,
  type DatasetSample,
} from './learning';

// Developer Experience
export {
  DocsPortalAgent,
  ExplainAgent,
  type PortalSpec,
  type DecisionExplanation,
} from './agents';

// i18n & Accessibility
export {
  I18nExtractorTool,
  L10nTesterAgent,
  A11yGuard,
  type TranslatableString,
  type LocaleTest,
  type A11yViolation,
} from './tools';

// Formal Verification (Optional)
export {
  TLACheckerTool,
  PropertyTesterTool,
} from './tools/formal';

// ============================================================================
// Learning-Ops: Autonomous Neural Learning System
// ============================================================================

export {
  // CRL
  CRLCompute,
  computeCRL,
  type CRLTerms,
  type CRLWeights,
  type CRLResult,
  DEFAULT_CRL_WEIGHTS,
  // Policy Store
  PolicyStore,
  type PolicyArtifact,
  type ProvenanceInfo,
  type PolicyStatus,
  type PolicyRecord,
  // Experiment Registry
  ExperimentRegistry,
  type ExperimentType,
  type ExperimentStatus,
  type ExperimentConfig,
  type ExperimentResult,
  // Offline Replayer
  OfflineReplayer,
  type ReplayConfig,
  type ReplayResult,
  // Shadow/Canary
  ShadowCanaryController,
  type DeploymentMode,
  type ShadowConfig,
  type CanaryConfig,
  type CanaryReport,
  // Skill Cards
  SkillCards,
  type SkillCard,
  type ExperimentSummary,
  // Learning Curator
  LearningCurator,
  type LearningBundle,
  type ArtifactSample,
  type SampleLabels,
  // Contamination Guard
  ContaminationGuard,
  type ContaminationCheck,
  // Migration
  LEARNING_OPS_MIGRATION,
} from './learning-ops';

// ============================================================================
// Memory Vault: Central Knowledge Management System
// ============================================================================

export {
  // Core Types
  type MemoryScope,
  type TTLConfig,
  DEFAULT_TTL_CONFIG,
  type Provenance,
  type KnowledgeFrame,
  type QABinding,
  type Signal,
  type ContextPack,
  type MemoryQuery,
  type MemorySuggestRequest,
  type IngestFrameRequest,
  type IngestQABindingRequest,
  type IngestArtifactRequest,
  type IngestSignalRequest,
  type MemoryTopic,
  type MemorySubscription,
  type MemoryDelta,
  type UpdateTTLRequest,
  type PinRequest,
  type ForgetRequest,
  type RefineryResult,
  type ConflictReport,
  type GroundingCheckResult,
  type ContradictionCheckResult,
  // Components
  KnowledgeFrameManager,
  QABindingManager,
  KnowledgeRefinery,
  ContextPackBuilder,
  type ContextBuildOptions,
  MemoryBroker,
  MemoryGate,
  type MemoryGateConfig,
  type MemoryGateResult,
  GroundingGuard,
  ContradictionGuard,
  MemoryVaultAPI,
  // Migration
  MEMORY_VAULT_MIGRATION,
} from './memory-vault';

// ============================================================================
// Mothership Orchestrator - Integrated System
// ============================================================================

export {
  MothershipOrchestrator,
  type MothershipConfig,
  type OrchestrationContext,
  type OrchestrationResult,
} from './mothership-orchestrator';

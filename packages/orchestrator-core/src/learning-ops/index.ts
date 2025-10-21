/**
 * Learning-Ops - Autonomous Neural Learning System
 *
 * Makes IdeaMine learn from every run and continuously improve
 */

// CRL (Composite Run Loss)
export { CRLCompute, computeCRL, CRL_COMPUTE_MIGRATION } from './crl-compute';
export { CRLTerms, CRLWeights, CRLResult, DEFAULT_CRL_WEIGHTS } from './crl-types';

// Policy Store
export {
  PolicyStore,
  PolicyArtifact,
  ProvenanceInfo,
  PolicyStatus,
  PolicyRecord,
  POLICY_STORE_MIGRATION,
} from './policy-store';

// Experiment Registry
export {
  ExperimentRegistry,
  ExperimentType,
  ExperimentStatus,
  ExperimentConfig,
  ExperimentResult,
  EXPERIMENT_REGISTRY_MIGRATION,
} from './experiment-registry';

// Offline Replayer
export { OfflineReplayer, ReplayConfig, ReplayResult, OFFLINE_REPLAYER_MIGRATION } from './offline-replayer';

// Shadow/Canary Controller
export {
  ShadowCanaryController,
  DeploymentMode,
  ShadowConfig,
  CanaryConfig,
  CanaryReport,
  SHADOW_CANARY_MIGRATION,
} from './shadow-canary';

// Skill Cards
export { SkillCards, SkillCard, ExperimentSummary, SKILL_CARDS_MIGRATION } from './skill-cards';

// Learning Curator
export {
  LearningCurator,
  LearningBundle,
  ArtifactSample,
  SampleLabels,
  LEARNING_CURATOR_MIGRATION,
} from './learning-curator';

// Contamination Guard
export { ContaminationGuard, ContaminationCheck } from './contamination-guard';

/**
 * Complete Learning-Ops Migration
 *
 * Run this to set up all learning-ops tables
 */
export { LEARNING_OPS_MIGRATION } from './migrations';

/**
 * @ideamine/agents
 *
 * IdeaMine agents implementing the Analyzer-inside-Agent pattern.
 * This package contains agents for all 12 phases of the IdeaMine pipeline.
 *
 * @version 1.0.0
 */

// Phase 1: INTAKE
export {
  IntakeClassifierAgent,
  IntakeExpanderAgent,
  IntakeValidatorAgent,
} from './intake';

// Configuration loaders
export { loadAgentConfig } from './config/loader';

// Phase 2: IDEATION
export {
  StrategyAgent,
  CompetitiveAnalystAgent,
  TechStackRecommenderAgent,
  UserPersonaBuilderAgent,
  IdeationPhaseCoordinator,
} from './ideation';

// Phase 3: CRITIQUE
export {
  RedTeamAgent,
  RiskAnalyzerAgent,
  AssumptionChallengerAgent,
  CritiquePhaseCoordinator,
} from './critique';

// Phase 4: PRD
export {
  PRDWriterAgent,
  FeatureDecomposerAgent,
  AcceptanceCriteriaWriterAgent,
  PRDPhaseCoordinator,
} from './prd';

// Phase 5: BIZDEV
export {
  ViabilityAnalyzerAgent,
  GTMPlannerAgent,
  PricingModelerAgent,
  MonetizationAdvisorAgent,
  BizDevPhaseCoordinator,
} from './bizdev';

// Phase 6: ARCH
export {
  SolutionArchitectAgent,
  APIDesignerAgent,
  DataModelerAgent,
  InfrastructurePlannerAgent,
  ArchPhaseCoordinator,
} from './arch';

// Phase 7: BUILD
export {
  RepoCreatorAgent,
  CICDBuilderAgent,
  EnvProvisionerAgent,
  BuildPhaseCoordinator,
} from './build';

// Phase 8: STORY_LOOP
export {
  StoryCoderAgent,
  CodeReviewerAgent,
  UnitTestWriterAgent,
  StoryLoopPhaseCoordinator,
} from './story-loop';

// Phase 9: QA
export {
  E2ETestRunnerAgent,
  LoadTesterAgent,
  SecurityScannerAgent,
  VisualRegressionTesterAgent,
  QAPhaseCoordinator,
} from './qa';

// Phase 10: AESTHETIC
export {
  UIAuditorAgent,
  AccessibilityCheckerAgent,
  PolishAgent,
  AestheticPhaseCoordinator,
} from './aesthetic';

// Phase 11: RELEASE
export {
  PackagerAgent,
  DeployerAgent,
  ReleaseNotesWriterAgent,
  ReleasePhaseCoordinator,
} from './release';

// Phase 12: BETA
export {
  BetaDistributorAgent,
  TelemetryCollectorAgent,
  AnalyticsReporterAgent,
  BetaPhaseCoordinator,
} from './beta';

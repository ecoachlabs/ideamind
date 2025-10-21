/**
 * Experimentation Module
 *
 * Roadmap: M6 - Synthetic Cohorts & Experimentation
 *
 * Components:
 * - Synthetic Cohort Agent: Persona-based traffic simulation
 * - Experiment Runner: A/B testing framework
 * - Metric Guard: Statistical validation and anti p-hacking
 */

export {
  SyntheticCohortAgent,
  type Persona,
  type SyntheticTraffic,
  type SyntheticAction,
  SYNTHETIC_COHORT_MIGRATION,
} from './synthetic-cohort';

export {
  ExperimentRunner,
  type Experiment,
  type ExperimentVariant,
  type ExperimentResult,
  EXPERIMENT_MIGRATION,
} from './experiment-runner';

export {
  MetricGuard,
  type MetricGuardResult,
  METRIC_GUARD_MIGRATION,
} from './metric-guard';

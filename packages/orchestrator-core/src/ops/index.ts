/**
 * Operations & DR Module
 *
 * Roadmap: M9 - Ops & DR
 *
 * Components:
 * - GPU Scheduler: Fair GPU resource allocation
 * - DR Runner: Disaster recovery drills and verification
 */

export {
  GPUScheduler,
  type GPUResource,
  type GPUJob,
  type SchedulerConfig,
  type TenantQuota,
  type SchedulingDecision,
  type GPUMetrics,
  GPU_SCHEDULER_MIGRATION,
} from './gpu-scheduler';

export {
  DRRunner,
  type DRDrill,
  type DrillType,
  type DrillExecution,
  type DrillStep,
  type DrillMetrics,
  type DrillIssue,
  type DrillReport,
  type BackupVerification,
  DR_RUNNER_MIGRATION,
} from './dr-runner';

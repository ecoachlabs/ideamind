/**
 * Performance & Cost Module
 *
 * Roadmap: M3 - Perf & Cost Optimizer
 *
 * Components:
 * - Profiler: Performance profiling + flamegraphs
 * - Cost Tracker: Cost tracking + budgets + optimizations
 */

// Profiler
export {
  PerformanceProfilerAgent,
  FlamegraphTool,
  type ProfileSession,
  type ProfileSample,
  type FlameGraphNode,
  type PerformanceBottleneck,
  type OptimizationSuggestion,
  type ProfileReport,
  PROFILER_MIGRATION,
} from './profiler';

// Cost Tracker
export {
  CostTracker,
  type CostEntry,
  type Budget,
  type CostBreakdown,
  type CostAlert,
  type CostOptimization,
  COST_TRACKER_MIGRATION,
} from './cost-tracker';

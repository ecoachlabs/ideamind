/**
 * Knowledge Refinery Index
 *
 * Main entry point for the Knowledge Refinery system.
 */

// Client and workflow
export { RefineryClient, RefineryGate } from './refinery-client';
export type {
  RefineryClientConfig,
  RefineRequest,
  RefineResult,
  RefineryMetrics,
  GateResult,
  GateThresholds,
} from './refinery-client';

export { RefineryWorkflow } from './refinery-workflow';
export type {
  RefineryConfig,
  RefineryInput,
  RefineryOutput,
} from './refinery-workflow';

// Delta events
export { DeltaPublisher, DeltaSubscriber } from './delta-publisher';
export type {
  DeltaPublisherConfig,
  DeltaEvent,
  StoredDeltaEvent,
} from './delta-publisher';

// Re-export tools for convenience
export {
  NormalizeTool,
  FissionTool,
  EmbedTool,
  BatchEmbedTool,
  ClusterTool,
  FusionTool,
  OntologyLinkTool,
  DedupTool,
  DedupHandler,
} from '../tools/refine';

export type {
  FissionTree,
  Cluster,
  KnowledgeFrame,
} from '../tools/refine';

export { PIIRedactorTool } from '../tools/guard';

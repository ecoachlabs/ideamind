/**
 * Code Graph Module
 *
 * Roadmap: M8 - Code Graph & Diff-Aware Gen
 *
 * Components:
 * - Code Graph Builder: Semantic code graph for dependency analysis
 * - Delta Coder Agent: Minimal diff generation
 */

export {
  CodeGraphBuilder,
  type CodeGraph,
  type CodeNode,
  type CodeEdge,
  type NodeType,
  type EdgeType,
  type GraphMetadata,
  type CallChain,
  type ImpactAnalysis,
  type DeadCodeReport,
  type DependencyAnalysis,
  CODE_GRAPH_MIGRATION,
} from './graph-builder';

export {
  DeltaCoderAgent,
  type ChangeRequest,
  type DeltaResult,
  type CodeChange,
  type DiffAnalysis,
  type SurgicalEdit,
  DELTA_CODER_MIGRATION,
} from './delta-coder';

/**
 * Knowledge Map Exports
 */

// Core client
export { KnowledgeMapClient } from './km-client';
export type {
  KMQuestion,
  KMAnswer,
  KMBinding,
  KMCoverageMetrics,
} from './km-client';

// Carry-over manager
export { KMCarryOverManager } from './km-carry-over';
export type {
  CarryOverConfig,
  CarryOverQuestion,
  CarryOverStats,
  QuestionStatus,
} from './km-carry-over';

// Management tools
export {
  KMQueryTool,
  KMSupersedeTool,
  KMResolveTool,
} from './km-management-tools';
export type {
  KMQueryResult,
  UnresolvedQuestion,
  SupersedeResult,
  SupersessionHistoryEntry,
  ResolveResult,
  ConflictEntry,
} from './km-management-tools';

/**
 * Composite Run Loss (CRL) Types
 *
 * Single scalar metric tracking run quality, cost, and safety
 */

export interface CRLTerms {
  // Quality metrics
  gatePass: number; // Gate pass rate (0-1)
  contradictions: number; // Contradiction rate (0-1)
  grounding: number; // Grounding score (0-1)

  // Cost metrics
  costOverBudgetPct: number; // Percentage over budget (0-1+)
  latencyP95Norm: number; // Normalized P95 latency (0-1)

  // Safety metrics
  securityCriticals: number; // Count of critical security issues
  apiBreakages: number; // Count of API breaking changes
  dbMigrationFail: number; // DB migration failures (0 or 1)

  // RAG metrics
  ragCoverage: number; // RAG citation coverage (0-1)
}

export interface CRLWeights {
  wq: number; // Quality weight (gate pass)
  wg: number; // Grounding weight (contradictions)
  wr: number; // Reasoning weight (grounding)
  wc: number; // Cost weight (budget)
  wt: number; // Time weight (latency)
  ws: number; // Security weight
  wa: number; // API weight
  wd: number; // Database weight
  wrag: number; // RAG weight
}

export interface CRLResult {
  L: number; // Composite loss value
  terms: CRLTerms; // Individual term values
  weights: CRLWeights; // Weights used
  normalized: boolean; // Whether terms were normalized
  timestamp: Date;
}

export const DEFAULT_CRL_WEIGHTS: CRLWeights = {
  wq: 0.2, // Gate pass rate
  wg: 0.15, // Contradictions
  wr: 0.15, // Grounding
  wc: 0.15, // Cost
  wt: 0.1, // Latency
  ws: 0.1, // Security
  wa: 0.05, // API
  wd: 0.05, // Database
  wrag: 0.05, // RAG
};

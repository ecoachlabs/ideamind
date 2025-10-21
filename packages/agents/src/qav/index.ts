/**
 * Q/A/V Triad - Autonomous Clarification System
 *
 * Enables 20-50 hour autonomous runs with NO user prompts.
 *
 * Components:
 * - QuestionAgent (QAQ): Generates clarification questions for gaps/ambiguities
 * - AnswerAgent (QAA): Answers questions using artifacts + tools
 * - QuestionValidator (QV): Validates Q/A bindings before acceptance
 *
 * Integration:
 * - RefineryAdapter: Processes Q/A/V bundles into knowledge frames
 * - EnhancedPhaseCoordinator: Runs Q/A/V loop after fan-in, before gates
 *
 * Spec References:
 * - orchestrator.txt:24-25, 61-63, 172-175
 * - UNIFIED_IMPLEMENTATION_SPEC.md Section 2 (Autonomy Layer)
 */

// ============================================================================
// AGENTS
// ============================================================================

export { QuestionAgent } from './question-agent';
export { AnswerAgent } from './answer-agent';
export { QuestionValidator } from './question-validator';

// ============================================================================
// TYPES
// ============================================================================

export type {
  Question,
  Answer,
  ValidationResult,
  QuestionGenerationInput,
  AnswerGenerationInput,
  ValidationInput,
  QAVBundle,
  RefineryProcessingResult,
  QuestionPriority,
  QuestionCategory,
  DecisionImpact,
  Citation,
  Gap,
} from './types';

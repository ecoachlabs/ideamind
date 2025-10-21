/**
 * Security Module
 *
 * Roadmap: M5 - Safety-in-Depth
 *
 * Components:
 * - Prompt Shield: Prompt injection detection
 * - Exfil Guard: Data exfiltration prevention
 * - Red Team: Adversarial testing
 * - Runtime Policy: OPA-style policy enforcement
 */

// Prompt Shield
export {
  PromptShieldGuard,
  type PromptShieldResult,
  type PromptThreat,
  PROMPT_SHIELD_MIGRATION,
} from './prompt-shield';

// Exfil Guard
export {
  ExfilGuard,
  type ExfilScanResult,
  type ExfilViolation,
  type SensitivePattern,
  EXFIL_GUARD_MIGRATION,
} from './exfil-guard';

// Red Team
export {
  RedTeamAgent,
  type AttackVector,
  type AttackResult,
  type RedTeamReport,
  REDTEAM_MIGRATION,
} from './redteam-agent';

// Runtime Policy
export {
  RuntimePolicyGuard,
  type PolicyDecision,
  type PolicyContext,
  type Policy,
  type PolicyRule,
  type PolicyViolation,
  RUNTIME_POLICY_MIGRATION,
} from './runtime-policy';

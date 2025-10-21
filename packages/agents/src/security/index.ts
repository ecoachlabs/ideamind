/**
 * Phase 6a: Security & Privacy Assurance
 *
 * Exports all security agents, tools, gates, and coordinators
 */

// Core Security Agents (Critical Path)
export { SecretsHygieneAgent } from './secrets-hygiene-agent';
export { SCAAgent } from './sca-agent';
export { SASTAgent } from './sast-agent';

// Security Gate & Coordinator
export { SecurityGate, SecurityGateConfig } from './security-gate';
export {
  SecurityCoordinator,
  SecurityCoordinatorInput,
  SecurityCoordinatorResult,
} from './security-coordinator';

// Future agents (placeholders for Phase 6b-6i)
// export { IaCPolicyAgent } from './iac-policy-agent';
// export { ContainerHardeningAgent } from './container-hardening-agent';
// export { PrivacyDPIAAgent } from './privacy-dpia-agent';
// export { ThreatModelAgent } from './threat-model-agent';
// export { DASTAgent } from './dast-agent';
// export { SupplyChainAgent } from './supply-chain-agent';
// export { FixRecommenderAgent } from './fix-recommender-agent';

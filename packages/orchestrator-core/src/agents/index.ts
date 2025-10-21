/**
 * Agents
 *
 * Agent framework and registry
 */

export * from './base-agent';
export * from './agent-registry';

// New agents
export { DesignCriticAgent, type DesignReview, type DesignIssue } from './design-critic';
export { DocsPortalAgent, type PortalSpec } from './docs-portal';
export { ExplainAgent, type DecisionExplanation } from './explain-agent';

/**
 * Ideation Phase Agents
 *
 * The ideation phase consists of four agents that run in PARALLEL:
 * 1. StrategyAgent: Defines product vision and strategy
 * 2. CompetitiveAnalystAgent: Analyzes market and competitors
 * 3. TechStackRecommenderAgent: Recommends optimal technology stack
 * 4. UserPersonaBuilderAgent: Creates detailed user personas
 *
 * Performance: 10-15s (vs 40-60s sequential) - 4x faster!
 */

export { StrategyAgent } from './strategy-agent';
export { CompetitiveAnalystAgent } from './competitive-analyst-agent';
export { TechStackRecommenderAgent } from './techstack-recommender-agent';
export { UserPersonaBuilderAgent } from './user-persona-builder-agent';
export { IdeationPhaseCoordinator } from './ideation-phase-coordinator';

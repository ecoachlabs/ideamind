import pino from 'pino';
import { BaseAgent } from './base-agent';

const logger = pino({ name: 'agent-registry' });

/**
 * Agent metadata
 */
export interface AgentMetadata {
  name: string;
  description: string;
  version: string;
  capabilities: {
    supportsStreaming: boolean;
    supportsBatching: boolean;
    supportsCheckpointing: boolean;
    maxInputSize: number;
    maxOutputSize: number;
  };
  tags: string[];
  phases: string[]; // Phases this agent can run in
}

/**
 * Agent factory function
 */
export type AgentFactory = (apiKey: string, config?: any) => BaseAgent;

/**
 * Agent Registry
 *
 * Central registry for all agents in the system
 */
export class AgentRegistry {
  private agents: Map<string, AgentFactory> = new Map();
  private metadata: Map<string, AgentMetadata> = new Map();

  /**
   * Register an agent
   *
   * @param metadata - Agent metadata
   * @param factory - Factory function to create agent instances
   */
  register(metadata: AgentMetadata, factory: AgentFactory): void {
    if (this.agents.has(metadata.name)) {
      logger.warn({ agent: metadata.name }, 'Agent already registered, overwriting');
    }

    this.agents.set(metadata.name, factory);
    this.metadata.set(metadata.name, metadata);

    logger.info(
      {
        agent: metadata.name,
        version: metadata.version,
        phases: metadata.phases,
      },
      'Agent registered'
    );
  }

  /**
   * Get agent instance
   *
   * @param name - Agent name
   * @param apiKey - API key for agent
   * @param config - Optional configuration
   * @returns Agent instance
   */
  get(name: string, apiKey: string, config?: any): BaseAgent {
    const factory = this.agents.get(name);
    if (!factory) {
      throw new Error(`Agent not found: ${name}`);
    }

    return factory(apiKey, config);
  }

  /**
   * Check if agent exists
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Get agent metadata
   */
  getMetadata(name: string): AgentMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * Get all registered agents
   */
  getAll(): AgentMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get agents for a specific phase
   */
  getForPhase(phase: string): AgentMetadata[] {
    return Array.from(this.metadata.values()).filter((metadata) =>
      metadata.phases.includes(phase)
    );
  }

  /**
   * Search agents by tag
   */
  searchByTag(tag: string): AgentMetadata[] {
    return Array.from(this.metadata.values()).filter((metadata) =>
      metadata.tags.includes(tag)
    );
  }

  /**
   * Unregister an agent
   */
  unregister(name: string): boolean {
    const hadAgent = this.agents.delete(name);
    this.metadata.delete(name);

    if (hadAgent) {
      logger.info({ agent: name }, 'Agent unregistered');
    }

    return hadAgent;
  }

  /**
   * Clear all agents
   */
  clear(): void {
    this.agents.clear();
    this.metadata.clear();

    logger.info('All agents cleared from registry');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total_agents: number;
    by_phase: Record<string, number>;
    by_tag: Record<string, number>;
  } {
    const byPhase: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const metadata of this.metadata.values()) {
      // Count by phase
      for (const phase of metadata.phases) {
        byPhase[phase] = (byPhase[phase] || 0) + 1;
      }

      // Count by tag
      for (const tag of metadata.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      total_agents: this.agents.size,
      by_phase: byPhase,
      by_tag: byTag,
    };
  }
}

// Global registry instance
export const registry = new AgentRegistry();

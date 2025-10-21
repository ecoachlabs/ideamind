import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { AgentConfig } from '@ideamine/agent-sdk';

/**
 * Agent configuration from YAML file
 */
interface AgentConfigYAML {
  agents: AgentConfig[];
}

/**
 * Load agent configuration from YAML file
 *
 * @param configPath - Path to YAML config file (relative to config directory)
 * @returns AgentConfig array
 */
export function loadAgentConfig(configPath: string): AgentConfig[] {
  const fullPath = resolve(__dirname, 'config', configPath);

  try {
    const fileContent = readFileSync(fullPath, 'utf-8');
    const parsed = parse(fileContent) as AgentConfigYAML;

    if (!parsed.agents || !Array.isArray(parsed.agents)) {
      throw new Error('Invalid config format: missing agents array');
    }

    return parsed.agents;
  } catch (error) {
    console.error(`[loadAgentConfig] Failed to load config from ${fullPath}:`, error);
    throw error;
  }
}

/**
 * Load a specific agent configuration by ID
 *
 * @param configPath - Path to YAML config file
 * @param agentId - Agent ID to load
 * @returns AgentConfig or null if not found
 */
export function loadAgentConfigById(configPath: string, agentId: string): AgentConfig | null {
  const configs = loadAgentConfig(configPath);
  return configs.find((config) => config.id === agentId) || null;
}

/**
 * Load all intake agent configurations
 *
 * @returns Array of intake agent configs
 */
export function loadIntakeAgentConfigs(): AgentConfig[] {
  return loadAgentConfig('intake-agents.yaml');
}

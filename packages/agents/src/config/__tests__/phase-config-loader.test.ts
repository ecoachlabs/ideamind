/**
 * Tests for PhaseConfigLoader
 */

import { PhaseConfigLoader } from '../phase-config-loader';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

describe('PhaseConfigLoader', () => {
  let loader: PhaseConfigLoader;

  beforeEach(() => {
    loader = PhaseConfigLoader.getInstance();
    loader.clearCache(); // Clear cache between tests
    jest.clearAllMocks();
  });

  describe('loadPhaseConfig', () => {
    test('loads valid YAML config', async () => {
      const mockYaml = `
phase: INTAKE
parallelism: sequential
agents:
  - IntakeClassifierAgent
  - IntakeExpanderAgent
budgets:
  tokens: 700000
  tools_minutes: 60
rubrics:
  grounding_min: 0.85
allowlisted_tools:
  - tool.intake.normalizer
heartbeat_seconds: 60
stall_threshold_heartbeats: 3
refinery:
  fission_min_coverage: 0.90
  fusion_min_consensus: 0.85
timebox: PT1H
`;

      (fs.readFile as jest.Mock).mockResolvedValue(mockYaml);

      const config = await loader.loadPhaseConfig('intake');

      expect(config.phase).toBe('INTAKE');
      expect(config.agents).toHaveLength(2);
      expect(config.budgets.tokens).toBe(700000);
      expect(config.timebox).toBe('PT1H');
    });

    test('throws error for missing config file', async () => {
      const error = new Error('ENOENT');
      (error as any).code = 'ENOENT';
      (fs.readFile as jest.Mock).mockRejectedValue(error);

      await expect(loader.loadPhaseConfig('nonexistent')).rejects.toThrow(
        'Phase config not found'
      );
    });

    test('validates required fields', async () => {
      const invalidYaml = `
phase: INTAKE
agents:
  - IntakeAgent
# Missing budgets, rubrics, timebox, etc.
`;

      (fs.readFile as jest.Mock).mockResolvedValue(invalidYaml);

      await expect(loader.loadPhaseConfig('intake')).rejects.toThrow(
        'missing required field'
      );
    });

    test('caches loaded configs', async () => {
      const mockYaml = `
phase: INTAKE
parallelism: sequential
agents: [IntakeAgent]
budgets: { tokens: 100000, tools_minutes: 60 }
rubrics: {}
allowlisted_tools: []
heartbeat_seconds: 60
stall_threshold_heartbeats: 3
refinery: { fission_min_coverage: 0.9, fusion_min_consensus: 0.85 }
timebox: PT1H
`;

      (fs.readFile as jest.Mock).mockResolvedValue(mockYaml);

      // Load twice
      await loader.loadPhaseConfig('intake');
      await loader.loadPhaseConfig('intake');

      // Should only read file once due to caching
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('derivePhasePlan', () => {
    test('derives PhasePlan from PhaseConfig', async () => {
      const mockYaml = `
phase: INTAKE
parallelism: sequential
agents:
  - IntakeAgent
budgets:
  tokens: 700000
  tools_minutes: 60
rubrics:
  grounding_min: 0.85
allowlisted_tools:
  - tool.intake.normalizer
  - guard.claimMiner
heartbeat_seconds: 60
stall_threshold_heartbeats: 3
refinery:
  fission_min_coverage: 0.90
  fusion_min_consensus: 0.85
timebox: PT1H
`;

      (fs.readFile as jest.Mock).mockResolvedValue(mockYaml);

      const plan = await loader.derivePhasePlan('intake');

      expect(plan.phase).toBe('INTAKE');
      expect(plan.agents).toContain('IntakeAgent');
      expect(plan.tools).toContain('tool.intake.normalizer');
      expect(plan.guards).toContain('guard.claimMiner');
      expect(plan.hash).toBeDefined();
      expect(plan.hash).toHaveLength(64); // SHA256 hex
    });

    test('generates deterministic hash', async () => {
      const mockYaml = `
phase: INTAKE
parallelism: sequential
agents: [Agent1, Agent2]
budgets: { tokens: 100000, tools_minutes: 60 }
rubrics: { grounding_min: 0.85 }
allowlisted_tools: []
heartbeat_seconds: 60
stall_threshold_heartbeats: 3
refinery: { fission_min_coverage: 0.9, fusion_min_consensus: 0.85 }
timebox: PT1H
`;

      (fs.readFile as jest.Mock).mockResolvedValue(mockYaml);

      const plan1 = await loader.derivePhasePlan('intake');
      loader.clearCache();
      const plan2 = await loader.derivePhasePlan('intake');

      // Same config should produce same hash
      expect(plan1.hash).toBe(plan2.hash);
    });
  });
});

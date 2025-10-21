/**
 * Memory Vault Integration Tests
 *
 * Verifies Memory Vault integration with Mothership Orchestrator:
 * - Pre-phase memory gate checks
 * - Context pack queries for RAG
 * - Post-phase knowledge ingestion
 * - Full orchestration flow with Memory Vault enabled
 */

import { Pool } from 'pg';
import { MothershipOrchestrator } from '../mothership-orchestrator';
import { MemoryVaultAPI } from '../memory-vault/vault-api';
import { MemoryGate } from '../memory-vault/memory-gate';
import type { MothershipConfig, OrchestrationContext } from '../mothership-orchestrator';
import type { KnowledgeFrame, MemoryGateResult, ContextPack } from '../memory-vault/types';

// Mock database pool
const mockPool = {
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
} as unknown as Pool;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger),
};

describe('Memory Vault Integration', () => {
  let orchestrator: MothershipOrchestrator;
  let config: MothershipConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Base configuration with Memory Vault enabled
    config = {
      tenantId: 'test-tenant',
      enableRecorder: true,
      enableGatekeeper: true,
      enableSupervisor: true,
      enableDispatcher: true,
      enableAnalyzer: true,
      enablePriorityScheduler: true,
      enableQuotaEnforcer: true,
      enableLearningOps: true,
      enableMemoryVault: true,
      enableMemoryGates: true,
      enableRAGContext: true,
      db: mockPool,
      logger: mockLogger as any,
    };
  });

  describe('Initialization', () => {
    it('should initialize Memory Vault API and Gate when enabled', async () => {
      orchestrator = new MothershipOrchestrator(config);

      // Verify Memory Vault is initialized
      const vault = orchestrator.getMemoryVault();
      expect(vault).toBeInstanceOf(MemoryVaultAPI);

      // Verify logger message
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Memory Vault: API and Gate initialized')
      );
    });

    it('should not initialize Memory Vault when disabled', () => {
      config.enableMemoryVault = false;
      orchestrator = new MothershipOrchestrator(config);

      const vault = orchestrator.getMemoryVault();
      expect(vault).toBeUndefined();
    });

    it('should load subscriptions during initialization', async () => {
      // Mock vault.initialize() which loads subscriptions
      const mockInitialize = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(MemoryVaultAPI.prototype, 'initialize').mockImplementation(mockInitialize);

      orchestrator = new MothershipOrchestrator(config);

      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockInitialize).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Memory Vault: Initialized and ready');
    });
  });

  describe('Pre-Phase Memory Gate Checks', () => {
    beforeEach(() => {
      orchestrator = new MothershipOrchestrator(config);
    });

    it('should check memory gate before phase execution', async () => {
      const context: OrchestrationContext = {
        runId: 'run-123',
        phase: 'story_loop',
        tenantId: 'test-tenant',
        inputs: { prompt: 'Build a task manager' },
        budget: { maxCost: 10, maxTime: 60000 },
      };

      // Mock gate check to pass
      const mockGateCheck = jest.fn().mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'All required knowledge themes present',
        suggestions: [],
      });
      jest.spyOn(MemoryGate.prototype, 'check').mockImplementation(mockGateCheck);

      // Mock other components to prevent actual execution
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected to fail due to mocked components
      }

      // Verify gate check was called with story_loop config
      expect(mockGateCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredThemes: ['PRD', 'API.design'],
          minFreshness: 0.7,
          scope: ['tenant', 'run'],
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Memory gate passed');
    });

    it('should add violations when memory gate fails', async () => {
      const context: OrchestrationContext = {
        runId: 'run-456',
        phase: 'build',
        tenantId: 'test-tenant',
        inputs: { spec: 'API spec' },
        budget: { maxCost: 10, maxTime: 60000 },
      };

      // Mock gate check to fail
      const gateResult: MemoryGateResult = {
        passed: false,
        missingThemes: ['CODE.architecture', 'SECURITY.threats'],
        staleThemes: [],
        reason: 'Missing required knowledge themes: CODE.architecture, SECURITY.threats',
        suggestions: [
          'Run architecture design phase to populate CODE.architecture',
          'Run security audit to populate SECURITY.threats',
        ],
      };
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue(gateResult);

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ gateResult }),
        'Memory gate failed'
      );
    });

    it('should skip gate check when no predefined config exists', async () => {
      const context: OrchestrationContext = {
        runId: 'run-789',
        phase: 'custom_phase',
        tenantId: 'test-tenant',
        inputs: {},
        budget: { maxCost: 5, maxTime: 30000 },
      };

      const mockGateCheck = jest.fn();
      jest.spyOn(MemoryGate.prototype, 'check').mockImplementation(mockGateCheck);

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // No gate check should be called for custom_phase
      expect(mockGateCheck).not.toHaveBeenCalled();
    });
  });

  describe('Context Pack Queries for RAG', () => {
    beforeEach(() => {
      orchestrator = new MothershipOrchestrator(config);
    });

    it('should fetch context pack for RAG during execution', async () => {
      const context: OrchestrationContext = {
        runId: 'run-rag-1',
        phase: 'build',
        tenantId: 'test-tenant',
        inputs: { code: 'function example() {}' },
        budget: { maxCost: 10, maxTime: 60000 },
      };

      // Mock context pack
      const mockContextPack: ContextPack = {
        frames: [
          {
            id: 'frame_code_1',
            scope: 'tenant',
            theme: 'CODE.architecture',
            summary: 'Follow modular architecture patterns',
            claims: ['Use dependency injection', 'Separate concerns'],
            citations: ['https://docs.example.com/architecture'],
            parents: [],
            children: [],
            version: 'v1.0.0',
            provenance: {
              who: 'architect-agent',
              when: new Date().toISOString(),
              tools: ['code-analyzer'],
              inputs: [],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            pinned: false,
          },
        ],
        artifacts: [],
        citations: ['https://docs.example.com/architecture'],
        freshnessScore: 0.92,
        policyHints: {
          recommendedModel: 'gpt-4',
          temperature: 0.2,
          maxTokens: 2000,
        },
        metadata: {
          queryTime: 45,
          tokensUsed: 350,
          cacheHit: false,
        },
      };

      jest.spyOn(MemoryVaultAPI.prototype, 'query').mockResolvedValue(mockContextPack);
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'All required themes present',
        suggestions: [],
      });

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // Verify context pack query was called
      expect(MemoryVaultAPI.prototype.query).toHaveBeenCalledWith({
        theme: 'CODE', // build phase maps to CODE theme
        scope: ['tenant', 'run', 'global'],
        doer: 'test-tenant',
        phase: 'build',
        k: 10,
        filters: {
          minFreshness: 0.7,
        },
      });

      // Verify context pack was logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          frames: 1,
          freshness: '0.920',
          tokens: 350,
        }),
        'Context pack fetched for RAG'
      );
    });

    it('should handle context pack query errors gracefully', async () => {
      const context: OrchestrationContext = {
        runId: 'run-rag-error',
        phase: 'design',
        tenantId: 'test-tenant',
        inputs: {},
        budget: { maxCost: 5, maxTime: 30000 },
      };

      const queryError = new Error('Database connection failed');
      jest.spyOn(MemoryVaultAPI.prototype, 'query').mockRejectedValue(queryError);
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'OK',
        suggestions: [],
      });

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // Verify error was logged but execution continued
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: queryError }),
        'Failed to fetch context pack'
      );
    });

    it('should skip context pack query when RAG disabled', async () => {
      config.enableRAGContext = false;
      orchestrator = new MothershipOrchestrator(config);

      const context: OrchestrationContext = {
        runId: 'run-no-rag',
        phase: 'test',
        tenantId: 'test-tenant',
        inputs: {},
        budget: { maxCost: 5, maxTime: 30000 },
      };

      const mockQuery = jest.fn();
      jest.spyOn(MemoryVaultAPI.prototype, 'query').mockImplementation(mockQuery);
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'OK',
        suggestions: [],
      });

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // No context pack query should be called
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('Post-Phase Knowledge Ingestion', () => {
    beforeEach(() => {
      orchestrator = new MothershipOrchestrator(config);
    });

    it('should ingest signals after phase execution', async () => {
      const context: OrchestrationContext = {
        runId: 'run-ingest-1',
        phase: 'deploy',
        tenantId: 'test-tenant',
        inputs: { deployment: 'production' },
        budget: { maxCost: 20, maxTime: 120000 },
      };

      const mockIngestSignal = jest.fn().mockResolvedValue('signal_123');
      jest.spyOn(MemoryVaultAPI.prototype, 'ingestSignal').mockImplementation(mockIngestSignal);
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'OK',
        suggestions: [],
      });

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // Verify signal ingestion was called
      expect(mockIngestSignal).toHaveBeenCalledWith({
        signal: expect.objectContaining({
          runId: expect.any(String),
          taskId: 'run-ingest-1',
          gateScores: expect.any(Object),
          metadata: expect.objectContaining({
            phase: 'deploy',
          }),
        }),
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ runId: expect.any(String) }),
        'Signal ingested to Memory Vault'
      );
    });

    it('should handle ingestion errors gracefully', async () => {
      const context: OrchestrationContext = {
        runId: 'run-ingest-error',
        phase: 'test',
        tenantId: 'test-tenant',
        inputs: {},
        budget: { maxCost: 5, maxTime: 30000 },
      };

      const ingestError = new Error('Failed to insert signal');
      jest.spyOn(MemoryVaultAPI.prototype, 'ingestSignal').mockRejectedValue(ingestError);
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'OK',
        suggestions: [],
      });

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected
      }

      // Verify error was logged
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: ingestError,
          runId: expect.any(String),
        }),
        'Failed to ingest knowledge to Memory Vault'
      );
    });
  });

  describe('Helper Methods', () => {
    beforeEach(() => {
      orchestrator = new MothershipOrchestrator(config);
    });

    it('should provide access to Memory Vault API', () => {
      const vault = orchestrator.getMemoryVault();
      expect(vault).toBeInstanceOf(MemoryVaultAPI);
    });

    it('should check memory gate via helper method', async () => {
      const mockCheck = jest.fn().mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'OK',
        suggestions: [],
      });
      jest.spyOn(MemoryGate.prototype, 'check').mockImplementation(mockCheck);

      const result = await orchestrator.checkMemoryGate('story_loop');

      expect(result.passed).toBe(true);
      expect(mockCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredThemes: ['PRD', 'API.design'],
        })
      );
    });

    it('should query memory via helper method', async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        frames: [],
        artifacts: [],
        citations: [],
        freshnessScore: 0,
        metadata: {},
      });
      jest.spyOn(MemoryVaultAPI.prototype, 'query').mockImplementation(mockQuery);

      const query = {
        theme: 'CODE.testing',
        scope: ['tenant'] as const,
        k: 5,
      };

      await orchestrator.queryMemory(query);

      expect(mockQuery).toHaveBeenCalledWith(query);
    });

    it('should subscribe to memory updates via helper method', async () => {
      const mockSubscribe = jest.fn().mockResolvedValue('sub_123');
      jest.spyOn(MemoryVaultAPI.prototype, 'subscribe').mockImplementation(mockSubscribe);

      const subscriptionId = await orchestrator.subscribeToMemory('memory.delta.created', {
        doer: 'test-agent',
      });

      expect(subscriptionId).toBe('sub_123');
      expect(mockSubscribe).toHaveBeenCalledWith('memory.delta.created', {
        doer: 'test-agent',
      });
    });

    it('should throw error when Memory Vault not enabled', async () => {
      config.enableMemoryVault = false;
      orchestrator = new MothershipOrchestrator(config);

      await expect(orchestrator.checkMemoryGate('build')).rejects.toThrow(
        'Memory Gate not enabled'
      );

      await expect(orchestrator.queryMemory({})).rejects.toThrow(
        'Memory Vault not enabled'
      );

      await expect(orchestrator.subscribeToMemory('memory.delta.*')).rejects.toThrow(
        'Memory Vault not enabled'
      );
    });
  });

  describe('Full Orchestration Flow', () => {
    it('should complete full flow with Memory Vault integration', async () => {
      orchestrator = new MothershipOrchestrator(config);

      const context: OrchestrationContext = {
        runId: 'run-full-flow',
        phase: 'story_loop',
        tenantId: 'test-tenant',
        inputs: { prompt: 'Create user authentication' },
        budget: { maxCost: 15, maxTime: 90000 },
      };

      // Mock all Memory Vault operations
      jest.spyOn(MemoryGate.prototype, 'check').mockResolvedValue({
        passed: true,
        missingThemes: [],
        staleThemes: [],
        reason: 'All themes present',
        suggestions: [],
      });

      const mockContextPack: ContextPack = {
        frames: [
          {
            id: 'frame_prd_1',
            scope: 'tenant',
            theme: 'PRD',
            summary: 'Authentication requirements',
            claims: ['Support OAuth2', 'Implement JWT tokens'],
            citations: ['artifact:prd_auth_v1'],
            parents: [],
            children: [],
            version: 'v1.0.0',
            provenance: {
              who: 'prd-agent',
              when: new Date().toISOString(),
              tools: [],
              inputs: [],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            pinned: true,
          },
        ],
        artifacts: ['artifact:prd_auth_v1'],
        citations: ['artifact:prd_auth_v1'],
        freshnessScore: 1.0,
        metadata: {
          queryTime: 20,
          tokensUsed: 150,
          cacheHit: false,
        },
      };

      jest.spyOn(MemoryVaultAPI.prototype, 'query').mockResolvedValue(mockContextPack);
      jest.spyOn(MemoryVaultAPI.prototype, 'ingestSignal').mockResolvedValue('signal_full_flow');

      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      try {
        await orchestrator.orchestrate(context);
      } catch (err) {
        // Expected to fail due to mocked execution
      }

      // Verify complete flow:
      // 1. Gate check
      expect(MemoryGate.prototype.check).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Memory gate passed');

      // 2. Context pack query
      expect(MemoryVaultAPI.prototype.query).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          frames: 1,
          freshness: '1.000',
        }),
        'Context pack fetched for RAG'
      );

      // 3. Signal ingestion
      expect(MemoryVaultAPI.prototype.ingestSignal).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(Object),
        'Signal ingested to Memory Vault'
      );
    });
  });

  describe('Theme Mapping', () => {
    beforeEach(() => {
      orchestrator = new MothershipOrchestrator(config);
    });

    it('should map phases to correct themes', () => {
      const testCases = [
        { phase: 'plan', expectedTheme: 'PRD' },
        { phase: 'design', expectedTheme: 'API' },
        { phase: 'story_loop', expectedTheme: 'API' },
        { phase: 'build', expectedTheme: 'CODE' },
        { phase: 'code', expectedTheme: 'CODE' },
        { phase: 'test', expectedTheme: 'TEST' },
        { phase: 'deploy', expectedTheme: 'SECURITY' },
        { phase: 'security', expectedTheme: 'SECURITY' },
        { phase: 'custom_phase', expectedTheme: 'CUSTOM_PHASE' },
      ];

      for (const { phase, expectedTheme } of testCases) {
        const theme = (orchestrator as any).getThemeForPhase(phase);
        expect(theme).toBe(expectedTheme);
      }
    });
  });
});

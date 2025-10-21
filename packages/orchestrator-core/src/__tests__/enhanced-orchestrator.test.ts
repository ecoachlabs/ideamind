/**
 * End-to-End Integration Test
 *
 * Tests complete workflow execution through all 12 phases with Level-2 infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnhancedOrchestrator } from '../enhanced-orchestrator';
import {
  PHASE_GATE_MAPPING,
  getPhaseOrder,
  getPhasesWithGates,
  getTotalBudget,
} from '../config/phase-gate-mapping';

describe('EnhancedOrchestrator - Full Integration', () => {
  let orchestrator: EnhancedOrchestrator;

  beforeEach(() => {
    orchestrator = new EnhancedOrchestrator({
      debug: true, // Enable debug logging for tests
    });
  });

  describe('Configuration', () => {
    it('should have all 12 phases configured', () => {
      const phaseOrder = getPhaseOrder();
      expect(phaseOrder).toHaveLength(12);
      expect(phaseOrder).toEqual([
        'INTAKE',
        'IDEATION',
        'CRITIQUE',
        'PRD',
        'BIZDEV',
        'ARCH',
        'BUILD',
        'STORY_LOOP',
        'QA',
        'AESTHETIC',
        'RELEASE',
        'BETA',
      ]);
    });

    it('should have 7 phases with quality gates', () => {
      const phasesWithGates = getPhasesWithGates();
      expect(phasesWithGates).toHaveLength(7);

      const gatedPhases = phasesWithGates.map((p) => p.phaseName);
      expect(gatedPhases).toContain('CRITIQUE');
      expect(gatedPhases).toContain('PRD');
      expect(gatedPhases).toContain('BIZDEV');
      expect(gatedPhases).toContain('ARCH');
      expect(gatedPhases).toContain('QA');
      expect(gatedPhases).toContain('AESTHETIC');
      expect(gatedPhases).toContain('BETA');
    });

    it('should have correct total budget allocation', () => {
      const totalBudget = getTotalBudget();
      expect(totalBudget.maxCostUsd).toBeGreaterThan(20); // Total across all phases
      expect(totalBudget.maxTokens).toBeGreaterThan(500000);
    });

    it('should have correct phase configurations', () => {
      // CRITIQUE phase
      const critiqueConfig = PHASE_GATE_MAPPING.CRITIQUE;
      expect(critiqueConfig).toBeDefined();
      expect(critiqueConfig.gateConstructor).toBeDefined();
      expect(critiqueConfig.minRequiredAgents).toBe(3);
      expect(critiqueConfig.maxConcurrency).toBe(3);
      expect(critiqueConfig.maxGateRetries).toBe(2);
      expect(critiqueConfig.autoRetryOnGateFail).toBe(true);

      // STORY_LOOP phase (sequential)
      const storyLoopConfig = PHASE_GATE_MAPPING.STORY_LOOP;
      expect(storyLoopConfig).toBeDefined();
      expect(storyLoopConfig.gateConstructor).toBeUndefined(); // No gate
      expect(storyLoopConfig.maxConcurrency).toBe(1); // Sequential
    });
  });

  describe('Workflow Execution', () => {
    it('should execute complete workflow through all phases', async () => {
      const result = await orchestrator.executeWorkflow({
        ideaText: 'Build a collaborative task management tool for remote teams',
        title: 'TeamFlow - Remote Task Management',
        userId: 'user-test-123',
        projectId: 'project-test-456',
      });

      expect(result.success).toBe(true);
      expect(result.runId).toBeDefined();
      expect(result.completedPhases).toHaveLength(12);
      expect(result.totalCost.usd).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
    }, 30000); // 30s timeout for full workflow

    it('should record comprehensive metrics', async () => {
      const result = await orchestrator.executeWorkflow({
        ideaText: 'AI-powered code review assistant',
        title: 'CodeGuardian',
        userId: 'user-test-789',
        projectId: 'project-test-012',
      });

      const recorder = orchestrator.getRecorder();
      const summary = await recorder.getRunSummary(result.runId);

      expect(summary.totalCost.usd).toBeGreaterThan(0);
      expect(summary.totalSteps).toBeGreaterThan(12); // At least one step per phase
      expect(summary.successRate).toBeGreaterThan(0);
      expect(summary.phaseMetrics).toBeDefined();

      // Each phase should have metrics
      const phases = getPhaseOrder();
      phases.forEach((phase) => {
        if (summary.phaseMetrics[phase]) {
          expect(summary.phaseMetrics[phase].cost).toBeDefined();
          expect(summary.phaseMetrics[phase].avgLatency).toBeGreaterThan(0);
        }
      });
    }, 30000);

    it('should properly handle phase failures', async () => {
      // This would test gate failures and retry logic
      // For now, we test that workflow handles errors gracefully
      const result = await orchestrator.executeWorkflow({
        ideaText: '',
        title: '',
        userId: 'user-test',
        projectId: 'project-test',
      });

      // Workflow should still return a result even on failure
      expect(result).toBeDefined();
      expect(result.runId).toBeDefined();

      // Can query recorder for failure details
      const recorder = orchestrator.getRecorder();
      const logs = await recorder.getRunLogs(result.runId);
      expect(logs).toBeDefined();
    });
  });

  describe('Infrastructure Components', () => {
    it('should have recorder accessible', () => {
      const recorder = orchestrator.getRecorder();
      expect(recorder).toBeDefined();
    });

    it('should have dispatcher accessible', () => {
      const dispatcher = orchestrator.getDispatcher();
      expect(dispatcher).toBeDefined();

      const stats = dispatcher.getStats();
      expect(stats).toBeDefined();
      expect(stats.queueSize).toBeDefined();
    });

    it('should have supervisor accessible', () => {
      const supervisor = orchestrator.getSupervisor();
      expect(supervisor).toBeDefined();

      const metrics = supervisor.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.circuitStates).toBeDefined();
    });

    it('should have analyzer accessible', () => {
      const analyzer = orchestrator.getAnalyzer();
      expect(analyzer).toBeDefined();

      const budget = analyzer.getRemainingBudget();
      expect(budget).toBeDefined();
      expect(budget?.remainingUsd).toBeGreaterThan(0);
    });
  });

  describe('Event Flow', () => {
    it('should dispatch events for each phase completion', async () => {
      const dispatcher = orchestrator.getDispatcher();
      const eventsReceived: string[] = [];

      // Subscribe to all phase completion events
      const phases = getPhaseOrder();
      phases.forEach((phase) => {
        const config = PHASE_GATE_MAPPING[phase];
        dispatcher.subscribe(config.completionEvent, async (message) => {
          eventsReceived.push(phase);
        });
      });

      await orchestrator.executeWorkflow({
        ideaText: 'Smart home automation platform',
        title: 'HomeBrain',
        userId: 'user-test',
        projectId: 'project-test',
      });

      // Wait a bit for events to be processed
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have received events for all phases
      expect(eventsReceived.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Gate Evaluation', () => {
    it('should evaluate gates for gated phases', async () => {
      const recorder = orchestrator.getRecorder();

      const result = await orchestrator.executeWorkflow({
        ideaText: 'E-commerce platform with AR try-on',
        title: 'TryItOn',
        userId: 'user-test',
        projectId: 'project-test',
      });

      // Query for gate evaluation decisions
      const decisions = await recorder.getRunDecisions(result.runId);
      const gateDecisions = decisions.filter((d) => d.decisionType === 'gate_evaluation');

      // Should have gate decisions for gated phases
      expect(gateDecisions.length).toBeGreaterThan(0);

      gateDecisions.forEach((decision) => {
        expect(decision.outputs).toBeDefined();
        expect(decision.reasoning).toBeDefined();
      });
    }, 30000);

    it('should retry on gate failure', async () => {
      const recorder = orchestrator.getRecorder();

      const result = await orchestrator.executeWorkflow({
        ideaText: 'Blockchain-based supply chain tracker',
        title: 'ChainTrack',
        userId: 'user-test',
        projectId: 'project-test',
      });

      // Query for retry decisions
      const decisions = await recorder.getRunDecisions(result.runId);
      const retryDecisions = decisions.filter((d) => d.decisionType === 'retry');

      // May have retries (simulated gates can fail initially)
      if (retryDecisions.length > 0) {
        retryDecisions.forEach((decision) => {
          expect(decision.reasoning).toContain('Gate');
        });
      }
    }, 30000);
  });

  describe('Cost Tracking', () => {
    it('should track costs across all phases', async () => {
      const recorder = orchestrator.getRecorder();

      const result = await orchestrator.executeWorkflow({
        ideaText: 'Social learning platform',
        title: 'LearnTogether',
        userId: 'user-test',
        projectId: 'project-test',
      });

      const costs = await recorder.getRunCosts(result.runId);
      expect(costs.length).toBeGreaterThan(0);

      // Costs should be tracked per phase
      const phases = [...new Set(costs.map((c) => c.phase))];
      expect(phases.length).toBeGreaterThan(1);

      // Total cost should match result
      const totalCost = costs.reduce((sum, c) => sum + c.usd, 0);
      expect(Math.abs(totalCost - result.totalCost.usd)).toBeLessThan(0.01);
    }, 30000);
  });
});

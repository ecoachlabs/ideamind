/**
 * Tests for BetaPhaseCoordinator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BetaPhaseCoordinator } from '../beta-phase-coordinator';
import { BetaDistributorAgent } from '../beta-distributor-agent';
import { TelemetryCollectorAgent } from '../telemetry-collector-agent';
import { AnalyticsReporterAgent } from '../analytics-reporter-agent';

// Mock the agents
vi.mock('../beta-distributor-agent');
vi.mock('../telemetry-collector-agent');
vi.mock('../analytics-reporter-agent');

describe('BetaPhaseCoordinator', () => {
  let coordinator: BetaPhaseCoordinator;

  beforeEach(() => {
    coordinator = new BetaPhaseCoordinator({
      budget: {
        maxCostUsd: 2.0,
        maxTokens: 50000,
      },
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct phase configuration', () => {
      expect(coordinator).toBeInstanceOf(BetaPhaseCoordinator);
    });

    it('should set phaseName to BETA', () => {
      expect((coordinator as any).phaseName).toBe('BETA');
    });

    it('should set minRequiredAgents to 3', () => {
      expect((coordinator as any).minRequiredAgents).toBe(3);
    });

    it('should set maxConcurrency to 3 for parallel execution', () => {
      expect((coordinator as any).maxConcurrency).toBe(3);
    });
  });

  describe('execute', () => {
    it('should execute all 3 agents in parallel', async () => {
      // Mock agent execution
      const mockDistributionResult = {
        success: true,
        artifacts: [
          {
            type: 'beta-distribution-plan',
            title: 'Beta Distribution Plan',
            content: JSON.stringify({
              summary: {
                totalChannels: 3,
                totalTesters: 50,
                readyForDistribution: true,
              },
              onboarding: {
                automationLevel: 0.8,
              },
            }),
          },
        ],
      };

      const mockTelemetryResult = {
        success: true,
        artifacts: [
          {
            type: 'telemetry-collection-plan',
            title: 'Telemetry Collection Plan',
            content: JSON.stringify({
              summary: {
                totalEvents: 30,
                totalPlatforms: 2,
                implementationReadiness: 'ready',
              },
              privacy: {
                complianceScore: 85,
              },
            }),
          },
        ],
      };

      const mockAnalyticsResult = {
        success: true,
        artifacts: [
          {
            type: 'analytics-report-plan',
            title: 'Analytics Report Plan',
            content: JSON.stringify({
              summary: {
                totalDashboards: 4,
                overallHealthScore: 80,
                keyInsights: 8,
              },
              keyMetrics: new Array(10).fill({}),
              reportSchedule: [{}, {}, {}],
            }),
          },
        ],
      };

      // Mock agent execute methods
      (BetaDistributorAgent.prototype.execute as any) = vi
        .fn()
        .mockResolvedValue(mockDistributionResult);
      (TelemetryCollectorAgent.prototype.execute as any) = vi
        .fn()
        .mockResolvedValue(mockTelemetryResult);
      (AnalyticsReporterAgent.prototype.execute as any) = vi
        .fn()
        .mockResolvedValue(mockAnalyticsResult);

      const context = {
        workflowRunId: 'test-workflow-123',
        userId: 'user-123',
        projectId: 'project-123',
        previousArtifacts: [],
        ideaSpec: { title: 'Test Idea' },
      };

      const result = await coordinator.execute(context);

      expect(result.success).toBe(true);
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts?.length).toBeGreaterThan(0);
    });

    it('should generate beta-complete artifact', async () => {
      const mockDistributionResult = {
        success: true,
        artifacts: [
          {
            type: 'beta-distribution-plan',
            title: 'Beta Distribution Plan',
            content: JSON.stringify({
              summary: {
                totalChannels: 3,
                totalTesters: 50,
                readyForDistribution: true,
              },
              onboarding: { automationLevel: 0.8 },
            }),
          },
        ],
      };

      const mockTelemetryResult = {
        success: true,
        artifacts: [
          {
            type: 'telemetry-collection-plan',
            title: 'Telemetry Collection Plan',
            content: JSON.stringify({
              summary: {
                totalEvents: 30,
                totalPlatforms: 2,
                implementationReadiness: 'ready',
              },
              privacy: { complianceScore: 85 },
            }),
          },
        ],
      };

      const mockAnalyticsResult = {
        success: true,
        artifacts: [
          {
            type: 'analytics-report-plan',
            title: 'Analytics Report Plan',
            content: JSON.stringify({
              summary: {
                totalDashboards: 4,
                overallHealthScore: 80,
                keyInsights: 8,
              },
              keyMetrics: new Array(10).fill({}),
            }),
          },
        ],
      };

      (BetaDistributorAgent.prototype.execute as any) = vi
        .fn()
        .mockResolvedValue(mockDistributionResult);
      (TelemetryCollectorAgent.prototype.execute as any) = vi
        .fn()
        .mockResolvedValue(mockTelemetryResult);
      (AnalyticsReporterAgent.prototype.execute as any) = vi
        .fn()
        .mockResolvedValue(mockAnalyticsResult);

      const result = await coordinator.execute({
        workflowRunId: 'test-workflow-123',
        userId: 'user-123',
        projectId: 'project-123',
        previousArtifacts: [],
        ideaSpec: {},
      });

      const betaCompleteArtifact = result.artifacts?.find(
        (a) => a.type === 'beta-complete'
      );
      expect(betaCompleteArtifact).toBeDefined();
      expect(betaCompleteArtifact?.title).toBe('BETA Phase Complete');
    });
  });

  describe('aggregateResults', () => {
    it('should calculate beta readiness score correctly', async () => {
      const mockResults = [
        {
          success: true,
          artifacts: [
            {
              type: 'beta-distribution-plan',
              title: 'Distribution',
              content: JSON.stringify({
                summary: {
                  totalChannels: 3,
                  totalTesters: 100,
                  readyForDistribution: true,
                },
                onboarding: { automationLevel: 0.9 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'telemetry-collection-plan',
              title: 'Telemetry',
              content: JSON.stringify({
                summary: {
                  totalEvents: 50,
                  totalPlatforms: 3,
                  implementationReadiness: 'ready',
                },
                privacy: { complianceScore: 95 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'analytics-report-plan',
              title: 'Analytics',
              content: JSON.stringify({
                summary: {
                  totalDashboards: 5,
                  overallHealthScore: 90,
                },
                keyMetrics: new Array(12).fill({}),
                reportSchedule: [{}, {}, {}],
              }),
            },
          ],
        },
      ];

      const result = await (coordinator as any).aggregateResults(mockResults);

      expect(result.summary).toBeDefined();
      expect(result.summary.betaReadinessScore).toBeGreaterThan(0);
      expect(result.summary.betaReadinessScore).toBeLessThanOrEqual(100);
      expect(result.summary.distributionScore).toBeDefined();
      expect(result.summary.telemetryScore).toBeDefined();
      expect(result.summary.analyticsScore).toBeDefined();
    });

    it('should determine READY status for high-quality beta program', async () => {
      const mockResults = [
        {
          success: true,
          artifacts: [
            {
              type: 'beta-distribution-plan',
              title: 'Distribution',
              content: JSON.stringify({
                summary: {
                  totalChannels: 3,
                  totalTesters: 100,
                  readyForDistribution: true,
                },
                onboarding: { automationLevel: 0.9 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'telemetry-collection-plan',
              title: 'Telemetry',
              content: JSON.stringify({
                summary: {
                  totalEvents: 50,
                  totalPlatforms: 3,
                  implementationReadiness: 'ready',
                },
                privacy: { complianceScore: 95 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'analytics-report-plan',
              title: 'Analytics',
              content: JSON.stringify({
                summary: {
                  totalDashboards: 5,
                  overallHealthScore: 90,
                },
                keyMetrics: new Array(12).fill({}),
              }),
            },
          ],
        },
      ];

      const result = await (coordinator as any).aggregateResults(mockResults);

      expect(result.summary.betaStatus).toBe('READY');
    });

    it('should determine BLOCKED status for insufficient beta program', async () => {
      const mockResults = [
        {
          success: true,
          artifacts: [
            {
              type: 'beta-distribution-plan',
              title: 'Distribution',
              content: JSON.stringify({
                summary: {
                  totalChannels: 1,
                  totalTesters: 5,
                  readyForDistribution: false,
                },
                onboarding: { automationLevel: 0.2 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'telemetry-collection-plan',
              title: 'Telemetry',
              content: JSON.stringify({
                summary: {
                  totalEvents: 5,
                  totalPlatforms: 1,
                  implementationReadiness: 'partial',
                },
                privacy: { complianceScore: 50 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'analytics-report-plan',
              title: 'Analytics',
              content: JSON.stringify({
                summary: {
                  totalDashboards: 1,
                  overallHealthScore: 40,
                },
                keyMetrics: [{}, {}],
              }),
            },
          ],
        },
      ];

      const result = await (coordinator as any).aggregateResults(mockResults);

      expect(result.summary.betaStatus).toBe('BLOCKED');
    });

    it('should collect critical issues', async () => {
      const mockResults = [
        {
          success: true,
          artifacts: [
            {
              type: 'beta-distribution-plan',
              title: 'Distribution',
              content: JSON.stringify({
                summary: {
                  totalChannels: 1,
                  totalTesters: 10,
                  readyForDistribution: false,
                },
                onboarding: { automationLevel: 0.3 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'telemetry-collection-plan',
              title: 'Telemetry',
              content: JSON.stringify({
                summary: {
                  totalEvents: 15,
                  totalPlatforms: 1,
                  implementationReadiness: 'partial',
                },
                privacy: { complianceScore: 60 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'analytics-report-plan',
              title: 'Analytics',
              content: JSON.stringify({
                summary: {
                  totalDashboards: 2,
                  overallHealthScore: 55,
                  criticalAlerts: 2,
                },
                keyMetrics: [{}, {}, {}],
              }),
            },
          ],
        },
      ];

      const result = await (coordinator as any).aggregateResults(mockResults);

      expect(result.summary.criticalIssues).toBeDefined();
      expect(result.summary.criticalIssues.length).toBeGreaterThan(0);
    });

    it('should generate recommendations', async () => {
      const mockResults = [
        {
          success: true,
          artifacts: [
            {
              type: 'beta-distribution-plan',
              title: 'Distribution',
              content: JSON.stringify({
                summary: {
                  totalChannels: 2,
                  totalTesters: 50,
                  readyForDistribution: true,
                },
                onboarding: { automationLevel: 0.7 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'telemetry-collection-plan',
              title: 'Telemetry',
              content: JSON.stringify({
                summary: {
                  totalEvents: 25,
                  totalPlatforms: 2,
                  implementationReadiness: 'ready',
                },
                privacy: { complianceScore: 80 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'analytics-report-plan',
              title: 'Analytics',
              content: JSON.stringify({
                summary: {
                  totalDashboards: 3,
                  overallHealthScore: 70,
                },
                keyMetrics: new Array(8).fill({}),
              }),
            },
          ],
        },
      ];

      const result = await (coordinator as any).aggregateResults(mockResults);

      expect(result.summary.recommendations).toBeDefined();
      expect(result.summary.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('weighted scoring', () => {
    it('should apply correct weights: Distribution 35%, Telemetry 35%, Analytics 30%', async () => {
      // Perfect distribution (100), poor telemetry (0), poor analytics (0)
      // Expected: 100*0.35 + 0*0.35 + 0*0.30 = 35

      const mockResults = [
        {
          success: true,
          artifacts: [
            {
              type: 'beta-distribution-plan',
              title: 'Distribution',
              content: JSON.stringify({
                summary: {
                  totalChannels: 3,
                  totalTesters: 100,
                  readyForDistribution: true,
                },
                onboarding: { automationLevel: 1.0 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'telemetry-collection-plan',
              title: 'Telemetry',
              content: JSON.stringify({
                summary: {
                  totalEvents: 0,
                  totalPlatforms: 0,
                  implementationReadiness: 'not_ready',
                },
                privacy: { complianceScore: 0 },
              }),
            },
          ],
        },
        {
          success: true,
          artifacts: [
            {
              type: 'analytics-report-plan',
              title: 'Analytics',
              content: JSON.stringify({
                summary: {
                  totalDashboards: 0,
                  overallHealthScore: 0,
                },
                keyMetrics: [],
              }),
            },
          ],
        },
      ];

      const result = await (coordinator as any).aggregateResults(mockResults);

      // Should be approximately 35 (allowing for rounding)
      expect(result.summary.betaReadinessScore).toBeGreaterThan(30);
      expect(result.summary.betaReadinessScore).toBeLessThan(40);
    });
  });
});

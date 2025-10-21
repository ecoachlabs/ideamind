import { IdeationPhaseCoordinator } from '../../src/ideation/ideation-phase-coordinator';
import { IdeaSpecSchema } from '@ideamine/schemas';

describe('IdeationPhaseCoordinator', () => {
  let coordinator: IdeationPhaseCoordinator;

  beforeEach(() => {
    coordinator = new IdeationPhaseCoordinator({
      budget: {
        maxCostUsd: 2.0,
        maxTokens: 50000,
      },
    });
  });

  describe('Parallel Agent Execution', () => {
    it('should execute all 4 agents in parallel', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Project Management Platform',
        description: `
          Build a comprehensive project management tool for distributed teams.
          Features include real-time collaboration, task tracking, sprint planning,
          and integrations with GitHub, Jira, and Slack.
        `,
        targetUsers: ['project managers', 'software teams', 'remote workers'],
        problemStatement: `
          Distributed teams struggle with coordination and visibility into project status.
          Current tools are either too complex or lack key features for software development teams.
        `,
        successCriteria: [
          '500 active teams in first 3 months',
          '90% user satisfaction score',
          'Average 20% productivity increase',
        ],
        constraints: {
          budget: { min: 2000, max: 5000, currency: 'USD' },
          timeline: { min: 30, max: 60, unit: 'days' },
          technicalPreferences: ['React', 'Node.js', 'PostgreSQL'],
          complianceRequirements: ['SOC2', 'GDPR'],
        },
        attachments: [],
        metadata: {
          tags: ['project-management', 'collaboration'],
          priority: 'high',
          customFields: {},
          source: 'intake-phase',
          category: 'business',
          complexity: 'high',
        },
      };

      const phaseInput = {
        workflowRunId: 'test-run-1',
        userId: 'test-user',
        projectId: 'test-project-1',
        previousArtifacts: [],
        ideaSpec,
      };

      const startTime = Date.now();
      const result = await coordinator.execute(phaseInput);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts!.length).toBeGreaterThan(0);

      // Should complete much faster than sequential execution
      // Sequential: ~40-60s, Parallel: ~10-20s
      expect(duration).toBeLessThan(30000); // 30 seconds max

      console.log(`Ideation phase completed in ${duration}ms`);
    }, 60000); // 60 second timeout

    it('should generate all 4 artifact types', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'E-Commerce Marketplace',
        description: 'A marketplace for handmade crafts connecting artisans with buyers globally.',
        targetUsers: ['craft makers', 'buyers', 'collectors'],
        problemStatement: 'Artisans lack visibility and easy selling channels for handmade goods.',
        successCriteria: ['1000 active sellers', '10K monthly buyers'],
        constraints: {
          budget: { min: 3000, max: 7000, currency: 'USD' },
          timeline: { min: 45, max: 90, unit: 'days' },
          technicalPreferences: [],
          complianceRequirements: ['PCI-DSS'],
        },
        attachments: [],
        metadata: {
          tags: [],
          priority: 'medium',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const result = await coordinator.execute({
        workflowRunId: 'test-run-2',
        userId: 'user',
        projectId: 'proj-2',
        previousArtifacts: [],
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const artifacts = result.artifacts || [];
      const artifactTypes = artifacts.map((a) => a.type);

      // Check for all expected artifact types
      expect(artifactTypes).toContain('product-strategy');
      expect(artifactTypes).toContain('competitive-analysis');
      expect(artifactTypes).toContain('tech-stack-recommendation');
      expect(artifactTypes).toContain('user-personas');
      expect(artifactTypes).toContain('ideation-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'ideation-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('strategy');
      expect(aggregated?.content).toHaveProperty('competitive');
      expect(aggregated?.content).toHaveProperty('techStack');
      expect(aggregated?.content).toHaveProperty('personas');
    }, 60000);
  });

  describe('Resilience and Partial Success', () => {
    it('should succeed even if 1 agent fails (3/4 minimum)', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Minimal Idea',
        description: 'A very simple app with minimal details for testing partial failures.',
        targetUsers: ['users'],
        problemStatement: 'Problem',
        successCriteria: ['Success'],
        constraints: {
          budget: { min: 100, max: 500, currency: 'USD' },
          timeline: { min: 7, max: 14, unit: 'days' },
          technicalPreferences: [],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: [],
          priority: 'low',
          customFields: {},
          category: 'technical',
          complexity: 'low',
        },
      };

      const result = await coordinator.execute({
        workflowRunId: 'test-run-3',
        userId: 'user',
        projectId: 'proj-3',
        previousArtifacts: [],
        ideaSpec,
      });

      // Even with minimal input, at least 3/4 agents should succeed
      expect(result.success).toBe(true);
      expect(result.failedAgents).toBeLessThan(2); // At most 1 failure
    }, 60000);
  });

  describe('Artifact Structure Validation', () => {
    it('should generate properly structured strategy artifact', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'SaaS Analytics Platform',
        description: 'Real-time analytics dashboard for e-commerce businesses.',
        targetUsers: ['e-commerce managers', 'data analysts'],
        problemStatement: 'Businesses lack actionable insights from their data.',
        successCriteria: ['100 paying customers', '$10K MRR'],
        constraints: {
          budget: { min: 5000, max: 10000, currency: 'USD' },
          timeline: { min: 60, max: 90, unit: 'days' },
          technicalPreferences: ['React', 'Python'],
          complianceRequirements: ['SOC2'],
        },
        attachments: [],
        metadata: {
          tags: [],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'high',
        },
      };

      const result = await coordinator.execute({
        workflowRunId: 'test-run-4',
        userId: 'user',
        projectId: 'proj-4',
        previousArtifacts: [],
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const strategy = result.artifacts?.find((a) => a.type === 'product-strategy');
      expect(strategy).toBeDefined();

      const content = strategy?.content;
      expect(content).toHaveProperty('vision');
      expect(content).toHaveProperty('mission');
      expect(content).toHaveProperty('coreValues');
      expect(content).toHaveProperty('productPillars');
      expect(content).toHaveProperty('differentiators');
      expect(content).toHaveProperty('successMetrics');
    }, 60000);

    it('should generate properly structured competitive analysis', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Mobile Fitness App',
        description: 'AI-powered fitness tracking and coaching app.',
        targetUsers: ['fitness enthusiasts', 'athletes'],
        problemStatement: 'People struggle to stay motivated and track progress.',
        successCriteria: ['10K downloads', '4.5+ rating'],
        constraints: {
          budget: { min: 2000, max: 4000, currency: 'USD' },
          timeline: { min: 30, max: 45, unit: 'days' },
          technicalPreferences: ['React Native'],
          complianceRequirements: ['HIPAA'],
        },
        attachments: [],
        metadata: {
          tags: [],
          priority: 'medium',
          customFields: {},
          category: 'creative',
          complexity: 'medium',
        },
      };

      const result = await coordinator.execute({
        workflowRunId: 'test-run-5',
        userId: 'user',
        projectId: 'proj-5',
        previousArtifacts: [],
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const competitive = result.artifacts?.find((a) => a.type === 'competitive-analysis');
      expect(competitive).toBeDefined();

      const content = competitive?.content;
      expect(content).toHaveProperty('marketSize');
      expect(content).toHaveProperty('competitors');
      expect(content).toHaveProperty('marketTrends');
      expect(content).toHaveProperty('opportunities');
      expect(content.marketSize).toHaveProperty('tam');
      expect(content.marketSize).toHaveProperty('sam');
      expect(content.marketSize).toHaveProperty('som');
    }, 60000);
  });

  describe('Performance Benchmarks', () => {
    it('should complete significantly faster than sequential execution', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Performance Test Project',
        description: 'Testing parallel execution performance vs sequential.',
        targetUsers: ['developers'],
        problemStatement: 'Need to validate parallel execution benefits.',
        successCriteria: ['Faster execution'],
        constraints: {
          budget: { min: 500, max: 1000, currency: 'USD' },
          timeline: { min: 14, max: 21, unit: 'days' },
          technicalPreferences: [],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: [],
          priority: 'medium',
          customFields: {},
          category: 'technical',
          complexity: 'medium',
        },
      };

      const startTime = Date.now();
      const result = await coordinator.execute({
        workflowRunId: 'test-run-perf',
        userId: 'user',
        projectId: 'proj-perf',
        previousArtifacts: [],
        ideaSpec,
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);

      // Parallel execution should complete in ~10-20s
      // Sequential would take ~40-60s (4 agents × 10-15s each)
      // We should see at least 2x improvement
      console.log(`\nPerformance Benchmark:`);
      console.log(`  Parallel execution: ${duration}ms`);
      console.log(`  Expected sequential: ~40-60 seconds`);
      console.log(`  Speedup: ~${Math.round((50000 / duration) * 10) / 10}x`);

      // Verify it completed in reasonable time
      expect(duration).toBeLessThan(25000); // Should be < 25s
    }, 60000);
  });
});

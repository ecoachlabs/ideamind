import { BizDevPhaseCoordinator } from '../../src/bizdev/bizdev-phase-coordinator';

describe('BizDevPhaseCoordinator', () => {
  let coordinator: BizDevPhaseCoordinator;

  beforeEach(() => {
    coordinator = new BizDevPhaseCoordinator({
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
        title: 'Task Management Platform',
        description: 'Comprehensive task management and collaboration platform for distributed teams.',
        targetUsers: ['project managers', 'software teams', 'remote workers'],
        problemStatement: 'Teams struggle with task tracking and collaboration in distributed environments.',
        successCriteria: ['500 active teams', '90% user satisfaction', '20% productivity increase'],
        constraints: {
          budget: { min: 5000, max: 15000, currency: 'USD' },
          timeline: { min: 60, max: 90, unit: 'days' },
          technicalPreferences: ['React', 'Node.js', 'PostgreSQL'],
          complianceRequirements: ['SOC2', 'GDPR'],
        },
        attachments: [],
        metadata: {
          tags: ['productivity', 'collaboration'],
          priority: 'high',
          customFields: {},
          source: 'intake-phase',
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        {
          type: 'product-strategy',
          content: {
            vision: 'Simplify collaboration for distributed teams',
            differentiators: ['Real-time sync', 'Slack integration'],
          },
        },
        {
          type: 'competitive-analysis',
          content: {
            competitors: [{ name: 'Asana' }, { name: 'Trello' }],
          },
        },
        {
          type: 'user-personas',
          content: {
            personas: [{ name: 'Sarah the PM' }, { name: 'David the Developer' }],
          },
        },
        {
          type: 'prd-complete',
          content: {
            summary: {
              totalStories: 75,
              totalStoryPoints: 233,
            },
          },
        },
      ];

      const phaseInput = {
        workflowRunId: 'test-run-1',
        userId: 'test-user',
        projectId: 'test-project-1',
        previousArtifacts,
        ideaSpec,
      };

      const startTime = Date.now();
      const result = await coordinator.execute(phaseInput);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts!.length).toBeGreaterThan(0);

      // Should complete much faster than sequential execution
      // Sequential: ~40-60s, Parallel: ~10-15s
      expect(duration).toBeLessThan(25000); // 25 seconds max

      console.log(`BIZDEV phase completed in ${duration}ms`);
    }, 60000); // 60 second timeout

    it('should generate all 5 artifact types', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'E-Learning Platform',
        description: 'Online learning platform with AI-powered personalized learning paths.',
        targetUsers: ['students', 'educators', 'corporate trainers'],
        problemStatement: 'One-size-fits-all learning is ineffective for diverse learners.',
        successCriteria: ['10K students', '80% completion rate', '4.5+ rating'],
        constraints: {
          budget: { min: 10000, max: 30000, currency: 'USD' },
          timeline: { min: 90, max: 120, unit: 'days' },
          technicalPreferences: ['Next.js', 'Python', 'PostgreSQL'],
          complianceRequirements: ['FERPA', 'COPPA'],
        },
        attachments: [],
        metadata: {
          tags: ['education', 'ai'],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: { vision: 'Personalized learning for all' } },
        { type: 'competitive-analysis', content: { competitors: [{ name: 'Coursera' }] } },
        { type: 'user-personas', content: { personas: [] } },
        { type: 'prd-complete', content: { summary: {} } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-2',
        userId: 'user',
        projectId: 'proj-2',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const artifacts = result.artifacts || [];
      const artifactTypes = artifacts.map((a) => a.type);

      // Check for all expected artifact types
      expect(artifactTypes).toContain('viability-analysis');
      expect(artifactTypes).toContain('gtm-plan');
      expect(artifactTypes).toContain('pricing-model');
      expect(artifactTypes).toContain('monetization-strategy');
      expect(artifactTypes).toContain('bizdev-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'bizdev-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('viability');
      expect(aggregated?.content).toHaveProperty('gtm');
      expect(aggregated?.content).toHaveProperty('pricing');
      expect(aggregated?.content).toHaveProperty('monetization');
      expect(aggregated?.content).toHaveProperty('summary');
      expect(aggregated?.content).toHaveProperty('executiveSummary');
    }, 60000);
  });

  describe('Resilience and Partial Success', () => {
    it('should succeed even if 1 agent fails (3/4 minimum)', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Simple App',
        description: 'A minimal app for testing partial failures.',
        targetUsers: ['users'],
        problemStatement: 'Need a simple app',
        successCriteria: ['Working app'],
        constraints: {
          budget: { min: 500, max: 1000, currency: 'USD' },
          timeline: { min: 14, max: 21, unit: 'days' },
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

      const previousArtifacts = [
        { type: 'product-strategy', content: {} },
        { type: 'competitive-analysis', content: {} },
        { type: 'user-personas', content: {} },
        { type: 'prd-complete', content: {} },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-3',
        userId: 'user',
        projectId: 'proj-3',
        previousArtifacts,
        ideaSpec,
      });

      // Even with minimal input, at least 3/4 agents should succeed
      expect(result.success).toBe(true);
      expect(result.failedAgents).toBeLessThan(2); // At most 1 failure
    }, 60000);
  });

  describe('Artifact Structure Validation', () => {
    it('should generate properly structured viability analysis', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'CRM Platform',
        description: 'Customer relationship management platform for small businesses.',
        targetUsers: ['sales teams', 'small business owners'],
        problemStatement: 'Small businesses lack affordable CRM solutions.',
        successCriteria: ['100 paying customers', '$10K MRR'],
        constraints: {
          budget: { min: 8000, max: 20000, currency: 'USD' },
          timeline: { min: 60, max: 90, unit: 'days' },
          technicalPreferences: ['React', 'Node.js'],
          complianceRequirements: ['GDPR'],
        },
        attachments: [],
        metadata: {
          tags: ['crm', 'sales'],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: { vision: 'Affordable CRM for SMBs' } },
        { type: 'competitive-analysis', content: {} },
        { type: 'user-personas', content: {} },
        { type: 'prd-complete', content: {} },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-4',
        userId: 'user',
        projectId: 'proj-4',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const viability = result.artifacts?.find((a) => a.type === 'viability-analysis');
      expect(viability).toBeDefined();

      const content = viability?.content;
      expect(content).toHaveProperty('financialProjections');
      expect(content).toHaveProperty('unitEconomics');
      expect(content).toHaveProperty('marketSizing');
      expect(content).toHaveProperty('riskAssessment');
      expect(content).toHaveProperty('recommendation');
      expect(content).toHaveProperty('viabilityScore');

      // Validate unit economics
      const unitEcon = content?.unitEconomics;
      expect(unitEcon).toHaveProperty('ltv');
      expect(unitEcon).toHaveProperty('cac');
      expect(unitEcon).toHaveProperty('ltvCacRatio');
      expect(unitEcon).toHaveProperty('paybackPeriod');
      expect(unitEcon).toHaveProperty('churnRate');
    }, 60000);

    it('should generate properly structured GTM plan', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Inventory Management System',
        description: 'Real-time inventory tracking and management for warehouses.',
        targetUsers: ['warehouse managers', 'logistics teams'],
        problemStatement: 'Warehouses lack real-time visibility into inventory levels.',
        successCriteria: ['5 warehouse clients', '99% inventory accuracy'],
        constraints: {
          budget: { min: 15000, max: 40000, currency: 'USD' },
          timeline: { min: 90, max: 150, unit: 'days' },
          technicalPreferences: ['React', 'Java', 'PostgreSQL'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['logistics', 'inventory'],
          priority: 'medium',
          customFields: {},
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: {} },
        { type: 'competitive-analysis', content: {} },
        { type: 'user-personas', content: {} },
        { type: 'prd-complete', content: {} },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-5',
        userId: 'user',
        projectId: 'proj-5',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const gtm = result.artifacts?.find((a) => a.type === 'gtm-plan');
      expect(gtm).toBeDefined();

      const content = gtm?.content;
      expect(content).toHaveProperty('positioning');
      expect(content).toHaveProperty('targetSegments');
      expect(content).toHaveProperty('marketingChannels');
      expect(content).toHaveProperty('salesStrategy');
      expect(content).toHaveProperty('launchPlan');
      expect(content).toHaveProperty('partnerships');
      expect(content).toHaveProperty('metrics');

      // Validate launch plan
      const launchPlan = content?.launchPlan;
      expect(launchPlan).toHaveProperty('phases');
      expect(Array.isArray(launchPlan?.phases)).toBe(true);
      expect(launchPlan?.phases?.length).toBeGreaterThan(0);
    }, 60000);

    it('should generate properly structured pricing model', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Appointment Scheduling App',
        description: 'Online appointment scheduling for service businesses.',
        targetUsers: ['service providers', 'clients'],
        problemStatement: 'Service businesses struggle with manual appointment scheduling.',
        successCriteria: ['100 businesses', '1000 appointments/month'],
        constraints: {
          budget: { min: 5000, max: 12000, currency: 'USD' },
          timeline: { min: 45, max: 60, unit: 'days' },
          technicalPreferences: ['Next.js', 'Node.js'],
          complianceRequirements: ['HIPAA'],
        },
        attachments: [],
        metadata: {
          tags: ['scheduling', 'services'],
          priority: 'medium',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: {} },
        { type: 'competitive-analysis', content: {} },
        { type: 'user-personas', content: {} },
        { type: 'prd-complete', content: {} },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-6',
        userId: 'user',
        projectId: 'proj-6',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const pricing = result.artifacts?.find((a) => a.type === 'pricing-model');
      expect(pricing).toBeDefined();

      const content = pricing?.content;
      expect(content).toHaveProperty('tiers');
      expect(content).toHaveProperty('strategy');
      expect(content).toHaveProperty('competitiveAnalysis');
      expect(content).toHaveProperty('revenueProjection');
      expect(content).toHaveProperty('valueMetrics');

      // Validate tiers
      expect(Array.isArray(content?.tiers)).toBe(true);
      expect(content?.tiers?.length).toBeGreaterThan(0);

      const tier = content?.tiers?.[0];
      if (tier) {
        expect(tier).toHaveProperty('name');
        expect(tier).toHaveProperty('price');
        expect(tier).toHaveProperty('features');
        expect(tier).toHaveProperty('limits');
      }
    }, 60000);

    it('should generate properly structured monetization strategy', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Content Publishing Platform',
        description: 'Platform for content creators to publish and monetize their content.',
        targetUsers: ['content creators', 'readers', 'advertisers'],
        problemStatement: 'Content creators struggle to monetize their work effectively.',
        successCriteria: ['1000 creators', '$50K MRR', '100K readers'],
        constraints: {
          budget: { min: 20000, max: 50000, currency: 'USD' },
          timeline: { min: 120, max: 180, unit: 'days' },
          technicalPreferences: ['Next.js', 'Node.js', 'PostgreSQL'],
          complianceRequirements: ['GDPR', 'CCPA'],
        },
        attachments: [],
        metadata: {
          tags: ['content', 'publishing', 'monetization'],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: {} },
        { type: 'competitive-analysis', content: {} },
        { type: 'user-personas', content: {} },
        { type: 'prd-complete', content: {} },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-7',
        userId: 'user',
        projectId: 'proj-7',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const monetization = result.artifacts?.find((a) => a.type === 'monetization-strategy');
      expect(monetization).toBeDefined();

      const content = monetization?.content;
      expect(content).toHaveProperty('overallStrategy');
      expect(content).toHaveProperty('revenueStreams');
      expect(content).toHaveProperty('monetizationOpportunities');
      expect(content).toHaveProperty('revenueOptimization');
      expect(content).toHaveProperty('longTermGrowth');
      expect(content).toHaveProperty('complianceConsiderations');

      // Validate revenue streams
      expect(Array.isArray(content?.revenueStreams)).toBe(true);
      expect(content?.revenueStreams?.length).toBeGreaterThan(0);

      const stream = content?.revenueStreams?.[0];
      if (stream) {
        expect(stream).toHaveProperty('type');
        expect(stream).toHaveProperty('priority');
        expect(stream).toHaveProperty('targetRevenue');
        expect(stream).toHaveProperty('implementationComplexity');
      }
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
        description: 'Testing parallel execution performance.',
        targetUsers: ['developers'],
        problemStatement: 'Need to validate parallel execution benefits.',
        successCriteria: ['Faster execution'],
        constraints: {
          budget: { min: 1000, max: 2000, currency: 'USD' },
          timeline: { min: 21, max: 30, unit: 'days' },
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

      const previousArtifacts = [
        { type: 'product-strategy', content: {} },
        { type: 'competitive-analysis', content: {} },
        { type: 'user-personas', content: {} },
        { type: 'prd-complete', content: {} },
      ];

      const startTime = Date.now();
      const result = await coordinator.execute({
        workflowRunId: 'test-run-perf',
        userId: 'user',
        projectId: 'proj-perf',
        previousArtifacts,
        ideaSpec,
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);

      // Parallel execution should complete in ~10-15s
      // Sequential would take ~40-60s (4 agents × 10-15s each)
      // We should see at least 2.5x improvement
      console.log(`\nPerformance Benchmark:`);
      console.log(`  Parallel execution: ${duration}ms`);
      console.log(`  Expected sequential: ~40-60 seconds`);
      console.log(`  Speedup: ~${Math.round((50000 / duration) * 10) / 10}x`);

      // Verify it completed in reasonable time
      expect(duration).toBeLessThan(25000); // Should be < 25s
    }, 60000);
  });
});

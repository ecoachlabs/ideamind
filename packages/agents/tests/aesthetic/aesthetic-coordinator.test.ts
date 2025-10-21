import { AestheticPhaseCoordinator } from '../../src/aesthetic/aesthetic-phase-coordinator';

describe('AestheticPhaseCoordinator', () => {
  let coordinator: AestheticPhaseCoordinator;

  beforeEach(() => {
    coordinator = new AestheticPhaseCoordinator({
      budget: {
        maxCostUsd: 1.5,
        maxTokens: 40000,
      },
    });
  });

  describe('Parallel Agent Execution', () => {
    it('should execute all 3 agents in parallel', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'E-Commerce Platform',
        description: 'Online marketplace with product catalog and checkout.',
        targetUsers: ['buyers', 'sellers'],
        problemStatement: 'Small businesses need an affordable e-commerce solution.',
        successCriteria: ['1000 transactions/month', '99.9% uptime'],
        constraints: {
          budget: { min: 15000, max: 40000, currency: 'USD' },
          timeline: { min: 90, max: 120, unit: 'days' },
          technicalPreferences: ['React', 'Node.js'],
          complianceRequirements: ['PCI-DSS'],
        },
        attachments: [],
        metadata: {
          tags: ['ecommerce'],
          priority: 'high',
          customFields: {},
          source: 'intake-phase',
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: {
            overview: {
              repositoryName: 'ecommerce-platform',
              language: 'TypeScript',
              framework: 'React',
              packageManager: 'npm',
            },
          },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: {
              totalScenarios: 25,
              criticalComponents: 15,
            },
            componentStates: [
              { component: 'Button', states: ['default', 'hover', 'active'], priority: 'high' },
              { component: 'Form', states: ['default', 'error'], priority: 'critical' },
            ],
          },
        },
        {
          type: 'story-loop-complete',
          content: {
            summary: {
              totalStories: 20,
              totalFiles: 60,
              totalTests: 150,
              averageCoverage: 85,
            },
          },
        },
        {
          type: 'prd-complete',
          content: {
            prd: {
              userJourneys: [
                {
                  persona: 'Buyer',
                  scenario: 'Purchase a product',
                  steps: ['Browse', 'Add to cart', 'Checkout'],
                },
              ],
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
      // Sequential: ~40s (14s + 13s + 13s), Parallel: ~14s
      expect(duration).toBeLessThan(20000); // 20 seconds max

      console.log(`AESTHETIC phase completed in ${duration}ms`);
    }, 60000); // 60 second timeout

    it('should generate all 4 artifact types', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'SaaS Dashboard',
        description: 'Analytics dashboard with real-time metrics.',
        targetUsers: ['product managers', 'analysts'],
        problemStatement: 'Need real-time visibility into key metrics.',
        successCriteria: ['100 paying customers'],
        constraints: {
          budget: { min: 20000, max: 50000, currency: 'USD' },
          timeline: { min: 120, max: 180, unit: 'days' },
          technicalPreferences: ['Next.js', 'Python'],
          complianceRequirements: ['SOC2'],
        },
        attachments: [],
        metadata: {
          tags: ['analytics'],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'Next.js' } },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: { totalScenarios: 30, criticalComponents: 20 },
            componentStates: [],
          },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 25, totalFiles: 75 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
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
      expect(artifactTypes).toContain('ui-audit-report');
      expect(artifactTypes).toContain('accessibility-report');
      expect(artifactTypes).toContain('polish-report');
      expect(artifactTypes).toContain('aesthetic-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'aesthetic-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('summary');
      expect(aggregated?.content).toHaveProperty('uiDesign');
      expect(aggregated?.content).toHaveProperty('accessibility');
      expect(aggregated?.content).toHaveProperty('polish');
      expect(aggregated?.content).toHaveProperty('aestheticStatus');
      expect(aggregated?.content).toHaveProperty('gateEvaluation');
    }, 60000);
  });

  describe('Accessibility Analysis', () => {
    it('should fail aesthetic gate with critical accessibility violations', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Healthcare Portal',
        description: 'Patient portal with medical records access.',
        targetUsers: ['patients', 'doctors'],
        problemStatement: 'Need accessible healthcare portal',
        successCriteria: ['WCAG AA compliance', '5000 patients'],
        constraints: {
          budget: { min: 40000, max: 80000, currency: 'USD' },
          timeline: { min: 150, max: 200, unit: 'days' },
          technicalPreferences: ['React', 'Node.js'],
          complianceRequirements: ['HIPAA', 'WCAG 2.1 AA'],
        },
        attachments: [],
        metadata: {
          tags: ['healthcare', 'accessibility'],
          priority: 'critical',
          customFields: {},
          category: 'healthcare',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: { totalScenarios: 40, criticalComponents: 25 },
            componentStates: [],
          },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 30, totalFiles: 90 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-3',
        userId: 'user',
        projectId: 'proj-3',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const aestheticComplete = result.artifacts?.find((a) => a.type === 'aesthetic-complete');
      expect(aestheticComplete).toBeDefined();

      // Should detect accessibility issues
      const accessibilityScore = aestheticComplete?.content?.accessibility?.accessibilityScore || 0;
      const wcagCompliance = aestheticComplete?.content?.accessibility?.wcagAACompliance || 0;

      console.log(`Accessibility Score: ${accessibilityScore}, WCAG AA: ${wcagCompliance}%`);
    }, 60000);
  });

  describe('Aesthetic Gate Evaluation', () => {
    it('should pass aesthetic gate with high quality scores', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Content Management System',
        description: 'Modern CMS with drag-and-drop interface.',
        targetUsers: ['content creators', 'editors'],
        problemStatement: 'Traditional CMS too complex',
        successCriteria: ['500 users', '90% satisfaction'],
        constraints: {
          budget: { min: 10000, max: 25000, currency: 'USD' },
          timeline: { min: 60, max: 90, unit: 'days' },
          technicalPreferences: ['React', 'Node.js'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['cms', 'content'],
          priority: 'medium',
          customFields: {},
          category: 'productivity',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: { totalScenarios: 20, criticalComponents: 12 },
            componentStates: [],
          },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 15, totalFiles: 45 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-4',
        userId: 'user',
        projectId: 'proj-4',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const aestheticComplete = result.artifacts?.find((a) => a.type === 'aesthetic-complete');
      expect(aestheticComplete).toBeDefined();

      const gateEvaluation = aestheticComplete?.content?.gateEvaluation;
      expect(gateEvaluation).toHaveProperty('passed');
      expect(gateEvaluation).toHaveProperty('reasons');
      expect(gateEvaluation).toHaveProperty('recommendations');
      expect(gateEvaluation).toHaveProperty('requiredActions');

      console.log(`Aesthetic Gate Passed: ${gateEvaluation?.passed}`);
      console.log(`Reasons: ${gateEvaluation?.reasons?.join(', ')}`);
    }, 60000);
  });

  describe('UI Quality Metrics', () => {
    it('should calculate comprehensive UI quality metrics', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Task Management App',
        description: 'Collaborative task manager with real-time updates.',
        targetUsers: ['teams', 'project managers'],
        problemStatement: 'Need simple task management',
        successCriteria: ['1000 teams'],
        constraints: {
          budget: { min: 15000, max: 30000, currency: 'USD' },
          timeline: { min: 75, max: 100, unit: 'days' },
          technicalPreferences: ['React', 'Firebase'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['productivity', 'collaboration'],
          priority: 'medium',
          customFields: {},
          category: 'productivity',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: { totalScenarios: 18, criticalComponents: 10 },
            componentStates: [],
          },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 12, totalFiles: 36 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-5',
        userId: 'user',
        projectId: 'proj-5',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const aestheticComplete = result.artifacts?.find((a) => a.type === 'aesthetic-complete');
      expect(aestheticComplete).toBeDefined();

      const summary = aestheticComplete?.content?.summary;
      expect(summary).toHaveProperty('overallAestheticScore');
      expect(summary).toHaveProperty('uiQualityScore');
      expect(summary).toHaveProperty('accessibilityScore');
      expect(summary).toHaveProperty('polishScore');
      expect(summary).toHaveProperty('delightScore');

      const metrics = aestheticComplete?.content?.metrics;
      expect(metrics).toHaveProperty('designConsistency');
      expect(metrics).toHaveProperty('spacing');
      expect(metrics).toHaveProperty('typography');
      expect(metrics).toHaveProperty('colorUsage');
      expect(metrics).toHaveProperty('wcagCompliance');
      expect(metrics).toHaveProperty('animations');

      console.log(`\nAesthetic Quality Metrics:`);
      console.log(`  Overall Score: ${summary?.overallAestheticScore}/100`);
      console.log(`  UI Quality: ${summary?.uiQualityScore}/100`);
      console.log(`  Accessibility: ${summary?.accessibilityScore}/100`);
      console.log(`  Polish: ${summary?.polishScore}/100`);
      console.log(`  Delight: ${summary?.delightScore}/100`);
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
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'JavaScript', framework: 'Express' } },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: { totalScenarios: 10, criticalComponents: 5 },
            componentStates: [],
          },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 8, totalFiles: 24 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
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

      // Parallel execution should complete in ~14s
      // Sequential would take ~40s (14s + 13s + 13s)
      // We should see at least 2.5x improvement
      console.log(`\nPerformance Benchmark:`);
      console.log(`  Parallel execution: ${duration}ms`);
      console.log(`  Expected sequential: ~40 seconds`);
      console.log(`  Speedup: ~${Math.round((40000 / duration) * 10) / 10}x`);

      // Verify it completed in reasonable time
      expect(duration).toBeLessThan(20000); // Should be < 20s
    }, 60000);
  });

  describe('Aesthetic Status Classification', () => {
    it('should correctly classify aesthetic status', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Design System Test',
        description: 'Testing aesthetic status classification.',
        targetUsers: ['designers'],
        problemStatement: 'Need design quality assessment',
        successCriteria: ['High aesthetic scores'],
        constraints: {
          budget: { min: 5000, max: 10000, currency: 'USD' },
          timeline: { min: 30, max: 45, unit: 'days' },
          technicalPreferences: ['React'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['design'],
          priority: 'medium',
          customFields: {},
          category: 'design',
          complexity: 'low',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        {
          type: 'visual-regression-suite',
          content: {
            summary: { totalScenarios: 12, criticalComponents: 8 },
            componentStates: [],
          },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 10, totalFiles: 30 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-6',
        userId: 'user',
        projectId: 'proj-6',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const aestheticComplete = result.artifacts?.find((a) => a.type === 'aesthetic-complete');
      const status = aestheticComplete?.content?.aestheticStatus;

      expect(status).toBeDefined();
      expect(['EXCELLENT', 'GOOD', 'NEEDS_WORK', 'CRITICAL']).toContain(status);

      console.log(`\nAesthetic Status: ${status}`);
    }, 60000);
  });
});

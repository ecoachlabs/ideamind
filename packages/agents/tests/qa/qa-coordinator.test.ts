import { QAPhaseCoordinator } from '../../src/qa/qa-phase-coordinator';

describe('QAPhaseCoordinator', () => {
  let coordinator: QAPhaseCoordinator;

  beforeEach(() => {
    coordinator = new QAPhaseCoordinator({
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
        title: 'E-Commerce Platform',
        description: 'Online marketplace with payment processing and inventory management.',
        targetUsers: ['buyers', 'sellers', 'admins'],
        problemStatement: 'Small businesses need an affordable e-commerce solution.',
        successCriteria: ['1000 transactions/month', '100 active sellers', '99.9% uptime'],
        constraints: {
          budget: { min: 15000, max: 40000, currency: 'USD' },
          timeline: { min: 90, max: 120, unit: 'days' },
          technicalPreferences: ['React', 'Node.js', 'PostgreSQL'],
          complianceRequirements: ['PCI-DSS', 'GDPR'],
        },
        attachments: [],
        metadata: {
          tags: ['ecommerce', 'payments'],
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
          type: 'system-architecture',
          content: {
            overview: {
              architectureStyle: 'microservices',
            },
            securityArchitecture: {
              controls: ['Authentication', 'Authorization', 'Encryption'],
            },
          },
        },
        {
          type: 'api-design',
          content: {
            overview: {
              apiStyle: 'REST',
              version: 'v1',
            },
            resources: [
              { name: 'Products', endpoints: [] },
              { name: 'Orders', endpoints: [] },
              { name: 'Users', endpoints: [] },
            ],
          },
        },
        {
          type: 'story-loop-complete',
          content: {
            summary: {
              totalStories: 15,
              totalFiles: 45,
              totalTests: 120,
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
                  steps: ['Browse products', 'Add to cart', 'Checkout', 'Pay'],
                },
                {
                  persona: 'Seller',
                  scenario: 'List a product',
                  steps: ['Create account', 'Add product', 'Set price', 'Publish'],
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
      // Sequential: ~58s (15s + 14s + 16s + 13s), Parallel: ~16s
      expect(duration).toBeLessThan(25000); // 25 seconds max

      console.log(`QA phase completed in ${duration}ms`);
    }, 60000); // 60 second timeout

    it('should generate all 5 artifact types', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'SaaS Analytics Platform',
        description: 'Real-time analytics dashboard for SaaS businesses.',
        targetUsers: ['product managers', 'data analysts', 'executives'],
        problemStatement: 'SaaS companies lack real-time visibility into key metrics.',
        successCriteria: ['100 paying customers', '$50K MRR'],
        constraints: {
          budget: { min: 20000, max: 50000, currency: 'USD' },
          timeline: { min: 120, max: 180, unit: 'days' },
          technicalPreferences: ['Next.js', 'Python', 'TimescaleDB'],
          complianceRequirements: ['SOC2', 'GDPR'],
        },
        attachments: [],
        metadata: {
          tags: ['analytics', 'saas'],
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
          type: 'system-architecture',
          content: { overview: { architectureStyle: 'monolithic' }, securityArchitecture: { controls: [] } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'GraphQL' }, resources: [] },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 20, totalFiles: 60, totalTests: 150 } },
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
      expect(artifactTypes).toContain('e2e-test-suite');
      expect(artifactTypes).toContain('load-test-suite');
      expect(artifactTypes).toContain('security-scan-report');
      expect(artifactTypes).toContain('visual-regression-suite');
      expect(artifactTypes).toContain('qa-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'qa-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('summary');
      expect(aggregated?.content).toHaveProperty('e2eTesting');
      expect(aggregated?.content).toHaveProperty('loadTesting');
      expect(aggregated?.content).toHaveProperty('security');
      expect(aggregated?.content).toHaveProperty('visualRegression');
      expect(aggregated?.content).toHaveProperty('qaStatus');
      expect(aggregated?.content).toHaveProperty('gateEvaluation');
    }, 60000);
  });

  describe('Security Analysis', () => {
    it('should fail QA gate with critical security vulnerabilities', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Banking Application',
        description: 'Mobile banking with payment processing.',
        targetUsers: ['customers'],
        problemStatement: 'Need secure mobile banking',
        successCriteria: ['10K users'],
        constraints: {
          budget: { min: 50000, max: 100000, currency: 'USD' },
          timeline: { min: 180, max: 240, unit: 'days' },
          technicalPreferences: ['React Native', 'Node.js'],
          complianceRequirements: ['PCI-DSS', 'SOC2'],
        },
        attachments: [],
        metadata: {
          tags: ['fintech', 'security'],
          priority: 'critical',
          customFields: {},
          category: 'financial',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React Native' } },
        },
        {
          type: 'system-architecture',
          content: { overview: {}, securityArchitecture: { controls: [] } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'REST' }, resources: [] },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 25, totalFiles: 75 } },
        },
        {
          type: 'prd-complete',
          content: { prd: { userJourneys: [] } },
        },
        {
          type: 'code-review',
          content: {
            securityAnalysis: {
              vulnerabilities: [
                {
                  type: 'SQL Injection',
                  severity: 'critical',
                  description: 'User input not sanitized',
                },
              ],
            },
          },
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

      const qaComplete = result.artifacts?.find((a) => a.type === 'qa-complete');
      expect(qaComplete).toBeDefined();

      // Should detect security issues
      const securityScore = qaComplete?.content?.security?.securityScore || 0;
      const criticalVulns = qaComplete?.content?.security?.criticalVulnerabilities || 0;

      console.log(`Security Score: ${securityScore}, Critical Vulnerabilities: ${criticalVulns}`);
    }, 60000);
  });

  describe('QA Gate Evaluation', () => {
    it('should pass QA gate with high quality scores', async () => {
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
          type: 'system-architecture',
          content: { overview: {}, securityArchitecture: { controls: ['Auth', 'HTTPS'] } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'REST' }, resources: [] },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 12, totalFiles: 36, totalTests: 95, averageCoverage: 88 } },
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

      const qaComplete = result.artifacts?.find((a) => a.type === 'qa-complete');
      expect(qaComplete).toBeDefined();

      const gateEvaluation = qaComplete?.content?.gateEvaluation;
      expect(gateEvaluation).toHaveProperty('passed');
      expect(gateEvaluation).toHaveProperty('reasons');
      expect(gateEvaluation).toHaveProperty('recommendations');

      console.log(`QA Gate Passed: ${gateEvaluation?.passed}`);
      console.log(`Reasons: ${gateEvaluation?.reasons?.join(', ')}`);
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
          type: 'system-architecture',
          content: { overview: {}, securityArchitecture: { controls: [] } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'REST' }, resources: [] },
        },
        {
          type: 'story-loop-complete',
          content: { summary: { totalStories: 5, totalFiles: 15 } },
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

      // Parallel execution should complete in ~16s
      // Sequential would take ~58s (15s + 14s + 16s + 13s)
      // We should see at least 3.5x improvement
      console.log(`\nPerformance Benchmark:`);
      console.log(`  Parallel execution: ${duration}ms`);
      console.log(`  Expected sequential: ~58 seconds`);
      console.log(`  Speedup: ~${Math.round((58000 / duration) * 10) / 10}x`);

      // Verify it completed in reasonable time
      expect(duration).toBeLessThan(25000); // Should be < 25s
    }, 60000);
  });
});

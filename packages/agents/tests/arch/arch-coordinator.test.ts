import { ArchPhaseCoordinator } from '../../src/arch/arch-phase-coordinator';

describe('ArchPhaseCoordinator', () => {
  let coordinator: ArchPhaseCoordinator;

  beforeEach(() => {
    coordinator = new ArchPhaseCoordinator({
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
          type: 'prd-complete',
          content: {
            prd: {
              functionalRequirements: [
                { id: 'FR-001', category: 'Core', requirement: 'User authentication', priority: 'must-have' },
                { id: 'FR-002', category: 'Core', requirement: 'Task creation', priority: 'must-have' },
              ],
              nonFunctionalRequirements: {
                performance: '< 500ms response time',
                security: 'HTTPS, JWT authentication',
                scalability: 'Support 10K concurrent users',
              },
              userJourneys: [
                { persona: 'Project Manager', scenario: 'Create and assign tasks' },
              ],
            },
            summary: {
              totalStories: 75,
              totalStoryPoints: 233,
            },
          },
        },
        {
          type: 'bizdev-complete',
          content: {
            viability: {
              financialProjections: {
                revenue: { year1: 500000, year2: 1500000, year3: 3000000 },
              },
            },
            summary: {},
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
      // Sequential: ~48-60s, Parallel: ~12-15s
      expect(duration).toBeLessThan(25000); // 25 seconds max

      console.log(`ARCH phase completed in ${duration}ms`);
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
        { type: 'prd-complete', content: { prd: { functionalRequirements: [], nonFunctionalRequirements: {} } } },
        { type: 'bizdev-complete', content: {} },
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
      expect(artifactTypes).toContain('system-architecture');
      expect(artifactTypes).toContain('api-design');
      expect(artifactTypes).toContain('data-model');
      expect(artifactTypes).toContain('infrastructure-plan');
      expect(artifactTypes).toContain('arch-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'arch-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('systemArchitecture');
      expect(aggregated?.content).toHaveProperty('apiDesign');
      expect(aggregated?.content).toHaveProperty('dataModel');
      expect(aggregated?.content).toHaveProperty('infrastructurePlan');
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
        { type: 'prd-complete', content: { prd: {} } },
        { type: 'bizdev-complete', content: {} },
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
    it('should generate properly structured system architecture', async () => {
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
        { type: 'prd-complete', content: { prd: {} } },
        { type: 'bizdev-complete', content: {} },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-4',
        userId: 'user',
        projectId: 'proj-4',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const arch = result.artifacts?.find((a) => a.type === 'system-architecture');
      expect(arch).toBeDefined();

      const content = arch?.content;
      expect(content).toHaveProperty('overview');
      expect(content).toHaveProperty('components');
      expect(content).toHaveProperty('integrationPatterns');
      expect(content).toHaveProperty('securityArchitecture');
      expect(content).toHaveProperty('scalabilityDesign');
      expect(content).toHaveProperty('architectureDecisionRecords');
      expect(content).toHaveProperty('technologyStack');
      expect(content).toHaveProperty('deploymentArchitecture');

      // Validate overview
      expect(content?.overview).toHaveProperty('architectureStyle');
      expect(content?.overview).toHaveProperty('rationale');
      expect(content?.overview).toHaveProperty('designPrinciples');

      // Validate ADRs
      expect(Array.isArray(content?.architectureDecisionRecords)).toBe(true);
      expect(content?.architectureDecisionRecords?.length).toBeGreaterThan(0);
    }, 60000);

    it('should generate properly structured API design', async () => {
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
        { type: 'prd-complete', content: { prd: { functionalRequirements: [] } } },
        { type: 'bizdev-complete', content: {} },
        { type: 'system-architecture', content: { overview: { architectureStyle: 'microservices' } } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-5',
        userId: 'user',
        projectId: 'proj-5',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const api = result.artifacts?.find((a) => a.type === 'api-design');
      expect(api).toBeDefined();

      const content = api?.content;
      expect(content).toHaveProperty('overview');
      expect(content).toHaveProperty('authentication');
      expect(content).toHaveProperty('resources');
      expect(content).toHaveProperty('errorHandling');
      expect(content).toHaveProperty('pagination');
      expect(content).toHaveProperty('rateLimiting');
      expect(content).toHaveProperty('documentation');

      // Validate resources
      expect(Array.isArray(content?.resources)).toBe(true);
      expect(content?.resources?.length).toBeGreaterThan(0);

      // Validate endpoints in resources
      if (content?.resources?.length > 0) {
        const resource = content.resources[0];
        expect(resource).toHaveProperty('endpoints');
        expect(Array.isArray(resource.endpoints)).toBe(true);
      }
    }, 60000);

    it('should generate properly structured data model', async () => {
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
        { type: 'prd-complete', content: { prd: {} } },
        { type: 'bizdev-complete', content: {} },
        { type: 'system-architecture', content: {} },
        { type: 'api-design', content: { resources: [{ name: 'Users' }, { name: 'Appointments' }] } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-6',
        userId: 'user',
        projectId: 'proj-6',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const dataModel = result.artifacts?.find((a) => a.type === 'data-model');
      expect(dataModel).toBeDefined();

      const content = dataModel?.content;
      expect(content).toHaveProperty('overview');
      expect(content).toHaveProperty('entities');
      expect(content).toHaveProperty('validationRules');
      expect(content).toHaveProperty('migrationStrategy');
      expect(content).toHaveProperty('queryOptimization');
      expect(content).toHaveProperty('dataGovernance');
      expect(content).toHaveProperty('scalabilityConsiderations');
      expect(content).toHaveProperty('backupAndRecovery');

      // Validate entities
      expect(Array.isArray(content?.entities)).toBe(true);
      expect(content?.entities?.length).toBeGreaterThan(0);

      // Validate entity structure
      if (content?.entities?.length > 0) {
        const entity = content.entities[0];
        expect(entity).toHaveProperty('name');
        expect(entity).toHaveProperty('fields');
        expect(entity).toHaveProperty('indexes');
        expect(entity).toHaveProperty('relationships');
      }
    }, 60000);

    it('should generate properly structured infrastructure plan', async () => {
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
        { type: 'prd-complete', content: { prd: {} } },
        { type: 'bizdev-complete', content: {} },
        {
          type: 'system-architecture',
          content: {
            overview: { architectureStyle: 'microservices' },
            components: [
              { name: 'Web App', scalingStrategy: 'horizontal' },
              { name: 'API Server', scalingStrategy: 'horizontal' },
            ],
            scalabilityDesign: {
              currentCapacity: { users: '1K', data: '10GB' },
              targetCapacity: { users: '100K', data: '10TB' },
            },
            deploymentArchitecture: {
              disasterRecovery: { rpo: '1 hour', rto: '4 hours' },
            },
          },
        },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-7',
        userId: 'user',
        projectId: 'proj-7',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const infra = result.artifacts?.find((a) => a.type === 'infrastructure-plan');
      expect(infra).toBeDefined();

      const content = infra?.content;
      expect(content).toHaveProperty('overview');
      expect(content).toHaveProperty('components');
      expect(content).toHaveProperty('networking');
      expect(content).toHaveProperty('security');
      expect(content).toHaveProperty('autoScaling');
      expect(content).toHaveProperty('cicdPipeline');
      expect(content).toHaveProperty('monitoring');
      expect(content).toHaveProperty('disasterRecovery');
      expect(content).toHaveProperty('costOptimization');
      expect(content).toHaveProperty('containerOrchestration');

      // Validate overview
      expect(content?.overview).toHaveProperty('cloudProvider');
      expect(content?.overview).toHaveProperty('estimatedMonthlyCost');

      // Validate components
      expect(Array.isArray(content?.components)).toBe(true);
      expect(content?.components?.length).toBeGreaterThan(0);

      // Validate cost estimate
      expect(content?.overview?.estimatedMonthlyCost).toHaveProperty('total');
      expect(content?.overview?.estimatedMonthlyCost).toHaveProperty('currency');
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
        { type: 'prd-complete', content: { prd: {} } },
        { type: 'bizdev-complete', content: {} },
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

      // Parallel execution should complete in ~12-15s
      // Sequential would take ~48-60s (4 agents × 12-15s each)
      // We should see at least 3x improvement
      console.log(`\nPerformance Benchmark:`);
      console.log(`  Parallel execution: ${duration}ms`);
      console.log(`  Expected sequential: ~48-60 seconds`);
      console.log(`  Speedup: ~${Math.round((54000 / duration) * 10) / 10}x`);

      // Verify it completed in reasonable time
      expect(duration).toBeLessThan(25000); // Should be < 25s
    }, 60000);
  });
});

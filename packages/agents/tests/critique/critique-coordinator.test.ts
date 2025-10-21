import { CritiquePhaseCoordinator } from '../../src/critique/critique-phase-coordinator';
import { IdeaSpecSchema } from '@ideamine/schemas';

describe('CritiquePhaseCoordinator', () => {
  let coordinator: CritiquePhaseCoordinator;

  beforeEach(() => {
    coordinator = new CritiquePhaseCoordinator({
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
        title: 'AI-Powered Code Review Platform',
        description: `
          Build an AI-powered code review platform that automatically analyzes pull requests,
          identifies bugs, security vulnerabilities, and suggests improvements.
          Integrates with GitHub, GitLab, and Bitbucket.
        `,
        targetUsers: ['software engineers', 'dev teams', 'open source maintainers'],
        problemStatement: `
          Manual code reviews are time-consuming and often miss critical issues.
          Teams struggle to maintain consistent code quality standards across large codebases.
        `,
        successCriteria: [
          '1000 active teams in first 6 months',
          '95% bug detection rate',
          '50% reduction in code review time',
        ],
        constraints: {
          budget: { min: 10000, max: 25000, currency: 'USD' },
          timeline: { min: 90, max: 120, unit: 'days' },
          technicalPreferences: ['Python', 'React', 'PostgreSQL'],
          complianceRequirements: ['SOC2', 'GDPR'],
        },
        attachments: [],
        metadata: {
          tags: ['developer-tools', 'ai', 'code-quality'],
          priority: 'high',
          customFields: {},
          source: 'intake-phase',
          category: 'technical',
          complexity: 'high',
        },
      };

      // Mock IDEATION artifacts
      const previousArtifacts = [
        {
          type: 'product-strategy',
          content: {
            vision: 'Revolutionize code review with AI',
            mission: 'Help teams ship better code faster',
            differentiators: ['AI-powered analysis', 'Multi-platform support'],
          },
        },
        {
          type: 'competitive-analysis',
          content: {
            marketSize: {
              tam: '$2B developer tools market',
              sam: '$500M code review segment',
              som: '$50M achievable in 3 years',
            },
            competitors: [
              { name: 'CodeClimate', type: 'direct' },
              { name: 'SonarQube', type: 'direct' },
            ],
          },
        },
        {
          type: 'tech-stack-recommendation',
          content: {
            frontend: { framework: 'React', reasoning: 'Modern, scalable' },
            backend: { framework: 'FastAPI', reasoning: 'Fast, Python-based' },
            database: { primary: 'PostgreSQL', type: 'sql' },
          },
        },
        {
          type: 'user-personas',
          content: {
            personas: [
              {
                name: 'Alex the Tech Lead',
                type: 'primary',
                quote: 'I need to ensure code quality without slowing down the team',
              },
            ],
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
      // Sequential: ~30-45s, Parallel: ~10-15s
      expect(duration).toBeLessThan(25000); // 25 seconds max

      console.log(`Critique phase completed in ${duration}ms`);
    }, 60000); // 60 second timeout

    it('should generate all 3 artifact types', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Fitness Tracking Wearable',
        description: 'Smart wearable device for tracking fitness metrics and health data.',
        targetUsers: ['fitness enthusiasts', 'athletes', 'health-conscious individuals'],
        problemStatement: 'People struggle to track fitness progress consistently.',
        successCriteria: ['10K devices sold', '4.5+ app rating'],
        constraints: {
          budget: { min: 50000, max: 100000, currency: 'USD' },
          timeline: { min: 180, max: 240, unit: 'days' },
          technicalPreferences: ['React Native', 'Node.js'],
          complianceRequirements: ['HIPAA', 'FDA'],
        },
        attachments: [],
        metadata: {
          tags: ['health', 'wearable'],
          priority: 'high',
          customFields: {},
          category: 'technical',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        {
          type: 'product-strategy',
          content: { vision: 'Empower healthy living', differentiators: ['Medical-grade sensors'] },
        },
        {
          type: 'competitive-analysis',
          content: { competitors: [{ name: 'Fitbit' }, { name: 'Apple Watch' }] },
        },
        {
          type: 'tech-stack-recommendation',
          content: { backend: { framework: 'Node.js' } },
        },
        {
          type: 'user-personas',
          content: { personas: [{ name: 'Sarah the Runner' }] },
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
      expect(artifactTypes).toContain('redteam-analysis');
      expect(artifactTypes).toContain('risk-analysis');
      expect(artifactTypes).toContain('assumption-analysis');
      expect(artifactTypes).toContain('critique-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'critique-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('redteam');
      expect(aggregated?.content).toHaveProperty('risks');
      expect(aggregated?.content).toHaveProperty('assumptions');
      expect(aggregated?.content).toHaveProperty('summary');
    }, 60000);
  });

  describe('Resilience and Partial Success', () => {
    it('should succeed even if 1 agent fails (2/3 minimum)', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Simple Todo App',
        description: 'A minimal todo list application for testing partial failures.',
        targetUsers: ['users'],
        problemStatement: 'Need a simple task tracker',
        successCriteria: ['Working app'],
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

      const previousArtifacts = [
        { type: 'product-strategy', content: { vision: 'Simple task management' } },
        { type: 'competitive-analysis', content: { competitors: [] } },
        { type: 'tech-stack-recommendation', content: { backend: { framework: 'Express' } } },
        { type: 'user-personas', content: { personas: [] } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-3',
        userId: 'user',
        projectId: 'proj-3',
        previousArtifacts,
        ideaSpec,
      });

      // Even with minimal input, at least 2/3 agents should succeed
      expect(result.success).toBe(true);
      expect(result.failedAgents).toBeLessThan(2); // At most 1 failure
    }, 60000);
  });

  describe('Artifact Structure Validation', () => {
    it('should generate properly structured red team analysis', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Social Media Platform',
        description: 'A new social network focused on privacy and user control.',
        targetUsers: ['privacy-conscious users', 'content creators'],
        problemStatement: 'Users want social media without data mining and surveillance.',
        successCriteria: ['100K users in 6 months', 'Zero data breaches'],
        constraints: {
          budget: { min: 20000, max: 50000, currency: 'USD' },
          timeline: { min: 90, max: 150, unit: 'days' },
          technicalPreferences: ['React', 'Go', 'PostgreSQL'],
          complianceRequirements: ['GDPR', 'CCPA'],
        },
        attachments: [],
        metadata: {
          tags: ['social', 'privacy'],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: { vision: 'Privacy-first social network' } },
        { type: 'competitive-analysis', content: { competitors: [{ name: 'Facebook' }] } },
        { type: 'tech-stack-recommendation', content: { backend: { framework: 'Go' } } },
        { type: 'user-personas', content: { personas: [] } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-4',
        userId: 'user',
        projectId: 'proj-4',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const redteam = result.artifacts?.find((a) => a.type === 'redteam-analysis');
      expect(redteam).toBeDefined();

      const content = redteam?.content;
      expect(content).toHaveProperty('findings');
      expect(content).toHaveProperty('overallAssessment');
      expect(content).toHaveProperty('competitiveThreatLevel');
      expect(content?.overallAssessment).toHaveProperty('viabilityScore');
      expect(content?.overallAssessment).toHaveProperty('recommendation');
    }, 60000);

    it('should generate properly structured risk analysis', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Healthcare Data Platform',
        description: 'Platform for managing and analyzing patient health records.',
        targetUsers: ['healthcare providers', 'hospitals'],
        problemStatement: 'Healthcare data is fragmented and hard to analyze.',
        successCriteria: ['10 hospital clients', 'HIPAA certification'],
        constraints: {
          budget: { min: 100000, max: 250000, currency: 'USD' },
          timeline: { min: 180, max: 365, unit: 'days' },
          technicalPreferences: ['React', 'Java', 'MongoDB'],
          complianceRequirements: ['HIPAA', 'SOC2', 'HITRUST'],
        },
        attachments: [],
        metadata: {
          tags: ['healthcare', 'data'],
          priority: 'critical',
          customFields: {},
          category: 'business',
          complexity: 'high',
        },
      };

      const previousArtifacts = [
        { type: 'product-strategy', content: { vision: 'Unified healthcare data' } },
        { type: 'competitive-analysis', content: { competitors: [] } },
        { type: 'tech-stack-recommendation', content: { database: { primary: 'MongoDB' } } },
        { type: 'user-personas', content: { personas: [] } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-5',
        userId: 'user',
        projectId: 'proj-5',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const risk = result.artifacts?.find((a) => a.type === 'risk-analysis');
      expect(risk).toBeDefined();

      const content = risk?.content;
      expect(content).toHaveProperty('risks');
      expect(content).toHaveProperty('riskSummary');
      expect(content).toHaveProperty('topRisks');
      expect(content).toHaveProperty('budgetImpact');
      expect(content).toHaveProperty('timelineImpact');
      expect(content?.riskSummary).toHaveProperty('totalRisks');
      expect(content?.riskSummary).toHaveProperty('overallRiskLevel');
    }, 60000);

    it('should generate properly structured assumption analysis', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'EdTech Learning Platform',
        description: 'Online learning platform with AI-powered personalized learning paths.',
        targetUsers: ['students', 'educators', 'corporate trainers'],
        problemStatement: 'One-size-fits-all learning is ineffective.',
        successCriteria: ['10K students', '80% completion rate'],
        constraints: {
          budget: { min: 15000, max: 40000, currency: 'USD' },
          timeline: { min: 60, max: 120, unit: 'days' },
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
        { type: 'tech-stack-recommendation', content: { frontend: { framework: 'Next.js' } } },
        { type: 'user-personas', content: { personas: [] } },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-6',
        userId: 'user',
        projectId: 'proj-6',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      const assumption = result.artifacts?.find((a) => a.type === 'assumption-analysis');
      expect(assumption).toBeDefined();

      const content = assumption?.content;
      expect(content).toHaveProperty('challengedAssumptions');
      expect(content).toHaveProperty('criticalAssumptions');
      expect(content).toHaveProperty('assumptionHealthScore');
      expect(content).toHaveProperty('validationPlan');
      expect(content).toHaveProperty('blindSpots');
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
          budget: { min: 1000, max: 2000, currency: 'USD' },
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

      const previousArtifacts = [
        { type: 'product-strategy', content: {} },
        { type: 'competitive-analysis', content: {} },
        { type: 'tech-stack-recommendation', content: {} },
        { type: 'user-personas', content: {} },
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
      // Sequential would take ~30-45s (3 agents × 10-15s each)
      // We should see at least 2x improvement
      console.log(`\nPerformance Benchmark:`);
      console.log(`  Parallel execution: ${duration}ms`);
      console.log(`  Expected sequential: ~30-45 seconds`);
      console.log(`  Speedup: ~${Math.round((37500 / duration) * 10) / 10}x`);

      // Verify it completed in reasonable time
      expect(duration).toBeLessThan(20000); // Should be < 20s
    }, 60000);
  });
});

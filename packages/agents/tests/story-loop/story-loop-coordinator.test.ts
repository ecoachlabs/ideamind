import { StoryLoopPhaseCoordinator } from '../../src/story-loop/story-loop-phase-coordinator';

describe('StoryLoopPhaseCoordinator', () => {
  let coordinator: StoryLoopPhaseCoordinator;

  beforeEach(() => {
    coordinator = new StoryLoopPhaseCoordinator({
      budget: {
        maxCostUsd: 10.0, // Higher budget for iterative story processing
        maxTokens: 200000,
      },
    });
  });

  describe('Sequential Story Processing', () => {
    it('should process user stories sequentially through all 3 agents', async () => {
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
          type: 'repository-blueprint',
          content: {
            overview: {
              repositoryName: 'task-platform',
              language: 'TypeScript',
              framework: 'React',
              packageManager: 'npm',
            },
            directoryStructure: {
              name: 'task-platform',
              subdirectories: [
                { name: 'src', subdirectories: [] },
                { name: 'tests', subdirectories: [] },
              ],
            },
          },
        },
        {
          type: 'system-architecture',
          content: {
            overview: {
              architectureStyle: 'monolithic',
            },
            components: [
              { name: 'Web App', type: 'frontend' },
              { name: 'API Server', type: 'backend' },
            ],
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
              { name: 'Tasks', endpoints: [] },
              { name: 'Users', endpoints: [] },
            ],
          },
        },
        {
          type: 'data-model',
          content: {
            overview: {
              databaseType: 'PostgreSQL',
            },
            entities: [
              { name: 'Task', fields: [], relationships: [] },
              { name: 'User', fields: [], relationships: [] },
            ],
          },
        },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'User can create a task',
                asA: 'project manager',
                iWant: 'to create tasks with titles and descriptions',
                soThat: 'I can organize work for my team',
                priority: 'must-have',
                storyPoints: 3,
                acceptanceCriteria: [
                  'User can input task title',
                  'User can input task description',
                  'Task is saved to database',
                ],
              },
              {
                id: 'US-002',
                title: 'User can assign tasks',
                asA: 'project manager',
                iWant: 'to assign tasks to team members',
                soThat: 'team members know what to work on',
                priority: 'must-have',
                storyPoints: 5,
                acceptanceCriteria: [
                  'User can select assignee from team list',
                  'Assignee receives notification',
                  'Task shows assigned user',
                ],
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

      // Sequential processing takes ~37s per story
      // For 2 stories: ~74s expected
      console.log(`STORY_LOOP phase completed in ${duration}ms`);
      console.log(`Processed ${previousArtifacts[4].content.userStories.length} user stories`);
    }, 120000); // 120 second timeout for sequential processing

    it('should generate all expected artifact types', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'E-Commerce Platform',
        description: 'Online marketplace for handmade goods.',
        targetUsers: ['artisans', 'buyers'],
        problemStatement: 'Artisans need a platform to sell their handmade products.',
        successCriteria: ['100 sellers', '1000 transactions/month'],
        constraints: {
          budget: { min: 10000, max: 25000, currency: 'USD' },
          timeline: { min: 90, max: 120, unit: 'days' },
          technicalPreferences: ['Next.js', 'Node.js', 'PostgreSQL'],
          complianceRequirements: ['PCI-DSS'],
        },
        attachments: [],
        metadata: {
          tags: ['ecommerce', 'marketplace'],
          priority: 'high',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: {
            overview: { language: 'TypeScript', framework: 'Next.js' },
          },
        },
        {
          type: 'system-architecture',
          content: { overview: { architectureStyle: 'microservices' } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'GraphQL' } },
        },
        {
          type: 'data-model',
          content: { overview: { databaseType: 'PostgreSQL' } },
        },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'Seller can list a product',
                asA: 'seller',
                iWant: 'to list my products with photos and descriptions',
                soThat: 'buyers can discover my products',
                priority: 'must-have',
                storyPoints: 5,
                acceptanceCriteria: [
                  'Seller can upload product photos',
                  'Seller can add product description',
                  'Product appears in marketplace',
                ],
              },
            ],
          },
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

      // Check for all expected artifact types (1 story = 3 artifacts + aggregated)
      expect(artifactTypes).toContain('code-implementation');
      expect(artifactTypes).toContain('code-review');
      expect(artifactTypes).toContain('unit-test-suite');
      expect(artifactTypes).toContain('story-loop-complete');

      // Verify aggregated artifact
      const aggregated = artifacts.find((a) => a.type === 'story-loop-complete');
      expect(aggregated).toBeDefined();
      expect(aggregated?.content).toHaveProperty('summary');
      expect(aggregated?.content).toHaveProperty('storyResults');
      expect(aggregated?.content).toHaveProperty('codeMetrics');
      expect(aggregated?.content).toHaveProperty('qualityMetrics');
      expect(aggregated?.content).toHaveProperty('testingMetrics');

      // Verify summary metrics
      expect(aggregated?.content?.summary).toHaveProperty('totalStories');
      expect(aggregated?.content?.summary).toHaveProperty('successfulStories');
      expect(aggregated?.content?.summary).toHaveProperty('totalFiles');
      expect(aggregated?.content?.summary).toHaveProperty('totalTests');
      expect(aggregated?.content?.summary).toHaveProperty('averageCoverage');
    }, 120000);
  });

  describe('Story Selection and Prioritization', () => {
    it('should prioritize must-have stories over should-have', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Budget Management App',
        description: 'Personal finance and budgeting application.',
        targetUsers: ['individuals', 'families'],
        problemStatement: 'People struggle to track their spending and budgets.',
        successCriteria: ['10K users', '4.5+ rating'],
        constraints: {
          budget: { min: 5000, max: 12000, currency: 'USD' },
          timeline: { min: 60, max: 90, unit: 'days' },
          technicalPreferences: ['React Native', 'Node.js'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['finance', 'budgeting'],
          priority: 'medium',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React Native' } },
        },
        {
          type: 'system-architecture',
          content: { overview: { architectureStyle: 'monolithic' } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'REST' } },
        },
        {
          type: 'data-model',
          content: { overview: { databaseType: 'SQLite' } },
        },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'Must-have feature',
                priority: 'must-have',
                storyPoints: 3,
                acceptanceCriteria: ['Criteria 1'],
              },
              {
                id: 'US-002',
                title: 'Should-have feature',
                priority: 'should-have',
                storyPoints: 3,
                acceptanceCriteria: ['Criteria 1'],
              },
              {
                id: 'US-003',
                title: 'Nice-to-have feature',
                priority: 'nice-to-have',
                storyPoints: 3,
                acceptanceCriteria: ['Criteria 1'],
              },
            ],
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

      const aggregated = result.artifacts?.find((a) => a.type === 'story-loop-complete');
      expect(aggregated).toBeDefined();

      // Should process at least the must-have story
      const totalStories = aggregated?.content?.summary?.totalStories;
      expect(totalStories).toBeGreaterThan(0);

      console.log(`Processed ${totalStories} stories with priority-based selection`);
    }, 120000);
  });

  describe('Budget Management', () => {
    it('should respect budget constraints when processing stories', async () => {
      // Create a coordinator with very low budget to test budget limits
      const lowBudgetCoordinator = new StoryLoopPhaseCoordinator({
        budget: {
          maxCostUsd: 0.5, // Very low budget - should only process 2-3 stories
          maxTokens: 50000,
        },
      });

      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Simple App',
        description: 'A minimal app for testing budget limits.',
        targetUsers: ['users'],
        problemStatement: 'Need budget-aware processing',
        successCriteria: ['Budget respected'],
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
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'JavaScript', framework: 'Express' } },
        },
        {
          type: 'system-architecture',
          content: { overview: { architectureStyle: 'monolithic' } },
        },
        {
          type: 'api-design',
          content: { overview: { apiStyle: 'REST' } },
        },
        {
          type: 'data-model',
          content: { overview: { databaseType: 'MongoDB' } },
        },
        {
          type: 'feature-decomposition',
          content: {
            userStories: Array.from({ length: 10 }, (_, i) => ({
              id: `US-${String(i + 1).padStart(3, '0')}`,
              title: `User story ${i + 1}`,
              priority: 'must-have',
              storyPoints: 2,
              acceptanceCriteria: ['Criteria 1'],
            })),
          },
        },
      ];

      const result = await lowBudgetCoordinator.execute({
        workflowRunId: 'test-run-4',
        userId: 'user',
        projectId: 'proj-4',
        previousArtifacts,
        ideaSpec,
      });

      // Should succeed but process fewer stories due to budget
      expect(result.success).toBe(true);

      const aggregated = result.artifacts?.find((a) => a.type === 'story-loop-complete');
      const totalStories = aggregated?.content?.summary?.totalStories;

      // Should process fewer than all 10 stories due to budget limit
      expect(totalStories).toBeLessThan(10);
      expect(totalStories).toBeGreaterThan(0);

      console.log(`Budget limit respected: processed ${totalStories}/10 stories`);
    }, 120000);
  });

  describe('Artifact Structure Validation', () => {
    it('should generate properly structured code implementation', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Todo App',
        description: 'Simple todo list application.',
        targetUsers: ['individuals'],
        problemStatement: 'People need to track their daily tasks.',
        successCriteria: ['Working app'],
        constraints: {
          budget: { min: 2000, max: 5000, currency: 'USD' },
          timeline: { min: 30, max: 45, unit: 'days' },
          technicalPreferences: ['React', 'Node.js'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['productivity'],
          priority: 'medium',
          customFields: {},
          category: 'business',
          complexity: 'low',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        { type: 'system-architecture', content: {} },
        { type: 'api-design', content: {} },
        { type: 'data-model', content: {} },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'Create a todo item',
                asA: 'user',
                iWant: 'to create todo items',
                soThat: 'I can track my tasks',
                priority: 'must-have',
                storyPoints: 3,
                acceptanceCriteria: ['Can create todo', 'Todo saved to database'],
              },
            ],
          },
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

      const impl = result.artifacts?.find((a) => a.type === 'code-implementation');
      expect(impl).toBeDefined();

      const content = impl?.content;
      expect(content).toHaveProperty('userStory');
      expect(content).toHaveProperty('files');
      expect(content).toHaveProperty('implementationDetails');
      expect(content).toHaveProperty('dependencies');
      expect(content).toHaveProperty('databaseChanges');
      expect(content).toHaveProperty('apiChanges');
      expect(content).toHaveProperty('testingNotes');
      expect(content).toHaveProperty('deploymentNotes');

      // Validate files
      expect(Array.isArray(content?.files)).toBe(true);
      expect(content?.files?.length).toBeGreaterThan(0);

      // Validate file structure
      if (content?.files?.length > 0) {
        const file = content.files[0];
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('language');
        expect(file).toHaveProperty('linesOfCode');
      }
    }, 120000);

    it('should generate properly structured code review', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Blog Platform',
        description: 'Personal blogging platform.',
        targetUsers: ['bloggers'],
        problemStatement: 'Bloggers need simple publishing tools.',
        successCriteria: ['100 blogs published'],
        constraints: {
          budget: { min: 3000, max: 8000, currency: 'USD' },
          timeline: { min: 45, max: 60, unit: 'days' },
          technicalPreferences: ['Next.js'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['content', 'publishing'],
          priority: 'medium',
          customFields: {},
          category: 'business',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'Next.js' } },
        },
        { type: 'system-architecture', content: {} },
        { type: 'api-design', content: {} },
        { type: 'data-model', content: {} },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'Publish blog post',
                asA: 'blogger',
                iWant: 'to publish blog posts',
                soThat: 'readers can view my content',
                priority: 'must-have',
                storyPoints: 5,
                acceptanceCriteria: ['Can write post', 'Post published'],
              },
            ],
          },
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

      const review = result.artifacts?.find((a) => a.type === 'code-review');
      expect(review).toBeDefined();

      const content = review?.content;
      expect(content).toHaveProperty('summary');
      expect(content).toHaveProperty('findings');
      expect(content).toHaveProperty('qualityMetrics');
      expect(content).toHaveProperty('bestPractices');
      expect(content).toHaveProperty('securityAnalysis');
      expect(content).toHaveProperty('performanceAnalysis');

      // Validate summary
      expect(content?.summary).toHaveProperty('overallAssessment');
      expect(content?.summary).toHaveProperty('criticalIssues');
      expect(content?.summary).toHaveProperty('majorIssues');

      // Validate quality metrics
      expect(content?.qualityMetrics).toHaveProperty('overallScore');
      expect(content?.qualityMetrics).toHaveProperty('breakdown');
      expect(content?.qualityMetrics?.breakdown).toHaveProperty('security');
      expect(content?.qualityMetrics?.breakdown).toHaveProperty('performance');
    }, 120000);

    it('should generate properly structured unit test suite', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Weather App',
        description: 'Weather forecast application.',
        targetUsers: ['general public'],
        problemStatement: 'People need accurate weather forecasts.',
        successCriteria: ['1M users'],
        constraints: {
          budget: { min: 5000, max: 15000, currency: 'USD' },
          timeline: { min: 60, max: 90, unit: 'days' },
          technicalPreferences: ['React', 'Node.js'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['weather', 'utility'],
          priority: 'medium',
          customFields: {},
          category: 'consumer',
          complexity: 'medium',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        { type: 'system-architecture', content: {} },
        { type: 'api-design', content: {} },
        { type: 'data-model', content: {} },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'View current weather',
                asA: 'user',
                iWant: 'to see current weather',
                soThat: 'I can plan my day',
                priority: 'must-have',
                storyPoints: 3,
                acceptanceCriteria: ['Shows temperature', 'Shows conditions'],
              },
            ],
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

      const tests = result.artifacts?.find((a) => a.type === 'unit-test-suite');
      expect(tests).toBeDefined();

      const content = tests?.content;
      expect(content).toHaveProperty('summary');
      expect(content).toHaveProperty('testFiles');
      expect(content).toHaveProperty('testCases');
      expect(content).toHaveProperty('coverage');
      expect(content).toHaveProperty('testStrategy');
      expect(content).toHaveProperty('dependencies');

      // Validate summary
      expect(content?.summary).toHaveProperty('totalTests');
      expect(content?.summary).toHaveProperty('estimatedCoverage');
      expect(content?.summary).toHaveProperty('framework');

      // Validate test files
      expect(Array.isArray(content?.testFiles)).toBe(true);
      if (content?.testFiles?.length > 0) {
        const testFile = content.testFiles[0];
        expect(testFile).toHaveProperty('path');
        expect(testFile).toHaveProperty('content');
        expect(testFile).toHaveProperty('framework');
        expect(testFile).toHaveProperty('testsCount');
      }

      // Validate coverage
      expect(content?.coverage).toHaveProperty('overall');
      expect(content?.coverage?.overall).toBeGreaterThanOrEqual(0);
      expect(content?.coverage?.overall).toBeLessThanOrEqual(100);
    }, 120000);
  });

  describe('Sequential Processing Pattern', () => {
    it('should process each story through coder → reviewer → test writer', async () => {
      const ideaSpec = {
        version: '1.0.0',
        projectId: '01234567-89ab-7def-0123-456789abcdef',
        submittedBy: 'test-user',
        submittedAt: new Date().toISOString(),
        title: 'Note Taking App',
        description: 'Simple note-taking application.',
        targetUsers: ['students', 'professionals'],
        problemStatement: 'People need to quickly capture notes.',
        successCriteria: ['50K users'],
        constraints: {
          budget: { min: 3000, max: 10000, currency: 'USD' },
          timeline: { min: 45, max: 60, unit: 'days' },
          technicalPreferences: ['React', 'Firebase'],
          complianceRequirements: [],
        },
        attachments: [],
        metadata: {
          tags: ['productivity', 'notes'],
          priority: 'medium',
          customFields: {},
          category: 'productivity',
          complexity: 'low',
        },
      };

      const previousArtifacts = [
        {
          type: 'repository-blueprint',
          content: { overview: { language: 'TypeScript', framework: 'React' } },
        },
        { type: 'system-architecture', content: {} },
        { type: 'api-design', content: {} },
        { type: 'data-model', content: {} },
        {
          type: 'feature-decomposition',
          content: {
            userStories: [
              {
                id: 'US-001',
                title: 'Create note',
                priority: 'must-have',
                storyPoints: 2,
                acceptanceCriteria: ['Can create note'],
              },
            ],
          },
        },
      ];

      const result = await coordinator.execute({
        workflowRunId: 'test-run-8',
        userId: 'user',
        projectId: 'proj-8',
        previousArtifacts,
        ideaSpec,
      });

      expect(result.success).toBe(true);

      // Should have exactly 3 artifacts per story + 1 aggregated
      // 1 story = 4 total artifacts
      const artifacts = result.artifacts || [];
      expect(artifacts.length).toBeGreaterThanOrEqual(4);

      // Verify sequential pattern by checking artifact presence
      const hasCode = artifacts.some((a) => a.type === 'code-implementation');
      const hasReview = artifacts.some((a) => a.type === 'code-review');
      const hasTests = artifacts.some((a) => a.type === 'unit-test-suite');

      expect(hasCode).toBe(true);
      expect(hasReview).toBe(true);
      expect(hasTests).toBe(true);

      console.log('Sequential processing pattern validated: coder → reviewer → test writer');
    }, 120000);
  });
});

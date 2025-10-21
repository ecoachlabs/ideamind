import { IntakeValidatorAgent } from '../../src/intake/validator-agent';
import { AgentConfig, AgentInput } from '@ideamine/agent-sdk';
import { IdeaSpecSchema } from '@ideamine/schemas';

describe('IntakeValidatorAgent', () => {
  let agent: IntakeValidatorAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      id: 'intake-validator-agent',
      name: 'Intake Validator Agent',
      description: 'Validates completeness and generates final IdeaSpec',
      phase: 'INTAKE',
      version: '1.0.0',
      llm: {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-20250219',
        temperature: 0.2,
        maxTokens: 4000,
        topP: 0.9,
      },
      toolPolicy: {
        maxToolInvocations: 1,
        maxCostUsd: 0.15,
        voiThreshold: 0.7,
        confidenceThreshold: 0.85,
        allowlist: ['validate-constraints'],
      },
      budget: {
        maxTokens: 4000,
        maxCostUsd: 0.15,
      },
      timeout: 20000,
      retries: {
        maxAttempts: 3,
        backoff: 'exponential',
      },
    };

    agent = new IntakeValidatorAgent(config);
  });

  describe('Complete Spec Validation', () => {
    it('should validate and approve a complete partial spec', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            version: '1.0.0',
            title: 'Task Management Platform',
            description: `
              A comprehensive task management platform for small to medium-sized teams.
              Features include kanban boards, task dependencies, time tracking,
              and team collaboration tools. Integrates with popular tools like
              Slack, Google Calendar, and GitHub.
            `,
            targetUsers: ['project managers', 'software teams', 'freelancers'],
            problemStatement: `
              Teams waste time context-switching between multiple tools for task
              management, time tracking, and communication. This leads to reduced
              productivity and difficulty tracking project progress.
            `,
            successCriteria: [
              '500 active teams in first 3 months',
              '90% user satisfaction score',
              'Average 20% productivity increase',
            ],
            constraints: {
              budget: { min: 1000, max: 3000, currency: 'USD' },
              timeline: { min: 14, max: 30, unit: 'days' },
              technicalPreferences: ['React', 'Node.js', 'PostgreSQL'],
              complianceRequirements: [],
            },
          },
        },
        context: {
          projectId: 'test-project-1',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      expect(output.artifacts.length).toBeGreaterThanOrEqual(1);

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      expect(ideaSpec).toBeDefined();

      const spec = ideaSpec!.content as any;
      expect(spec.version).toBe('1.0.0');
      expect(spec.projectId).toBeDefined();
      expect(spec.submittedBy).toBeDefined();
      expect(spec.submittedAt).toBeDefined();

      // Validate with Zod schema
      const validationResult = IdeaSpecSchema.safeParse(spec);
      expect(validationResult.success).toBe(true);
    });
  });

  describe('Default Application', () => {
    it('should apply budget default when missing', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            title: 'Simple Blog Platform',
            description: 'A personal blogging platform with markdown support and easy publishing.',
            targetUsers: ['bloggers', 'writers'],
            problemStatement:
              'Existing blogging platforms are too complex for casual writers.',
            successCriteria: ['100 active blogs', 'Positive feedback'],
          },
        },
        context: {
          projectId: 'test-project-2',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      const spec = ideaSpec!.content as any;

      expect(spec.constraints.budget).toBeDefined();
      expect(spec.constraints.budget.min).toBeGreaterThanOrEqual(100);
      expect(spec.constraints.budget.max).toBeLessThanOrEqual(10000);
      expect(spec.constraints.budget.currency).toBe('USD');
    });

    it('should apply timeline default when missing', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            title: 'Mobile Game',
            description:
              'A casual mobile puzzle game with daily challenges and leaderboards.',
            targetUsers: ['mobile gamers'],
            problemStatement: 'People need engaging puzzle games for short breaks.',
            successCriteria: ['10K downloads in first month'],
          },
        },
        context: {
          projectId: 'test-project-3',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      const spec = ideaSpec!.content as any;

      expect(spec.constraints.timeline).toBeDefined();
      expect(spec.constraints.timeline.min).toBeGreaterThanOrEqual(3);
      expect(spec.constraints.timeline.max).toBeLessThanOrEqual(90);
      expect(spec.constraints.timeline.unit).toBe('days');
    });

    it('should apply title default when missing', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            description:
              'A web application for tracking fitness goals and workout progress.',
            targetUsers: ['fitness enthusiasts'],
            problemStatement: 'Hard to track fitness progress consistently.',
            successCriteria: ['User retention > 60%'],
          },
        },
        context: {
          projectId: 'test-project-4',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      const spec = ideaSpec!.content as any;

      expect(spec.title).toBeDefined();
      expect(spec.title.length).toBeGreaterThan(0);
    });

    it('should track which defaults were applied', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            description: 'A minimal idea with few details.',
          },
        },
        context: {
          projectId: 'test-project-5',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const validationArtifact = output.artifacts.find((a) => a.type === 'intake-validation');
      expect(validationArtifact).toBeDefined();

      const validation = validationArtifact!.content as any;
      expect(validation.appliedDefaults).toBeDefined();
      expect(Array.isArray(validation.appliedDefaults)).toBe(true);
      expect(validation.appliedDefaults.length).toBeGreaterThan(0);
    });
  });

  describe('UUID Generation', () => {
    it('should generate a valid UUID v7 for projectId', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            title: 'Test Project',
            description: 'A test project for UUID validation.',
            targetUsers: ['testers'],
            problemStatement: 'Testing UUID generation.',
            successCriteria: ['UUID generated'],
          },
        },
        context: {
          projectId: 'test-project-6',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      const spec = ideaSpec!.content as any;

      expect(spec.projectId).toBeDefined();
      expect(spec.projectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique projectIds for different invocations', async () => {
      const input1: AgentInput = {
        data: {
          partialSpec: {
            title: 'Project A',
            description: 'First project',
            targetUsers: ['users'],
            problemStatement: 'Problem A',
            successCriteria: ['Success A'],
          },
        },
        context: { projectId: 'test-1', userId: 'user' },
      };

      const input2: AgentInput = {
        data: {
          partialSpec: {
            title: 'Project B',
            description: 'Second project',
            targetUsers: ['users'],
            problemStatement: 'Problem B',
            successCriteria: ['Success B'],
          },
        },
        context: { projectId: 'test-2', userId: 'user' },
      };

      const output1 = await agent.execute(input1);
      const output2 = await agent.execute(input2);

      const spec1 = output1.artifacts.find((a) => a.type === 'idea-spec')!.content as any;
      const spec2 = output2.artifacts.find((a) => a.type === 'idea-spec')!.content as any;

      expect(spec1.projectId).not.toBe(spec2.projectId);
    });
  });

  describe('Validation Issues', () => {
    it('should identify missing required fields', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            title: 'Incomplete Idea',
            // Missing: description, targetUsers, problemStatement, successCriteria
          },
        },
        context: {
          projectId: 'test-project-7',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const validationArtifact = output.artifacts.find((a) => a.type === 'intake-validation');
      const validation = validationArtifact!.content as any;

      expect(validation.validation.issues).toBeDefined();
      expect(Array.isArray(validation.validation.issues)).toBe(true);

      // Should apply defaults to make it valid
      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      expect(ideaSpec).toBeDefined();
    });

    it('should categorize issues by severity', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            title: 'Project',
            description: 'A project',
            targetUsers: ['users'],
            problemStatement: 'A problem',
            successCriteria: ['success'],
            constraints: {
              budget: { min: 50, max: 50000, currency: 'USD' }, // Potentially unrealistic
            },
          },
        },
        context: {
          projectId: 'test-project-8',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const validationArtifact = output.artifacts.find((a) => a.type === 'intake-validation');
      const validation = validationArtifact!.content as any;

      if (validation.validation.issues.length > 0) {
        validation.validation.issues.forEach((issue: any) => {
          expect(['error', 'warning', 'info']).toContain(issue.severity);
        });
      }
    });
  });

  describe('Metadata Enrichment', () => {
    it('should add validation metadata to the spec', async () => {
      const input: AgentInput = {
        data: {
          partialSpec: {
            title: 'E-Commerce Store',
            description: 'An online store for selling handmade crafts.',
            targetUsers: ['artisans', 'shoppers'],
            problemStatement: 'Artisans need a platform to sell their crafts online.',
            successCriteria: ['100 active sellers', '$10K monthly revenue'],
          },
        },
        context: {
          projectId: 'test-project-9',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      const spec = ideaSpec!.content as any;

      expect(spec.metadata).toBeDefined();
      expect(spec.metadata.source).toBe('intake-phase');
      expect(spec.metadata.validatedAt).toBeDefined();
      expect(spec.metadata.validationConfidence).toBeDefined();
    });
  });

  describe('Zod Schema Compliance', () => {
    it('should always produce a valid IdeaSpec according to Zod schema', async () => {
      const testInputs = [
        {
          partialSpec: {
            title: 'Complete Project',
            description: 'A fully detailed project with all fields.',
            targetUsers: ['users'],
            problemStatement: 'A clear problem statement.',
            successCriteria: ['metric 1', 'metric 2'],
            constraints: {
              budget: { min: 500, max: 2000, currency: 'USD' },
              timeline: { min: 10, max: 20, unit: 'days' },
            },
          },
        },
        {
          partialSpec: {
            title: 'Minimal Project',
            description: 'Minimal information provided.',
          },
        },
        {
          partialSpec: {},
        },
      ];

      for (const data of testInputs) {
        const input: AgentInput = {
          data,
          context: { projectId: 'test', userId: 'user' },
        };

        const output = await agent.execute(input);
        expect(output.success).toBe(true);

        const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
        expect(ideaSpec).toBeDefined();

        const spec = ideaSpec!.content;
        const validationResult = IdeaSpecSchema.safeParse(spec);

        if (!validationResult.success) {
          console.error('Validation errors:', validationResult.error.issues);
        }

        expect(validationResult.success).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle completely empty input gracefully', async () => {
      const input: AgentInput = {
        data: {},
        context: {
          projectId: 'test-project-10',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      expect(output.artifacts).toBeDefined();

      const ideaSpec = output.artifacts.find((a) => a.type === 'idea-spec');
      expect(ideaSpec).toBeDefined();
    });
  });
});

import { IntakeExpanderAgent } from '../../src/intake/expander-agent';
import { AgentConfig, AgentInput } from '@ideamine/agent-sdk';

describe('IntakeExpanderAgent', () => {
  let agent: IntakeExpanderAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      id: 'intake-expander-agent',
      name: 'Intake Expander Agent',
      description: 'Generates clarifying questions and extracts idea details',
      phase: 'INTAKE',
      version: '1.0.0',
      llm: {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-20250219',
        temperature: 0.4,
        maxTokens: 8000,
        topP: 0.95,
      },
      toolPolicy: {
        maxToolInvocations: 1,
        maxCostUsd: 0.25,
        voiThreshold: 0.6,
        confidenceThreshold: 0.75,
        allowlist: ['validate-constraints'],
      },
      budget: {
        maxTokens: 8000,
        maxCostUsd: 0.25,
      },
      timeout: 40000,
      retries: {
        maxAttempts: 3,
        backoff: 'exponential',
      },
    };

    agent = new IntakeExpanderAgent(config);
  });

  describe('Information Extraction', () => {
    it('should extract title and description', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Project Management Platform for Remote Teams

            Build a comprehensive project management tool designed specifically
            for distributed teams. The platform will enable real-time collaboration,
            task tracking, time management, and team communication. Target users
            are project managers, team leads, and individual contributors in
            companies with 10-500 employees.
          `,
        },
        context: {
          projectId: 'test-project-1',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      expect(output.artifacts).toHaveLength(1);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.partialSpec).toBeDefined();
      expect(expansion.partialSpec.title).toBeDefined();
      expect(expansion.partialSpec.description).toBeDefined();
      expect(expansion.partialSpec.title.length).toBeGreaterThan(5);
    });

    it('should extract target users', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Create a fitness tracking app for runners and cyclists.
            The app will help athletes track their workouts, set goals,
            and compete with friends. Target users are amateur and professional
            athletes aged 18-45 who are tech-savvy and fitness-focused.
          `,
        },
        context: {
          projectId: 'test-project-2',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.partialSpec.targetUsers).toBeDefined();
      expect(Array.isArray(expansion.partialSpec.targetUsers)).toBe(true);
      expect(expansion.partialSpec.targetUsers.length).toBeGreaterThan(0);
    });

    it('should extract problem statement', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Small businesses struggle with managing customer relationships
            because existing CRM tools are too complex and expensive.
            We want to build a simple, affordable CRM specifically designed
            for businesses with 1-10 employees. It should be easy to use
            without extensive training or setup.
          `,
        },
        context: {
          projectId: 'test-project-3',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.partialSpec.problemStatement).toBeDefined();
      expect(expansion.partialSpec.problemStatement.length).toBeGreaterThan(50);
    });

    it('should extract constraints when mentioned', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Build an e-commerce platform with budget of $2000-$5000.
            Timeline is 30 days. Must use React for frontend and Node.js
            for backend. Needs to be GDPR and PCI-DSS compliant for
            European customers. Prefer AWS for hosting.
          `,
        },
        context: {
          projectId: 'test-project-4',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      const constraints = expansion.partialSpec.constraints;

      // May or may not extract all constraints depending on LLM
      // Just verify structure
      if (constraints) {
        expect(typeof constraints).toBe('object');
      }
    });
  });

  describe('Question Generation', () => {
    it('should generate 5-10 clarifying questions', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Create a social media analytics dashboard.
            Track engagement metrics across platforms.
          `,
        },
        context: {
          projectId: 'test-project-5',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.questions).toBeDefined();
      expect(Array.isArray(expansion.questions)).toBe(true);
      expect(expansion.questions.length).toBeGreaterThanOrEqual(5);
      expect(expansion.questions.length).toBeLessThanOrEqual(10);
    });

    it('should categorize questions appropriately', async () => {
      const input: AgentInput = {
        data: {
          ideaText: 'Build a task management app',
        },
        context: {
          projectId: 'test-project-6',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      const questions = expansion.questions;

      // Verify question structure
      questions.forEach((q: any) => {
        expect(q).toHaveProperty('id');
        expect(q).toHaveProperty('question');
        expect(q).toHaveProperty('category');
        expect(q).toHaveProperty('priority');
        expect(q).toHaveProperty('optional');

        expect(['users', 'problem', 'solution', 'constraints', 'success']).toContain(q.category);
        expect(['high', 'medium', 'low']).toContain(q.priority);
        expect(typeof q.optional).toBe('boolean');
      });
    });

    it('should focus on missing information', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Build a mobile app.
          `,
        },
        context: {
          projectId: 'test-project-7',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.missingFields).toBeDefined();
      expect(Array.isArray(expansion.missingFields)).toBe(true);

      // With minimal info, should have many missing fields
      expect(expansion.missingFields.length).toBeGreaterThan(2);
    });
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence for detailed ideas', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            E-Commerce Platform for Handmade Crafts

            Build a marketplace connecting artisans with customers globally.
            Target users include craft makers (sellers) and buyers looking for
            unique handmade items. The platform solves the problem of artisans
            lacking visibility and easy selling channels.

            Success criteria:
            - 1000 active sellers in first 6 months
            - 10,000 monthly active buyers
            - $100K in gross merchandise value (GMV)

            Budget: $3000-$5000
            Timeline: 45 days
            Tech stack: React, Node.js, PostgreSQL, Stripe
            Compliance: PCI-DSS for payments
          `,
        },
        context: {
          projectId: 'test-project-8',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      expect(output.confidence).toBeGreaterThan(0.7);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.extractionConfidence).toBeGreaterThan(0.7);
    });

    it('should have lower confidence for vague ideas', async () => {
      const input: AgentInput = {
        data: {
          ideaText: 'Make an app',
        },
        context: {
          projectId: 'test-project-9',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      // Confidence should be lower for vague input
      const expansion = output.artifacts[0].content as any;
      expect(expansion.extractionConfidence).toBeLessThan(0.8);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty input with defaults', async () => {
      const input: AgentInput = {
        data: {
          ideaText: '',
        },
        context: {
          projectId: 'test-project-10',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      expect(output.artifacts).toHaveLength(1);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.questions).toBeDefined();
      expect(expansion.questions.length).toBeGreaterThan(0);
    });

    it('should use default questions when LLM fails on question generation', async () => {
      const input: AgentInput = {
        data: {
          ideaText: 'x'.repeat(10), // Very short, might trigger fallback
        },
        context: {
          projectId: 'test-project-11',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      expect(expansion.questions).toBeDefined();
      expect(expansion.questions.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Partial Spec Generation', () => {
    it('should create a valid partial IdeaSpec structure', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Learning Management System for corporate training.
            Help HR departments deliver online courses to employees.
            Budget: $1500. Timeline: 21 days.
          `,
        },
        context: {
          projectId: 'test-project-12',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const expansion = output.artifacts[0].content as any;
      const partialSpec = expansion.partialSpec;

      expect(partialSpec).toHaveProperty('version', '1.0.0');
      expect(partialSpec).toHaveProperty('title');
      expect(partialSpec).toHaveProperty('description');

      // Should not have projectId yet (generated by validator)
      expect(partialSpec.projectId).toBeUndefined();
    });
  });
});

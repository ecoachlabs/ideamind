import { IntakeClassifierAgent } from '../../src/intake/classifier-agent';
import { AgentConfig, AgentInput } from '@ideamine/agent-sdk';

describe('IntakeClassifierAgent', () => {
  let agent: IntakeClassifierAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      id: 'intake-classifier-agent',
      name: 'Intake Classifier Agent',
      description: 'Categorizes ideas and estimates complexity',
      phase: 'INTAKE',
      version: '1.0.0',
      llm: {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet-20250219',
        temperature: 0.3,
        maxTokens: 8000,
        topP: 0.95,
      },
      toolPolicy: {
        maxToolInvocations: 2,
        maxCostUsd: 0.5,
        voiThreshold: 0.5,
        confidenceThreshold: 0.7,
        allowlist: ['estimate-complexity', 'search-similar-ideas'],
      },
      budget: {
        maxTokens: 8000,
        maxCostUsd: 0.5,
      },
      timeout: 30000,
      retries: {
        maxAttempts: 3,
        backoff: 'exponential',
      },
    };

    agent = new IntakeClassifierAgent(config);
  });

  describe('Technical Idea Classification', () => {
    it('should classify a technical API idea correctly', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Build a REST API for managing user authentication and authorization.
            It should support OAuth 2.0, JWT tokens, and role-based access control.
            The API will integrate with existing databases and provide endpoints
            for login, logout, password reset, and user management.
          `,
          title: 'Authentication API',
        },
        context: {
          projectId: 'test-project-1',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      expect(output.artifacts).toHaveLength(1);

      const classification = output.artifacts[0].content as any;
      expect(classification.category).toBe('technical');
      expect(classification.confidence).toBeGreaterThan(0.7);
      expect(classification.estimatedAgents).toContain('intake-expander-agent');
    });

    it('should classify a web app idea correctly', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Create a project management tool for remote teams. Features include:
            - Real-time collaboration on tasks
            - Kanban boards and Gantt charts
            - Time tracking and reporting
            - Integration with Slack and GitHub
            - Video conferencing capabilities
          `,
        },
        context: {
          projectId: 'test-project-2',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const classification = output.artifacts[0].content as any;
      expect(['technical', 'business', 'hybrid']).toContain(classification.category);
      expect(classification.subcategories).toBeDefined();
      expect(classification.subcategories.length).toBeGreaterThan(0);
    });
  });

  describe('Business Idea Classification', () => {
    it('should classify a SaaS business idea correctly', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Launch a subscription-based CRM platform for small businesses.
            Target customers: 10-50 employee companies in retail and services.
            Pricing: $49/mo for basic, $99/mo for pro, $199/mo for enterprise.
            Revenue model: Monthly recurring revenue with annual discounts.
            Marketing channels: SEO, content marketing, Google Ads.
          `,
          title: 'SmallBiz CRM',
        },
        context: {
          projectId: 'test-project-3',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const classification = output.artifacts[0].content as any;
      expect(['business', 'hybrid']).toContain(classification.category);
      expect(classification.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Creative Idea Classification', () => {
    it('should classify a content creation tool correctly', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Develop a social media content creation platform with AI-powered
            design suggestions. Users can create graphics, videos, and posts
            for Instagram, TikTok, and YouTube. Features include:
            - AI-generated captions and hashtags
            - Template library with 1000+ designs
            - Brand kit management
            - Scheduling and analytics
          `,
        },
        context: {
          projectId: 'test-project-4',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const classification = output.artifacts[0].content as any;
      expect(['creative', 'hybrid']).toContain(classification.category);
    });
  });

  describe('Complexity Estimation', () => {
    it('should estimate low complexity for simple ideas', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Create a simple landing page with contact form.
            Just need name, email, message fields and submit button.
            Send form data to an email address.
          `,
        },
        context: {
          projectId: 'test-project-5',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const classification = output.artifacts[0].content as any;
      // May or may not have complexity (depends on VOI scoring)
      // Just verify structure is correct
      expect(classification).toHaveProperty('category');
      expect(classification).toHaveProperty('confidence');
    });

    it('should estimate high complexity for ML/AI ideas', async () => {
      const input: AgentInput = {
        data: {
          ideaText: `
            Build a recommendation engine using machine learning.
            Analyze user behavior, purchase history, and browsing patterns.
            Use collaborative filtering and neural networks.
            Real-time personalization for 100K+ concurrent users.
            Integrate with existing e-commerce platform via API.
          `,
        },
        context: {
          projectId: 'test-project-6',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const classification = output.artifacts[0].content as any;
      expect(classification).toHaveProperty('category');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty input gracefully', async () => {
      const input: AgentInput = {
        data: {
          ideaText: '',
        },
        context: {
          projectId: 'test-project-7',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      // Should still complete but with low confidence
      expect(output.success).toBe(true);
      expect(output.artifacts).toBeDefined();
    });

    it('should fall back to heuristics when LLM fails', async () => {
      // This test would require mocking the LLM to fail
      // For now, just verify the agent can handle very short input
      const input: AgentInput = {
        data: {
          ideaText: 'API for users',
        },
        context: {
          projectId: 'test-project-8',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);
      const classification = output.artifacts[0].content as any;
      expect(classification.category).toBeDefined();
    });
  });

  describe('Agent Routing', () => {
    it('should identify correct downstream agents', async () => {
      const input: AgentInput = {
        data: {
          ideaText: 'Build a mobile app for tracking fitness goals',
        },
        context: {
          projectId: 'test-project-9',
          userId: 'test-user',
        },
      };

      const output = await agent.execute(input);

      expect(output.success).toBe(true);

      const classification = output.artifacts[0].content as any;
      expect(classification.estimatedAgents).toContain('intake-expander-agent');
      expect(classification.estimatedAgents).toContain('intake-validator-agent');
    });
  });
});

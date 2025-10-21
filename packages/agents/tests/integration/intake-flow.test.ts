import { IntakeClassifierAgent } from '../../src/intake/classifier-agent';
import { IntakeExpanderAgent } from '../../src/intake/expander-agent';
import { IntakeValidatorAgent } from '../../src/intake/validator-agent';
import { loadIntakeAgentConfigs } from '../../src/config/loader';
import { AgentInput } from '@ideamine/agent-sdk';
import { IdeaSpecSchema } from '@ideamine/schemas';

describe('Intake Flow Integration Tests', () => {
  let classifierAgent: IntakeClassifierAgent;
  let expanderAgent: IntakeExpanderAgent;
  let validatorAgent: IntakeValidatorAgent;

  beforeAll(() => {
    // Load configurations from YAML
    const configs = loadIntakeAgentConfigs();

    const classifierConfig = configs.find((c) => c.id === 'intake-classifier-agent');
    const expanderConfig = configs.find((c) => c.id === 'intake-expander-agent');
    const validatorConfig = configs.find((c) => c.id === 'intake-validator-agent');

    expect(classifierConfig).toBeDefined();
    expect(expanderConfig).toBeDefined();
    expect(validatorConfig).toBeDefined();

    classifierAgent = new IntakeClassifierAgent(classifierConfig!);
    expanderAgent = new IntakeExpanderAgent(expanderConfig!);
    validatorAgent = new IntakeValidatorAgent(validatorConfig!);
  });

  describe('Complete Intake Pipeline', () => {
    it('should process a complete idea through all three agents', async () => {
      // Step 1: Classification
      const classifierInput: AgentInput = {
        data: {
          ideaText: `
            Build a project management platform for distributed software teams.
            The platform will enable real-time collaboration, task tracking,
            sprint planning, and integration with popular developer tools like
            GitHub, Jira, and Slack.

            Target users are engineering managers, product managers, and developers
            in tech companies with 10-500 employees.

            Budget: $2000-$4000
            Timeline: 30-45 days
            Tech stack: React, Node.js, PostgreSQL, Redis
            Compliance: SOC2, GDPR
          `,
          title: 'TeamSync - Project Management for Dev Teams',
        },
        context: {
          projectId: 'integration-test-1',
          userId: 'test-user',
        },
      };

      const classifierOutput = await classifierAgent.execute(classifierInput);

      expect(classifierOutput.success).toBe(true);
      expect(classifierOutput.artifacts).toHaveLength(1);

      const classification = classifierOutput.artifacts[0].content as any;
      expect(classification.category).toBeDefined();
      expect(classification.confidence).toBeGreaterThan(0.6);

      // Step 2: Expansion
      const expanderInput: AgentInput = {
        data: {
          ideaText: classifierInput.data.ideaText,
          title: classifierInput.data.title,
          classification,
        },
        context: classifierInput.context,
      };

      const expanderOutput = await expanderAgent.execute(expanderInput);

      expect(expanderOutput.success).toBe(true);
      expect(expanderOutput.artifacts).toHaveLength(1);

      const expansion = expanderOutput.artifacts[0].content as any;
      expect(expansion.partialSpec).toBeDefined();
      expect(expansion.questions).toBeDefined();
      expect(expansion.questions.length).toBeGreaterThanOrEqual(5);

      // Step 3: Validation
      const validatorInput: AgentInput = {
        data: {
          partialSpec: expansion.partialSpec,
        },
        context: classifierInput.context,
      };

      const validatorOutput = await validatorAgent.execute(validatorInput);

      expect(validatorOutput.success).toBe(true);

      const ideaSpec = validatorOutput.artifacts.find((a) => a.type === 'idea-spec');
      expect(ideaSpec).toBeDefined();

      const spec = ideaSpec!.content;

      // Validate final spec with Zod schema
      const validationResult = IdeaSpecSchema.safeParse(spec);
      expect(validationResult.success).toBe(true);

      // Verify all required fields are present
      const finalSpec = spec as any;
      expect(finalSpec.version).toBe('1.0.0');
      expect(finalSpec.projectId).toBeDefined();
      expect(finalSpec.title).toBeDefined();
      expect(finalSpec.description).toBeDefined();
      expect(finalSpec.targetUsers).toBeDefined();
      expect(finalSpec.problemStatement).toBeDefined();
      expect(finalSpec.successCriteria).toBeDefined();
      expect(finalSpec.constraints).toBeDefined();
    });

    it('should handle minimal idea input and apply defaults', async () => {
      // Step 1: Classification
      const classifierInput: AgentInput = {
        data: {
          ideaText: 'Build a simple todo list app for personal use.',
        },
        context: {
          projectId: 'integration-test-2',
          userId: 'test-user',
        },
      };

      const classifierOutput = await classifierAgent.execute(classifierInput);
      expect(classifierOutput.success).toBe(true);

      // Step 2: Expansion
      const classification = classifierOutput.artifacts[0].content as any;
      const expanderInput: AgentInput = {
        data: {
          ideaText: classifierInput.data.ideaText,
          classification,
        },
        context: classifierInput.context,
      };

      const expanderOutput = await expanderAgent.execute(expanderInput);
      expect(expanderOutput.success).toBe(true);

      // Step 3: Validation
      const expansion = expanderOutput.artifacts[0].content as any;
      const validatorInput: AgentInput = {
        data: {
          partialSpec: expansion.partialSpec,
        },
        context: classifierInput.context,
      };

      const validatorOutput = await validatorAgent.execute(validatorInput);
      expect(validatorOutput.success).toBe(true);

      // Verify defaults were applied
      const validationArtifact = validatorOutput.artifacts.find(
        (a) => a.type === 'intake-validation'
      );
      expect(validationArtifact).toBeDefined();

      const validation = validationArtifact!.content as any;
      expect(validation.appliedDefaults).toBeDefined();
      expect(validation.appliedDefaults.length).toBeGreaterThan(0);

      // Final spec should still be valid
      const ideaSpec = validatorOutput.artifacts.find((a) => a.type === 'idea-spec');
      const validationResult = IdeaSpecSchema.safeParse(ideaSpec!.content);
      expect(validationResult.success).toBe(true);
    });

    it('should process a business-focused SaaS idea', async () => {
      const classifierInput: AgentInput = {
        data: {
          ideaText: `
            Launch a subscription-based CRM for small businesses.
            Pricing: $29/mo basic, $79/mo professional, $149/mo enterprise.
            Target market: 5-50 employee companies in retail, hospitality, and services.
            Go-to-market: SEO, content marketing, Google Ads, partnerships.
            Revenue goal: $50K MRR in 12 months.
          `,
          title: 'SmallBiz CRM',
        },
        context: {
          projectId: 'integration-test-3',
          userId: 'test-user',
        },
      };

      // Full pipeline
      const classifierOutput = await classifierAgent.execute(classifierInput);
      expect(classifierOutput.success).toBe(true);

      const classification = classifierOutput.artifacts[0].content as any;
      expect(['business', 'hybrid']).toContain(classification.category);

      const expanderOutput = await expanderAgent.execute({
        data: { ideaText: classifierInput.data.ideaText, classification },
        context: classifierInput.context,
      });
      expect(expanderOutput.success).toBe(true);

      const expansion = expanderOutput.artifacts[0].content as any;

      const validatorOutput = await validatorAgent.execute({
        data: { partialSpec: expansion.partialSpec },
        context: classifierInput.context,
      });
      expect(validatorOutput.success).toBe(true);

      const ideaSpec = validatorOutput.artifacts.find((a) => a.type === 'idea-spec');
      const validationResult = IdeaSpecSchema.safeParse(ideaSpec!.content);
      expect(validationResult.success).toBe(true);
    });

    it('should process a creative/content-focused idea', async () => {
      const classifierInput: AgentInput = {
        data: {
          ideaText: `
            Create a social media content creation tool with AI-powered design.
            Users can generate Instagram posts, TikTok videos, and YouTube thumbnails.
            Target users: influencers, small business owners, content creators.
            Monetization: Freemium model with $19/mo pro plan.
          `,
        },
        context: {
          projectId: 'integration-test-4',
          userId: 'test-user',
        },
      };

      // Full pipeline
      const classifierOutput = await classifierAgent.execute(classifierInput);
      const classification = classifierOutput.artifacts[0].content as any;

      const expanderOutput = await expanderAgent.execute({
        data: { ideaText: classifierInput.data.ideaText, classification },
        context: classifierInput.context,
      });

      const expansion = expanderOutput.artifacts[0].content as any;

      const validatorOutput = await validatorAgent.execute({
        data: { partialSpec: expansion.partialSpec },
        context: classifierInput.context,
      });

      expect(validatorOutput.success).toBe(true);

      const ideaSpec = validatorOutput.artifacts.find((a) => a.type === 'idea-spec');
      const validationResult = IdeaSpecSchema.safeParse(ideaSpec!.content);
      expect(validationResult.success).toBe(true);
    });
  });

  describe('Data Flow Validation', () => {
    it('should preserve information across agent chain', async () => {
      const originalTitle = 'Analytics Dashboard';
      const originalIdea = `
        Build a business intelligence dashboard for e-commerce analytics.
        Track sales, customer behavior, inventory, and marketing ROI.
      `;

      // Classifier
      const classifierOutput = await classifierAgent.execute({
        data: { ideaText: originalIdea, title: originalTitle },
        context: { projectId: 'flow-test-1', userId: 'user' },
      });

      // Expander
      const classification = classifierOutput.artifacts[0].content as any;
      const expanderOutput = await expanderAgent.execute({
        data: { ideaText: originalIdea, title: originalTitle, classification },
        context: { projectId: 'flow-test-1', userId: 'user' },
      });

      const expansion = expanderOutput.artifacts[0].content as any;
      expect(expansion.partialSpec.title).toContain('Analytics'); // Should preserve or infer similar title

      // Validator
      const validatorOutput = await validatorAgent.execute({
        data: { partialSpec: expansion.partialSpec },
        context: { projectId: 'flow-test-1', userId: 'user' },
      });

      const ideaSpec = validatorOutput.artifacts.find((a) => a.type === 'idea-spec');
      const finalSpec = ideaSpec!.content as any;

      // Should preserve core information
      expect(finalSpec.title).toBeDefined();
      expect(finalSpec.description).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete full intake pipeline within timeout', async () => {
      const startTime = Date.now();

      const input: AgentInput = {
        data: {
          ideaText: 'Build a web app for tracking daily habits and goals.',
        },
        context: {
          projectId: 'perf-test-1',
          userId: 'user',
        },
      };

      const classifierOutput = await classifierAgent.execute(input);
      const classification = classifierOutput.artifacts[0].content as any;

      const expanderOutput = await expanderAgent.execute({
        data: { ideaText: input.data.ideaText, classification },
        context: input.context,
      });
      const expansion = expanderOutput.artifacts[0].content as any;

      const validatorOutput = await validatorAgent.execute({
        data: { partialSpec: expansion.partialSpec },
        context: input.context,
      });

      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Full pipeline should complete within 60 seconds
      expect(totalDuration).toBeLessThan(60000);

      expect(classifierOutput.success).toBe(true);
      expect(expanderOutput.success).toBe(true);
      expect(validatorOutput.success).toBe(true);
    });
  });
});

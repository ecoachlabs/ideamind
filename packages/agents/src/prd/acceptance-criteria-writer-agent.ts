import { ChatAnthropic } from '@langchain/anthropic';
import {
  BaseAgent,
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
  AgentConfig,
} from '@ideamine/agent-sdk';

/**
 * Acceptance criteria for a user story
 */
interface AcceptanceCriteria {
  storyId: string;
  criteria: {
    id: string;
    scenario: string; // Given-When-Then format
    given: string[];
    when: string[];
    then: string[];
    testable: boolean;
  }[];
  edgeCases: string[];
  testScenarios: {
    type: 'positive' | 'negative' | 'edge-case';
    description: string;
    expectedOutcome: string;
  }[];
}

/**
 * Complete acceptance criteria set
 */
interface AcceptanceCriteriaSet {
  stories: AcceptanceCriteria[];
  coverageMetrics: {
    totalStories: number;
    storiesWithCriteria: number;
    totalCriteria: number;
    averageCriteriaPerStory: number;
    testabilityScore: number; // 0-100
  };
  testingRecommendations: string[];
}

/**
 * AcceptanceCriteriaWriterAgent
 *
 * Writes detailed acceptance criteria for user stories using:
 * - Given-When-Then (Gherkin) format
 * - Positive, negative, and edge case scenarios
 * - Testable conditions
 * - Edge cases and boundary conditions
 *
 * Ensures every user story has:
 * - Clear acceptance criteria (3-7 per story)
 * - Testable conditions
 * - Expected behaviors
 * - Edge cases identified
 *
 * Part of the PRD phase (runs in parallel with other PRD agents).
 */
export class AcceptanceCriteriaWriterAgent extends BaseAgent {
  private llm: ChatAnthropic;

  constructor(config: AgentConfig) {
    super(config);

    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      topP: config.llm.topP,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      agentId: this.config.id,
      steps: [
        {
          stepId: 'extract-stories',
          description: 'Extract user stories to write criteria for',
          estimatedDurationMs: 1000,
          requiredTools: [],
        },
        {
          stepId: 'write-criteria',
          description: 'Write acceptance criteria for each story',
          estimatedDurationMs: 5000,
          requiredTools: [],
        },
        {
          stepId: 'identify-edge-cases',
          description: 'Identify edge cases and boundary conditions',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'create-test-scenarios',
          description: 'Create test scenarios for validation',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.86,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const stories = this.extractData(input, 'stories');
    const prd = this.extractData(input, 'prd');

    const prompt = this.buildAcceptanceCriteriaPrompt(stories, prd);

    try {
      const response = await this.llm.invoke(prompt);
      const criteriaText = response.content.toString();

      const criteriaSet = this.parseCriteriaSet(criteriaText);

      return {
        reasoning: `Generated acceptance criteria for ${criteriaSet.stories.length} stories (${criteriaSet.coverageMetrics.totalCriteria} total criteria)`,
        confidence: 0.87,
        intermediate: {
          criteriaSet,
        },
      };
    } catch (error) {
      console.warn('[AcceptanceCriteriaWriterAgent] LLM failed, using fallback:', error);
      return this.fallbackCriteria();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const criteriaSet: AcceptanceCriteriaSet = result.intermediate.criteriaSet;

    return [
      {
        type: 'acceptance-criteria',
        version: '1.0.0',
        content: criteriaSet,
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  private extractData(input: AgentInput, key: string): any {
    if (input.data && typeof input.data === 'object') {
      return (input.data as any)[key];
    }
    return null;
  }

  private buildAcceptanceCriteriaPrompt(stories: any, prd: any): string {
    const storyList =
      stories?.slice(0, 50).map((s: any) => `${s.id}: ${s.title} - As a ${s.asA}, I want ${s.iWant}, so that ${s.soThat}`) ||
      [];

    return `You are a QA engineer writing acceptance criteria for user stories.

**User Stories:**
${storyList.join('\n') || 'No stories provided'}

**Non-Functional Requirements:**
${JSON.stringify(prd?.nonFunctionalRequirements, null, 2) || 'N/A'}

Generate acceptance criteria in JSON format:

{
  "stories": [
    {
      "storyId": "US-001",
      "criteria": [
        {
          "id": "AC-001-01",
          "scenario": "<Scenario name>",
          "given": ["<Precondition 1>", "<Precondition 2>"],
          "when": ["<Action 1>", "<Action 2>"],
          "then": ["<Expected result 1>", "<Expected result 2>"],
          "testable": true
        }
      ],
      "edgeCases": [
        "<Edge case 1>",
        "<Boundary condition>"
      ],
      "testScenarios": [
        {
          "type": "positive|negative|edge-case",
          "description": "<Test scenario>",
          "expectedOutcome": "<What should happen>"
        }
      ]
    }
  ],
  "testingRecommendations": [
    "<Testing recommendation 1>",
    "<Testing recommendation 2>"
  ]
}

**Guidelines:**
- Write 3-7 acceptance criteria per story (focus on top 50 stories)
- Use Given-When-Then format (Gherkin style)
- Make criteria testable and specific
- Include positive, negative, and edge case scenarios
- Identify boundary conditions
- Cover error handling
- Include performance/security criteria where relevant
- Think like a tester trying to break the feature

**Example:**
Story: User Login
Criteria:
{
  "scenario": "Successful login with valid credentials",
  "given": ["User is on login page", "User has valid credentials"],
  "when": ["User enters correct email and password", "User clicks Login button"],
  "then": ["User is redirected to dashboard", "Session is created", "Welcome message is displayed"]
}

Respond ONLY with JSON.`;
  }

  private parseCriteriaSet(criteriaText: string): AcceptanceCriteriaSet {
    try {
      const jsonMatch = criteriaText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const stories: AcceptanceCriteria[] = Array.isArray(parsed.stories)
        ? parsed.stories.slice(0, 50).map((s: any) => ({
            storyId: s.storyId || 'US-000',
            criteria: Array.isArray(s.criteria)
              ? s.criteria.slice(0, 7).map((c: any, index: number) => ({
                  id: c.id || `AC-${s.storyId}-${String(index + 1).padStart(2, '0')}`,
                  scenario: c.scenario || 'Scenario not specified',
                  given: Array.isArray(c.given) ? c.given.slice(0, 5) : [],
                  when: Array.isArray(c.when) ? c.when.slice(0, 5) : [],
                  then: Array.isArray(c.then) ? c.then.slice(0, 5) : [],
                  testable: c.testable !== false, // Default to true
                }))
              : [],
            edgeCases: Array.isArray(s.edgeCases) ? s.edgeCases.slice(0, 5) : [],
            testScenarios: Array.isArray(s.testScenarios)
              ? s.testScenarios.slice(0, 5).map((ts: any) => ({
                  type: this.normalizeTestType(ts.type),
                  description: ts.description || 'Test scenario',
                  expectedOutcome: ts.expectedOutcome || 'Expected outcome not specified',
                }))
              : [],
          }))
        : [];

      const totalStories = stories.length;
      const storiesWithCriteria = stories.filter((s) => s.criteria.length > 0).length;
      const totalCriteria = stories.reduce((sum, s) => sum + s.criteria.length, 0);
      const averageCriteriaPerStory = totalStories > 0 ? totalCriteria / totalStories : 0;

      // Calculate testability score
      const testableCount = stories.reduce(
        (sum, s) => sum + s.criteria.filter((c) => c.testable).length,
        0
      );
      const testabilityScore =
        totalCriteria > 0 ? Math.round((testableCount / totalCriteria) * 100) : 0;

      return {
        stories,
        coverageMetrics: {
          totalStories,
          storiesWithCriteria,
          totalCriteria,
          averageCriteriaPerStory: Math.round(averageCriteriaPerStory * 10) / 10,
          testabilityScore,
        },
        testingRecommendations: Array.isArray(parsed.testingRecommendations)
          ? parsed.testingRecommendations.slice(0, 10)
          : [],
      };
    } catch (error) {
      console.warn('[AcceptanceCriteriaWriterAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeTestType(type: string): 'positive' | 'negative' | 'edge-case' {
    const normalized = type?.toLowerCase();
    if (normalized?.includes('negative')) return 'negative';
    if (normalized?.includes('edge')) return 'edge-case';
    return 'positive';
  }

  private fallbackCriteria(): ReasoningResult {
    const criteriaSet: AcceptanceCriteriaSet = {
      stories: [
        {
          storyId: 'US-001',
          criteria: [
            {
              id: 'AC-001-01',
              scenario: 'Successful user registration',
              given: ['User is on registration page', 'User has valid email'],
              when: ['User fills out registration form', 'User submits form'],
              then: [
                'Account is created',
                'Confirmation email is sent',
                'User is redirected to login',
              ],
              testable: true,
            },
            {
              id: 'AC-001-02',
              scenario: 'Registration with existing email',
              given: ['User is on registration page', 'Email already exists in system'],
              when: ['User attempts to register with existing email'],
              then: ['Error message is displayed', 'Registration is prevented'],
              testable: true,
            },
          ],
          edgeCases: [
            'Email with special characters',
            'Very long email addresses',
            'Concurrent registration attempts',
          ],
          testScenarios: [
            {
              type: 'positive',
              description: 'Register with all valid fields',
              expectedOutcome: 'Account created successfully',
            },
            {
              type: 'negative',
              description: 'Register with invalid email format',
              expectedOutcome: 'Validation error displayed',
            },
            {
              type: 'edge-case',
              description: 'Register during system maintenance',
              expectedOutcome: 'Graceful error message',
            },
          ],
        },
      ],
      coverageMetrics: {
        totalStories: 1,
        storiesWithCriteria: 1,
        totalCriteria: 2,
        averageCriteriaPerStory: 2.0,
        testabilityScore: 100,
      },
      testingRecommendations: [
        'Implement automated tests for all acceptance criteria',
        'Include integration tests for user flows',
        'Test edge cases in staging environment',
      ],
    };

    return {
      reasoning: 'Fallback acceptance criteria (LLM unavailable)',
      confidence: 0.5,
      intermediate: { criteriaSet },
    };
  }
}

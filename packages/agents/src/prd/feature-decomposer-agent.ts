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
 * User story following standard format
 */
interface UserStory {
  id: string;
  title: string;
  asA: string; // Role/persona
  iWant: string; // What they want to do
  soThat: string; // Why/value
  priority: 'must-have' | 'should-have' | 'nice-to-have';
  storyPoints: number; // Estimated complexity (1, 2, 3, 5, 8, 13)
  epic: string; // Parent epic/feature
  dependencies: string[]; // Other story IDs
  technicalNotes: string;
}

/**
 * Epic grouping related stories
 */
interface Epic {
  id: string;
  name: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedSprints: number;
  stories: string[]; // Story IDs
}

/**
 * Feature decomposition output
 */
interface FeatureDecomposition {
  epics: Epic[];
  stories: UserStory[];
  totalStoryPoints: number;
  estimatedSprints: number;
  developmentPlan: {
    sprintNumber: number;
    focus: string;
    stories: string[]; // Story IDs
    estimatedPoints: number;
  }[];
}

/**
 * FeatureDecomposerAgent
 *
 * Decomposes product features and functional requirements into:
 * - Epics (large feature groupings)
 * - User stories (following "As a... I want... So that..." format)
 * - Story point estimates (Fibonacci: 1, 2, 3, 5, 8, 13)
 * - Sprint planning (grouping stories into sprints)
 * - Dependency mapping
 *
 * Takes input from IdeaSpec, Strategy, PRD and converts high-level
 * requirements into actionable, estimable user stories.
 *
 * Part of the PRD phase (runs in parallel with other PRD agents).
 */
export class FeatureDecomposerAgent extends BaseAgent {
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
          stepId: 'identify-epics',
          description: 'Identify major feature epics',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'decompose-stories',
          description: 'Break down epics into user stories',
          estimatedDurationMs: 4000,
          requiredTools: [],
        },
        {
          stepId: 'estimate-complexity',
          description: 'Assign story points to each story',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'plan-sprints',
          description: 'Group stories into sprint plan',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.87,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractData(input, 'ideaSpec');
    const strategy = this.extractData(input, 'strategy');
    const prd = this.extractData(input, 'prd');
    const personas = this.extractData(input, 'personas');

    const prompt = this.buildDecompositionPrompt(ideaSpec, strategy, prd, personas);

    try {
      const response = await this.llm.invoke(prompt);
      const decompositionText = response.content.toString();

      const decomposition = this.parseDecomposition(decompositionText);

      return {
        reasoning: `Decomposed into ${decomposition.epics.length} epics, ${decomposition.stories.length} stories (${decomposition.totalStoryPoints} points)`,
        confidence: 0.88,
        intermediate: {
          decomposition,
        },
      };
    } catch (error) {
      console.warn('[FeatureDecomposerAgent] LLM failed, using fallback:', error);
      return this.fallbackDecomposition();
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const decomposition: FeatureDecomposition = result.intermediate.decomposition;

    return [
      {
        type: 'feature-decomposition',
        version: '1.0.0',
        content: decomposition,
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

  private buildDecompositionPrompt(
    ideaSpec: any,
    strategy: any,
    prd: any,
    personas: any
  ): string {
    return `You are a product owner decomposing features into user stories for development.

**Product:**
Title: ${ideaSpec?.title || 'N/A'}
Target Users: ${ideaSpec?.targetUsers?.join(', ') || 'N/A'}

**Strategy:**
Vision: ${strategy?.vision || 'N/A'}
Product Pillars: ${strategy?.productPillars?.map((p: any) => p.name).join(', ') || 'N/A'}

**Functional Requirements:**
${prd?.functionalRequirements?.map((fr: any) => `- ${fr.id}: ${fr.requirement}`).join('\n') || 'N/A'}

**Personas:**
${personas?.personas?.map((p: any) => `- ${p.name}: ${p.type}`).join('\n') || 'N/A'}

Decompose this into epics and user stories in JSON format:

{
  "epics": [
    {
      "id": "EP-001",
      "name": "<Epic name>",
      "description": "<What this epic encompasses>",
      "priority": "critical|high|medium|low",
      "estimatedSprints": <Number of sprints>,
      "stories": ["<Story IDs in this epic>"]
    }
  ],
  "stories": [
    {
      "id": "US-001",
      "title": "<Short descriptive title>",
      "asA": "<User role/persona>",
      "iWant": "<What they want to do>",
      "soThat": "<Why/value they get>",
      "priority": "must-have|should-have|nice-to-have",
      "storyPoints": <1|2|3|5|8|13>,
      "epic": "<Epic ID>",
      "dependencies": ["<Other story IDs>"],
      "technicalNotes": "<Implementation notes>"
    }
  ],
  "developmentPlan": [
    {
      "sprintNumber": 1,
      "focus": "<Sprint goal/theme>",
      "stories": ["<Story IDs>"],
      "estimatedPoints": <Total points>
    }
  ]
}

**Guidelines:**
- Create 5-10 epics representing major features
- Generate 50-100 user stories across all epics
- Use standard "As a... I want... So that..." format
- Story points follow Fibonacci: 1 (trivial), 2 (simple), 3 (medium), 5 (complex), 8 (very complex), 13 (epic-level)
- Average sprint velocity: 20-30 points
- Order stories by priority and dependencies
- Map stories to personas when relevant
- Include technical implementation notes
- Critical epics first, then high/medium/low

Respond ONLY with JSON.`;
  }

  private parseDecomposition(decompositionText: string): FeatureDecomposition {
    try {
      const jsonMatch = decompositionText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const epics: Epic[] = Array.isArray(parsed.epics)
        ? parsed.epics.slice(0, 10).map((e: any, index: number) => ({
            id: e.id || `EP-${String(index + 1).padStart(3, '0')}`,
            name: e.name || 'Epic',
            description: e.description || 'Description not provided',
            priority: this.normalizeEpicPriority(e.priority),
            estimatedSprints: Math.max(1, Math.min(10, e.estimatedSprints || 1)),
            stories: Array.isArray(e.stories) ? e.stories.slice(0, 20) : [],
          }))
        : [];

      const stories: UserStory[] = Array.isArray(parsed.stories)
        ? parsed.stories.slice(0, 100).map((s: any, index: number) => ({
            id: s.id || `US-${String(index + 1).padStart(3, '0')}`,
            title: s.title || 'User Story',
            asA: s.asA || 'User',
            iWant: s.iWant || 'To perform an action',
            soThat: s.soThat || 'I get value',
            priority: this.normalizeStoryPriority(s.priority),
            storyPoints: this.normalizeStoryPoints(s.storyPoints),
            epic: s.epic || 'EP-001',
            dependencies: Array.isArray(s.dependencies) ? s.dependencies.slice(0, 5) : [],
            technicalNotes: s.technicalNotes || 'Implementation notes TBD',
          }))
        : [];

      const totalStoryPoints = stories.reduce((sum, s) => sum + s.storyPoints, 0);

      const developmentPlan = Array.isArray(parsed.developmentPlan)
        ? parsed.developmentPlan.slice(0, 20).map((sp: any) => ({
            sprintNumber: sp.sprintNumber || 1,
            focus: sp.focus || 'Sprint focus',
            stories: Array.isArray(sp.stories) ? sp.stories.slice(0, 15) : [],
            estimatedPoints: sp.estimatedPoints || 0,
          }))
        : [];

      const estimatedSprints =
        developmentPlan.length > 0 ? developmentPlan.length : Math.ceil(totalStoryPoints / 25);

      return {
        epics,
        stories,
        totalStoryPoints,
        estimatedSprints,
        developmentPlan,
      };
    } catch (error) {
      console.warn('[FeatureDecomposerAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizeEpicPriority(priority: string): 'critical' | 'high' | 'medium' | 'low' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private normalizeStoryPriority(priority: string): 'must-have' | 'should-have' | 'nice-to-have' {
    const normalized = priority?.toLowerCase();
    if (normalized?.includes('must')) return 'must-have';
    if (normalized?.includes('should')) return 'should-have';
    return 'nice-to-have';
  }

  private normalizeStoryPoints(points: number): number {
    const fibonacciValues = [1, 2, 3, 5, 8, 13];
    const validPoints = fibonacciValues.find((v) => v >= points) || 13;
    return validPoints;
  }

  private fallbackDecomposition(): ReasoningResult {
    const decomposition: FeatureDecomposition = {
      epics: [
        {
          id: 'EP-001',
          name: 'Core Features',
          description: 'Essential functionality for MVP',
          priority: 'critical',
          estimatedSprints: 3,
          stories: ['US-001', 'US-002'],
        },
        {
          id: 'EP-002',
          name: 'User Management',
          description: 'Authentication and user profiles',
          priority: 'critical',
          estimatedSprints: 2,
          stories: ['US-003', 'US-004'],
        },
      ],
      stories: [
        {
          id: 'US-001',
          title: 'User Registration',
          asA: 'New User',
          iWant: 'To create an account',
          soThat: 'I can access the platform',
          priority: 'must-have',
          storyPoints: 5,
          epic: 'EP-002',
          dependencies: [],
          technicalNotes: 'Implement email verification',
        },
        {
          id: 'US-002',
          title: 'User Login',
          asA: 'Registered User',
          iWant: 'To login to my account',
          soThat: 'I can access my data',
          priority: 'must-have',
          storyPoints: 3,
          epic: 'EP-002',
          dependencies: ['US-001'],
          technicalNotes: 'JWT-based authentication',
        },
      ],
      totalStoryPoints: 8,
      estimatedSprints: 1,
      developmentPlan: [
        {
          sprintNumber: 1,
          focus: 'Core authentication and setup',
          stories: ['US-001', 'US-002'],
          estimatedPoints: 8,
        },
      ],
    };

    return {
      reasoning: 'Fallback feature decomposition (LLM unavailable)',
      confidence: 0.5,
      intermediate: { decomposition },
    };
  }
}

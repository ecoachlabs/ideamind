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
 * User persona
 */
interface UserPersona {
  name: string;
  type: 'primary' | 'secondary' | 'tertiary';
  demographics: {
    ageRange: string;
    occupation: string;
    location: string;
    education: string;
  };
  psychographics: {
    goals: string[];
    painPoints: string[];
    motivations: string[];
    frustrations: string[];
  };
  behavior: {
    techSavviness: 'low' | 'medium' | 'high';
    preferredDevices: string[];
    usageFrequency: string;
    keyActions: string[];
  };
  needsAndExpectations: string[];
  quote: string; // Persona's perspective in their own words
}

/**
 * User personas output
 */
interface UserPersonas {
  personas: UserPersona[];
  userJourneyHighlights: string[];
  accessibilityConsiderations: string[];
}

/**
 * UserPersonaBuilderAgent
 *
 * Creates detailed user personas based on target users from IdeaSpec.
 * Develops:
 * - Primary, secondary, and tertiary personas
 * - Demographics and psychographics
 * - User goals, pain points, and motivations
 * - Behavioral patterns
 * - User journey highlights
 * - Accessibility considerations
 *
 * Part of the IDEATION phase (runs in parallel).
 */
export class UserPersonaBuilderAgent extends BaseAgent {
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
          stepId: 'identify-user-segments',
          description: 'Identify primary, secondary, tertiary user segments',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'create-personas',
          description: 'Create detailed personas with demographics and psychographics',
          estimatedDurationMs: 6000,
          requiredTools: [],
        },
        {
          stepId: 'map-user-journey',
          description: 'Map key user journey highlights',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.85,
    };
  }

  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaSpec = this.extractIdeaSpec(input);

    const prompt = this.buildPersonaPrompt(ideaSpec);

    try {
      const response = await this.llm.invoke(prompt);
      const analysisText = response.content.toString();

      const personas = this.parsePersonas(analysisText);

      return {
        reasoning: `Created ${personas.personas.length} user personas`,
        confidence: 0.87,
        intermediate: {
          personas,
        },
      };
    } catch (error) {
      console.warn('[UserPersonaBuilderAgent] LLM failed, using fallback:', error);
      return this.fallbackPersonas(ideaSpec);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const personas: UserPersonas = result.intermediate.personas;

    return [
      {
        type: 'user-personas',
        version: '1.0.0',
        content: personas,
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  private extractIdeaSpec(input: AgentInput): any {
    if (input.data && typeof input.data === 'object') {
      return (input.data as any).ideaSpec || input.data;
    }
    return {};
  }

  private buildPersonaPrompt(ideaSpec: any): string {
    return `You are a UX researcher. Create detailed user personas for this product.

**Idea Details:**
Title: ${ideaSpec.title || 'Untitled'}
Description: ${ideaSpec.description || 'No description'}
Target Users: ${ideaSpec.targetUsers?.join(', ') || 'Not specified'}
Problem Statement: ${ideaSpec.problemStatement || 'Not specified'}

Create user personas in JSON format:

{
  "personas": [
    {
      "name": "<Persona name (e.g., 'Sarah the Startup Founder')>",
      "type": "primary|secondary|tertiary",
      "demographics": {
        "ageRange": "<Age range>",
        "occupation": "<Job title/role>",
        "location": "<Geographic location>",
        "education": "<Education level>"
      },
      "psychographics": {
        "goals": ["<Goal1>", "<Goal2>"],
        "painPoints": ["<Pain1>", "<Pain2>"],
        "motivations": ["<Motivation1>", "<Motivation2>"],
        "frustrations": ["<Frustration1>", "<Frustration2>"]
      },
      "behavior": {
        "techSavviness": "low|medium|high",
        "preferredDevices": ["<Device1>", "<Device2>"],
        "usageFrequency": "<How often they'd use the product>",
        "keyActions": ["<Action1>", "<Action2>"]
      },
      "needsAndExpectations": [
        "<What they expect from the product>",
        "<Must-have feature>"
      ],
      "quote": "<A quote representing their perspective in their own words>"
    }
  ],
  "userJourneyHighlights": [
    "<Key moment in user journey>",
    "<Critical touchpoint>"
  ],
  "accessibilityConsiderations": [
    "<Accessibility need>",
    "<Inclusive design consideration>"
  ]
}

Guidelines:
- Create 2-4 personas (1 primary, 1-2 secondary, 0-1 tertiary)
- **Primary persona**: Most important user, main target
- **Secondary persona**: Significant but not primary focus
- **Tertiary persona**: Edge case or aspirational user
- Each persona: 3-5 goals, 3-5 pain points, 2-3 motivations
- Quote: Make it authentic and relatable (15-30 words)
- User Journey: 3-5 key moments
- Accessibility: 2-4 considerations (WCAG, screen readers, etc.)
- Base personas on target users provided

Respond ONLY with JSON.`;
  }

  private parsePersonas(analysisText: string): UserPersonas {
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        personas: Array.isArray(parsed.personas)
          ? parsed.personas.slice(0, 4).map((p: any) => ({
              name: p.name || 'Unnamed User',
              type: this.normalizePersonaType(p.type),
              demographics: {
                ageRange: p.demographics?.ageRange || '25-45',
                occupation: p.demographics?.occupation || 'Professional',
                location: p.demographics?.location || 'Urban area',
                education: p.demographics?.education || 'College educated',
              },
              psychographics: {
                goals: Array.isArray(p.psychographics?.goals)
                  ? p.psychographics.goals.slice(0, 5)
                  : [],
                painPoints: Array.isArray(p.psychographics?.painPoints)
                  ? p.psychographics.painPoints.slice(0, 5)
                  : [],
                motivations: Array.isArray(p.psychographics?.motivations)
                  ? p.psychographics.motivations.slice(0, 3)
                  : [],
                frustrations: Array.isArray(p.psychographics?.frustrations)
                  ? p.psychographics.frustrations.slice(0, 3)
                  : [],
              },
              behavior: {
                techSavviness: this.normalizeTechLevel(p.behavior?.techSavviness),
                preferredDevices: Array.isArray(p.behavior?.preferredDevices)
                  ? p.behavior.preferredDevices.slice(0, 3)
                  : ['Desktop', 'Mobile'],
                usageFrequency: p.behavior?.usageFrequency || 'Daily',
                keyActions: Array.isArray(p.behavior?.keyActions)
                  ? p.behavior.keyActions.slice(0, 5)
                  : [],
              },
              needsAndExpectations: Array.isArray(p.needsAndExpectations)
                ? p.needsAndExpectations.slice(0, 5)
                : [],
              quote: p.quote || 'This product would help me solve my daily challenges.',
            }))
          : [],
        userJourneyHighlights: Array.isArray(parsed.userJourneyHighlights)
          ? parsed.userJourneyHighlights.slice(0, 5)
          : [],
        accessibilityConsiderations: Array.isArray(parsed.accessibilityConsiderations)
          ? parsed.accessibilityConsiderations.slice(0, 4)
          : [],
      };
    } catch (error) {
      console.warn('[UserPersonaBuilderAgent] Failed to parse:', error);
      throw error;
    }
  }

  private normalizePersonaType(type: string): 'primary' | 'secondary' | 'tertiary' {
    const normalized = type?.toLowerCase();
    if (normalized === 'primary') return 'primary';
    if (normalized === 'tertiary') return 'tertiary';
    return 'secondary';
  }

  private normalizeTechLevel(level: string): 'low' | 'medium' | 'high' {
    const normalized = level?.toLowerCase();
    if (normalized === 'low') return 'low';
    if (normalized === 'high') return 'high';
    return 'medium';
  }

  private fallbackPersonas(ideaSpec: any): ReasoningResult {
    const targetUser = ideaSpec.targetUsers?.[0] || 'general users';

    const personas: UserPersonas = {
      personas: [
        {
          name: `Alex the ${targetUser}`,
          type: 'primary',
          demographics: {
            ageRange: '28-42',
            occupation: targetUser,
            location: 'Urban/Suburban',
            education: 'College degree',
          },
          psychographics: {
            goals: [
              'Solve problems efficiently',
              'Save time',
              'Improve productivity',
            ],
            painPoints: [
              'Current solutions are too complex',
              'Lack of good alternatives',
              'High costs',
            ],
            motivations: ['Efficiency', 'Quality', 'Simplicity'],
            frustrations: ['Steep learning curves', 'Poor user experience'],
          },
          behavior: {
            techSavviness: 'medium',
            preferredDevices: ['Mobile', 'Desktop'],
            usageFrequency: 'Daily',
            keyActions: ['Search', 'Create', 'Share'],
          },
          needsAndExpectations: [
            'Easy to use interface',
            'Fast performance',
            'Reliable service',
          ],
          quote: 'I need a tool that just works without requiring me to read a manual.',
        },
      ],
      userJourneyHighlights: [
        'Discovery: Finds product through search or referral',
        'Onboarding: Quick setup in under 5 minutes',
        'First value: Achieves initial goal within first session',
        'Retention: Returns regularly for core use case',
      ],
      accessibilityConsiderations: [
        'Screen reader compatibility',
        'Keyboard navigation support',
        'High contrast mode',
      ],
    };

    return {
      reasoning: 'Fallback personas (LLM unavailable)',
      confidence: 0.6,
      intermediate: { personas },
    };
  }
}

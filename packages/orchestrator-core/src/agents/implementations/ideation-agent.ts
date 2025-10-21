import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * IdeationAgent - Generates creative variations and enhancements
 *
 * Takes structured intake and produces multiple creative approaches,
 * variations, and innovative enhancements to the core idea.
 */
export class IdeationAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('IdeationAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: true,
      supportsCheckpointing: true,
      maxInputSize: 40000,
      maxOutputSize: 80000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Ideation Agent');

    if (!this.validateInput(input)) {
      return {
        success: false,
        output: null,
        error: 'Invalid input',
      };
    }

    try {
      const prompt = this.buildPrompt(input, context);
      const systemPrompt = this.getSystemPrompt();

      const { text, tokensUsed } = await this.callClaude(prompt, 7000, systemPrompt);

      const ideation = this.parseJSON(text);

      return {
        success: true,
        output: ideation,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          variations_count: ideation.variations?.length || 0,
          enhancements_count: ideation.enhancements?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Ideation Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are an Ideation Agent that generates creative variations and enhancements.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Generate creative variations and enhancements for the core idea.

Think divergently and explore:
1. **Core Variations**: Different approaches to solve the same problem
2. **Feature Enhancements**: Innovative features that add value
3. **Experience Innovations**: Novel UX/UI approaches
4. **Technology Alternatives**: Different tech stacks or architectures
5. **Business Model Variations**: Alternative monetization or value delivery
6. **Integration Opportunities**: Synergies with other systems/platforms
7. **Scaling Scenarios**: How it could evolve over time

For each idea, assess:
- Innovation level (incremental/moderate/breakthrough)
- Feasibility (low/medium/high)
- Impact potential (low/medium/high)
- Resource requirements (light/moderate/heavy)

Output as JSON:
{
  "variations": [
    {
      "id": "VAR-001",
      "title": "Variation title",
      "description": "What makes this different",
      "approach": "Core approach description",
      "key_differentiators": ["diff1", "diff2"],
      "innovation_level": "incremental|moderate|breakthrough",
      "feasibility": "low|medium|high",
      "impact_potential": "low|medium|high",
      "pros": ["pro1", "pro2"],
      "cons": ["con1", "con2"]
    }
  ],
  "enhancements": [
    {
      "id": "ENH-001",
      "category": "feature|experience|technology|integration",
      "title": "Enhancement title",
      "description": "What it adds",
      "value_proposition": "Why it matters",
      "implementation_complexity": "low|medium|high",
      "user_impact": "low|medium|high",
      "dependencies": ["dep1"],
      "estimated_effort": "Resource estimate"
    }
  ],
  "innovative_twists": [
    {
      "twist": "Innovative idea",
      "rationale": "Why this could be game-changing",
      "risks": ["risk1"],
      "opportunities": ["opp1"]
    }
  ],
  "integration_ideas": [
    {
      "platform": "Platform/system name",
      "integration_type": "API|webhook|embed|native",
      "value_added": "What this enables",
      "complexity": "low|medium|high"
    }
  ],
  "scaling_path": {
    "mvp": "Minimal viable product scope",
    "phase_1": "First expansion",
    "phase_2": "Second expansion",
    "long_term_vision": "Ultimate vision"
  },
  "recommended_approach": {
    "variation_id": "VAR-001",
    "rationale": "Why this is recommended",
    "key_enhancements": ["ENH-001", "ENH-003"],
    "implementation_priority": "Priority order"
  }
}`;
  }

  private getSystemPrompt(): string {
    return `You are a creative innovation expert specializing in:
- Generating diverse variations and approaches
- Identifying breakthrough opportunities
- Balancing innovation with feasibility
- Enhancing ideas with practical features
- Anticipating future scaling paths

Be bold and creative while staying grounded in practicality.`;
  }
}

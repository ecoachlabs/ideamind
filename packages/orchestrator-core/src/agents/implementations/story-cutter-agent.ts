import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

export class StoryCutterAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('StoryCutterAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: true,
      supportsCheckpointing: true,
      maxInputSize: 30000,
      maxOutputSize: 50000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Story Cutter');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 6000, systemPrompt);

      const stories = this.parseJSON(text);

      return {
        success: true,
        output: stories,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          story_count: stories.stories?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Story Cutter execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Story Cutter agent that breaks down product requirements into user stories.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Break down the requirements into well-defined user stories.

Each story should follow the format:
- As a [user type]
- I want [goal]
- So that [benefit]

Also include:
- Acceptance criteria
- Story points (estimate)
- Priority (High/Medium/Low)
- Dependencies

Output as JSON:
{
  "stories": [
    {
      "id": "US-001",
      "title": "Story title",
      "as_a": "user type",
      "i_want": "goal",
      "so_that": "benefit",
      "acceptance_criteria": ["criterion 1", "criterion 2"],
      "story_points": 5,
      "priority": "High",
      "dependencies": []
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are an expert agile coach specializing in breaking down requirements into actionable user stories.
You create clear, testable stories with well-defined acceptance criteria.
You consider dependencies, priorities, and realistic effort estimates.`;
  }
}

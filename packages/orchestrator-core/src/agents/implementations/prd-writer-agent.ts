import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

export class PRDWriterAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('PRDWriterAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 50000,
      maxOutputSize: 100000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing PRD Writer');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 8000, systemPrompt);

      const prd = this.parseJSON(text);

      return {
        success: true,
        output: prd,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'PRD Writer execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Product Requirements Document (PRD) writer.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Write a comprehensive PRD based on the input and context.

The PRD should include:
1. Product Overview
2. Goals and Objectives
3. User Stories
4. Functional Requirements
5. Non-Functional Requirements
6. Success Metrics
7. Technical Considerations
8. Dependencies
9. Timeline and Milestones
10. Risks and Mitigation

Output the PRD as a JSON object with these sections.`;
  }

  private getSystemPrompt(): string {
    return `You are an expert product manager writing detailed, actionable PRDs.
You create clear, comprehensive requirements that engineering teams can implement.
Always consider technical feasibility, user experience, and business goals.`;
  }
}

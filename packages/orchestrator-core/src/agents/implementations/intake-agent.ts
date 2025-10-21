import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * IntakeAgent - First phase agent that structures raw ideas
 *
 * Takes unstructured idea input and creates a structured intake document
 * with clear goals, constraints, target users, and success criteria.
 */
export class IntakeAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('IntakeAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 20000,
      maxOutputSize: 40000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Intake Agent');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 5000, systemPrompt);

      const intakeDoc = this.parseJSON(text);

      return {
        success: true,
        output: intakeDoc,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Intake Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are an Intake Agent that structures raw ideas into clear, actionable intake documents.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Create a structured intake document that captures the essence of the idea.

Extract and organize:
1. **Core Idea**: What is the main concept?
2. **Problem Statement**: What problem does this solve?
3. **Target Users**: Who will use this?
4. **Goals**: What are the primary objectives?
5. **Constraints**: Budget, timeline, technical limitations
6. **Success Metrics**: How will success be measured?
7. **Assumptions**: What are we assuming to be true?
8. **Questions**: What needs clarification?
9. **Risks**: What could go wrong?
10. **Next Steps**: What should happen next?

Output as JSON:
{
  "core_idea": {
    "title": "Brief title",
    "description": "Clear description",
    "category": "app/service/tool/platform/etc"
  },
  "problem_statement": "Clear problem description",
  "target_users": [
    {
      "persona": "User type",
      "needs": ["need1", "need2"],
      "pain_points": ["pain1", "pain2"]
    }
  ],
  "goals": {
    "primary": ["goal1", "goal2"],
    "secondary": ["goal3", "goal4"]
  },
  "constraints": {
    "budget": "Budget info or 'unspecified'",
    "timeline": "Timeline or 'unspecified'",
    "technical": ["constraint1", "constraint2"],
    "resources": ["resource constraint"]
  },
  "success_metrics": [
    {
      "metric": "Metric name",
      "target": "Target value",
      "measurement": "How to measure"
    }
  ],
  "assumptions": ["assumption1", "assumption2"],
  "open_questions": ["question1", "question2"],
  "risks": [
    {
      "risk": "Risk description",
      "severity": "low|medium|high|critical",
      "mitigation": "Mitigation strategy"
    }
  ],
  "next_steps": ["step1", "step2"]
}`;
  }

  private getSystemPrompt(): string {
    return `You are an expert intake specialist who excels at:
- Extracting key information from unstructured input
- Identifying implicit requirements and constraints
- Asking clarifying questions
- Structuring information clearly
- Anticipating risks and challenges

Be thorough but concise. Focus on actionable information.`;
  }
}

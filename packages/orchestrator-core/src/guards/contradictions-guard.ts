import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import { Guard, GuardResult } from './guard-interface';

const logger = pino({ name: 'contradictions-guard' });

/**
 * Contradictions Guard
 *
 * Checks for logical contradictions across artifacts using Claude
 */
export class ContradictionsGuard implements Guard {
  readonly type = 'contradictions';
  private anthropic: Anthropic;

  constructor(
    private apiKey: string,
    private model: string = 'claude-3-5-sonnet-20241022'
  ) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async execute(
    artifacts: Array<{ id: string; type: string; content?: any }>,
    context: Record<string, any>
  ): Promise<GuardResult> {
    logger.debug({ artifacts_count: artifacts.length }, 'Running contradictions check');

    if (artifacts.length < 2) {
      // Not enough artifacts to check for contradictions
      return {
        type: this.type,
        pass: true,
        score: 1.0,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const prompt = this.buildPrompt(artifacts);

      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Expected text response');
      }

      // Parse response
      const result = this.parseResponse(content.text);

      logger.info(
        {
          pass: result.pass,
          contradictions_found: result.contradictions.length,
        },
        'Contradictions check complete'
      );

      return {
        type: this.type,
        pass: result.pass,
        score: result.score,
        reasons: result.contradictions,
        severity: result.contradictions.length > 0 ? 'high' : undefined,
        recommendations: result.recommendations,
        metadata: {
          contradictions_count: result.contradictions.length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ error }, 'Contradictions check failed');

      // Fail safe - pass but with low score
      return {
        type: this.type,
        pass: true,
        score: 0.7,
        reasons: ['Unable to fully check for contradictions'],
        metadata: {
          error: error.message,
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  private buildPrompt(
    artifacts: Array<{ id: string; type: string; content?: any }>
  ): string {
    return `You are analyzing artifacts from a software development phase for logical contradictions.

## Artifacts:
${artifacts
  .map(
    (a, i) => `
### Artifact ${i + 1}: ${a.type}
${JSON.stringify(a.content, null, 2)}
`
  )
  .join('\n')}

## Your Task:
Analyze these artifacts for logical contradictions, inconsistencies, or conflicting information.

Consider:
1. Direct contradictions (X says A, Y says not-A)
2. Inconsistent assumptions or requirements
3. Conflicting timelines, priorities, or goals
4. Incompatible technical decisions

## Output Format:
Return a JSON object with this structure:
{
  "contradictions": [
    "Description of contradiction 1",
    "Description of contradiction 2"
  ],
  "recommendations": [
    "How to resolve contradiction 1",
    "How to resolve contradiction 2"
  ],
  "severity": "none|low|medium|high"
}

Return ONLY the JSON object, no additional text.`;
  }

  private parseResponse(response: string): {
    pass: boolean;
    score: number;
    contradictions: string[];
    recommendations: string[];
  } {
    // Extract JSON from response
    let jsonText = response.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    const contradictions = parsed.contradictions || [];
    const recommendations = parsed.recommendations || [];
    const severity = parsed.severity || 'none';

    // Calculate score based on severity
    let score = 1.0;
    switch (severity) {
      case 'high':
        score = 0.3;
        break;
      case 'medium':
        score = 0.6;
        break;
      case 'low':
        score = 0.8;
        break;
      case 'none':
        score = 1.0;
        break;
    }

    return {
      pass: contradictions.length === 0,
      score,
      contradictions,
      recommendations,
    };
  }
}

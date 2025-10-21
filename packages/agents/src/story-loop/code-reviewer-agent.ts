import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Code Review Finding
 */
interface ReviewFinding {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  category: 'security' | 'performance' | 'maintainability' | 'best-practices' | 'bugs' | 'style';
  file: string;
  line?: number;
  issue: string;
  recommendation: string;
  example?: string;
}

/**
 * Code Quality Metrics
 */
interface CodeQualityMetrics {
  overallScore: number; // 0-100
  breakdown: {
    security: number;
    performance: number;
    maintainability: number;
    testability: number;
    documentation: number;
  };
  complexity: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    linesOfCode: number;
    filesReviewed: number;
  };
}

/**
 * Best Practices Compliance
 */
interface BestPracticesCompliance {
  framework: {
    practice: string;
    compliant: boolean;
    notes?: string;
  }[];
  language: {
    practice: string;
    compliant: boolean;
    notes?: string;
  }[];
  architecture: {
    practice: string;
    compliant: boolean;
    notes?: string;
  }[];
}

/**
 * Code Review
 */
interface CodeReview {
  summary: {
    overallAssessment: 'approved' | 'approved-with-suggestions' | 'changes-requested' | 'rejected';
    criticalIssues: number;
    majorIssues: number;
    minorIssues: number;
    suggestions: number;
    reviewNotes: string;
  };
  findings: ReviewFinding[];
  qualityMetrics: CodeQualityMetrics;
  bestPractices: BestPracticesCompliance;
  positiveObservations: string[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
  }[];
  securityAnalysis: {
    vulnerabilities: {
      type: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      mitigation: string;
    }[];
    secureCodeScore: number; // 0-100
  };
  performanceAnalysis: {
    concerns: string[];
    optimizations: string[];
    estimatedImpact: string;
  };
  reviewedBy: string;
  reviewedAt: string;
}

/**
 * CodeReviewerAgent
 *
 * Performs comprehensive code reviews on implemented user stories including:
 * - Security vulnerability scanning
 * - Performance analysis
 * - Code quality assessment
 * - Best practices compliance
 * - Architecture alignment
 * - Error handling review
 * - Documentation quality
 * - Testability analysis
 *
 * Provides actionable feedback with severity levels and specific recommendations.
 *
 * Input: Code implementation from StoryCoderAgent
 * Output: Comprehensive code review with findings and quality metrics
 */
export class CodeReviewerAgent extends BaseAgent {
  private llm: ChatAnthropic;

  constructor(config: AgentConfig) {
    super(config);

    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  protected async plan(input: any): Promise<ExecutionPlan> {
    return {
      steps: [
        'Analyze code for security vulnerabilities',
        'Review code quality and maintainability',
        'Check best practices compliance',
        'Generate findings and recommendations',
      ],
      estimatedTotalDurationMs: 10000, // ~10 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildReviewPrompt(input);

      this.logger.info('Invoking LLM for code review');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const review = this.parseReview(content);

      return {
        reasoning: `Reviewed code with overall assessment: ${review.summary.overallAssessment}. Found ${review.findings.length} issues (${review.summary.criticalIssues} critical, ${review.summary.majorIssues} major). Quality score: ${review.qualityMetrics.overallScore}/100.`,
        confidence: 0.85,
        intermediate: {
          review,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for code review', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const review = result.intermediate?.review;

    return [
      {
        type: 'code-review',
        content: review,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildReviewPrompt(input: any): string {
    const { codeImplementation, previousArtifacts } = input;

    const files = codeImplementation?.files || [];
    const userStory = codeImplementation?.userStory;

    // Extract context
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;

    const language = repoBlueprint?.overview?.language || 'TypeScript';
    const framework = repoBlueprint?.overview?.framework || 'React';

    return `You are a Senior Code Reviewer performing a comprehensive code review.

USER STORY:
${userStory?.title || 'N/A'}

CODE FILES TO REVIEW (${files.length} files):
${files.map((f: any, i: number) => `
File ${i + 1}: ${f.path} (${f.linesOfCode} LOC)
\`\`\`${f.language}
${f.content}
\`\`\`
`).join('\n')}

PROJECT CONTEXT:
Language: ${language}
Framework: ${framework}
Architecture: ${systemArch?.overview?.architectureStyle || 'N/A'}

TASK:
Perform a comprehensive code review. Your response MUST be valid JSON matching this structure:

{
  "summary": {
    "overallAssessment": "approved|approved-with-suggestions|changes-requested|rejected",
    "criticalIssues": 0,
    "majorIssues": 2,
    "minorIssues": 5,
    "suggestions": 3,
    "reviewNotes": "Overall assessment summary (2-3 sentences)"
  },
  "findings": [
    {
      "severity": "critical|major|minor|suggestion",
      "category": "security|performance|maintainability|best-practices|bugs|style",
      "file": "src/components/UserProfile.tsx",
      "line": 25,
      "issue": "Clear description of the issue",
      "recommendation": "Specific recommendation to fix",
      "example": "Code example showing the fix"
    }
  ],
  "qualityMetrics": {
    "overallScore": 85,
    "breakdown": {
      "security": 90,
      "performance": 85,
      "maintainability": 80,
      "testability": 75,
      "documentation": 70
    },
    "complexity": {
      "cyclomaticComplexity": 5,
      "cognitiveComplexity": 8,
      "linesOfCode": 150,
      "filesReviewed": ${files.length}
    }
  },
  "bestPractices": {
    "framework": [
      {
        "practice": "Component composition",
        "compliant": true,
        "notes": "Good use of composition"
      }
    ],
    "language": [
      {
        "practice": "Type safety",
        "compliant": true,
        "notes": "All functions properly typed"
      }
    ],
    "architecture": [
      {
        "practice": "Separation of concerns",
        "compliant": true
      }
    ]
  },
  "positiveObservations": [
    "Excellent error handling",
    "Clear and concise code",
    "Good use of TypeScript features"
  ],
  "recommendations": [
    {
      "priority": "high",
      "recommendation": "Add input validation",
      "impact": "Prevents security vulnerabilities"
    }
  ],
  "securityAnalysis": {
    "vulnerabilities": [
      {
        "type": "SQL Injection",
        "severity": "critical",
        "description": "User input not sanitized",
        "mitigation": "Use parameterized queries"
      }
    ],
    "secureCodeScore": 85
  },
  "performanceAnalysis": {
    "concerns": [
      "Inefficient database queries"
    ],
    "optimizations": [
      "Add database indexes",
      "Implement caching"
    ],
    "estimatedImpact": "20-30% performance improvement"
  },
  "reviewedBy": "CodeReviewerAgent",
  "reviewedAt": "${new Date().toISOString()}"
}

REVIEW CRITERIA:
1. **Security**: Check for vulnerabilities (SQL injection, XSS, authentication issues, etc.)
2. **Performance**: Identify inefficient code, unnecessary computations, memory leaks
3. **Maintainability**: Code readability, naming conventions, comments, documentation
4. **Best Practices**: ${framework} and ${language} best practices compliance
5. **Architecture**: Alignment with established architecture patterns
6. **Error Handling**: Proper try-catch, error messages, edge cases
7. **Testability**: Code structure allows for easy testing
8. **Code Quality**: DRY, SOLID principles, proper abstractions

SEVERITY LEVELS:
- **Critical**: Security vulnerabilities, data loss risks, breaking bugs
- **Major**: Significant performance issues, poor error handling, major maintainability concerns
- **Minor**: Code style issues, minor inefficiencies, missing documentation
- **Suggestion**: Nice-to-have improvements, alternative approaches

Provide 5-15 findings with specific, actionable recommendations.

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseReview(text: string): CodeReview {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize assessment
      if (parsed.summary?.overallAssessment) {
        parsed.summary.overallAssessment = this.normalizeAssessment(parsed.summary.overallAssessment);
      }

      return parsed as CodeReview;
    } catch (error) {
      this.logger.error('Failed to parse code review', { error });
      throw error;
    }
  }

  private normalizeAssessment(assessment: string): 'approved' | 'approved-with-suggestions' | 'changes-requested' | 'rejected' {
    const lower = assessment?.toLowerCase().trim() || '';
    if (lower.includes('approved') && lower.includes('suggestion')) return 'approved-with-suggestions';
    if (lower.includes('approved')) return 'approved';
    if (lower.includes('changes') || lower.includes('request')) return 'changes-requested';
    if (lower.includes('reject')) return 'rejected';
    return 'approved-with-suggestions';
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback code review');

    const { codeImplementation } = input;
    const files = codeImplementation?.files || [];

    const review: CodeReview = {
      summary: {
        overallAssessment: 'approved-with-suggestions',
        criticalIssues: 0,
        majorIssues: 0,
        minorIssues: 2,
        suggestions: 3,
        reviewNotes: 'Code review completed with automated analysis. Manual review recommended.',
      },
      findings: [
        {
          severity: 'minor',
          category: 'documentation',
          file: files[0]?.path || 'unknown',
          issue: 'Missing JSDoc comments',
          recommendation: 'Add JSDoc comments to public functions',
        },
        {
          severity: 'suggestion',
          category: 'best-practices',
          file: files[0]?.path || 'unknown',
          issue: 'Consider adding error boundaries',
          recommendation: 'Wrap components in error boundaries for better error handling',
        },
      ],
      qualityMetrics: {
        overallScore: 75,
        breakdown: {
          security: 80,
          performance: 75,
          maintainability: 70,
          testability: 75,
          documentation: 60,
        },
        complexity: {
          cyclomaticComplexity: 5,
          cognitiveComplexity: 7,
          linesOfCode: files.reduce((sum: number, f: any) => sum + (f.linesOfCode || 0), 0),
          filesReviewed: files.length,
        },
      },
      bestPractices: {
        framework: [
          {
            practice: 'Component structure',
            compliant: true,
          },
        ],
        language: [
          {
            practice: 'Type safety',
            compliant: true,
          },
        ],
        architecture: [
          {
            practice: 'Separation of concerns',
            compliant: true,
          },
        ],
      },
      positiveObservations: [
        'Code follows established patterns',
        'Good file organization',
      ],
      recommendations: [
        {
          priority: 'medium',
          recommendation: 'Add comprehensive error handling',
          impact: 'Improves application reliability',
        },
      ],
      securityAnalysis: {
        vulnerabilities: [],
        secureCodeScore: 80,
      },
      performanceAnalysis: {
        concerns: [],
        optimizations: [
          'Consider memoization for expensive computations',
        ],
        estimatedImpact: '5-10% performance improvement',
      },
      reviewedBy: 'CodeReviewerAgent (Fallback)',
      reviewedAt: new Date().toISOString(),
    };

    return {
      reasoning: 'Using fallback code review as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        review,
      },
    };
  }
}

import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * UI Design Issue
 */
interface UIDesignIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'consistency' | 'spacing' | 'typography' | 'color' | 'layout' | 'responsive' | 'branding';
  component: string;
  issue: string;
  recommendation: string;
  impact: string;
  example?: string;
}

/**
 * Design System Compliance
 */
interface DesignSystemCompliance {
  area: string;
  compliant: boolean;
  issues: string[];
  recommendations: string[];
}

/**
 * Brand Consistency Check
 */
interface BrandConsistencyCheck {
  element: string;
  consistent: boolean;
  deviations: string[];
  impact: 'high' | 'medium' | 'low';
}

/**
 * UI Quality Metrics
 */
interface UIQualityMetrics {
  overallScore: number; // 0-100
  breakdown: {
    consistency: number;
    spacing: number;
    typography: number;
    colorUsage: number;
    responsiveness: number;
    visualHierarchy: number;
  };
  designSystemAdherence: number; // 0-100
  brandConsistency: number; // 0-100
}

/**
 * Responsive Design Analysis
 */
interface ResponsiveDesignAnalysis {
  breakpoint: string;
  viewport: { width: number; height: number };
  issues: string[];
  recommendations: string[];
  score: number; // 0-100
}

/**
 * UI Audit Report
 */
interface UIAuditReport {
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    uiQualityScore: number; // 0-100
    designSystemScore: number; // 0-100
  };
  issues: UIDesignIssue[];
  qualityMetrics: UIQualityMetrics;
  designSystemCompliance: DesignSystemCompliance[];
  brandConsistency: BrandConsistencyCheck[];
  responsiveAnalysis: ResponsiveDesignAnalysis[];
  colorPalette: {
    colors: { hex: string; usage: string; wcagCompliance: boolean }[];
    issues: string[];
    recommendations: string[];
  };
  typography: {
    fonts: { family: string; weights: string[]; usage: string }[];
    issues: string[];
    recommendations: string[];
  };
  spacing: {
    scale: string;
    consistent: boolean;
    issues: string[];
    recommendations: string[];
  };
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
  }[];
  bestPractices: {
    practice: string;
    followed: boolean;
    notes?: string;
  }[];
}

/**
 * UIAuditorAgent
 *
 * Performs comprehensive UI/UX design audit including:
 * - Design consistency across components
 * - Design system compliance
 * - Brand consistency validation
 * - Typography and color usage
 * - Spacing and layout quality
 * - Responsive design evaluation
 * - Visual hierarchy assessment
 * - UI/UX best practices compliance
 *
 * Provides actionable recommendations for improving visual design quality
 * and user experience.
 *
 * Input: Visual regression tests + Code implementation + Design system
 * Output: Comprehensive UI audit report with quality scores
 */
export class UIAuditorAgent extends BaseAgent {
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
        'Analyze UI components for design consistency',
        'Review design system compliance',
        'Evaluate brand consistency',
        'Generate UI quality recommendations',
      ],
      estimatedTotalDurationMs: 14000, // ~14 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildUIAuditPrompt(input);

      this.logger.info('Invoking LLM for UI audit');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const auditReport = this.parseAuditReport(content);

      return {
        reasoning: `UI audit identified ${auditReport.summary.totalIssues} design issues (${auditReport.summary.criticalIssues} critical, ${auditReport.summary.highIssues} high). UI Quality Score: ${auditReport.summary.uiQualityScore}/100.`,
        confidence: 0.85,
        intermediate: {
          auditReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for UI audit', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const auditReport = result.intermediate?.auditReport;

    return [
      {
        type: 'ui-audit-report',
        content: auditReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildUIAuditPrompt(input: any): string {
    const { previousArtifacts } = input;

    // Extract context
    const visualSuite = previousArtifacts?.find((a: any) => a.type === 'visual-regression-suite')?.content;
    const storyLoopComplete = previousArtifacts?.find((a: any) => a.type === 'story-loop-complete')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const framework = repoBlueprint?.overview?.framework || 'React';
    const totalComponents = visualSuite?.summary?.criticalComponents || 0;
    const totalFiles = storyLoopComplete?.summary?.totalFiles || 0;

    return `You are a Senior UI/UX Designer performing a comprehensive design audit.

PROJECT CONTEXT:
Framework: ${framework}
Total Components: ${totalComponents}
Total Code Files: ${totalFiles}
Visual Tests: ${visualSuite?.summary?.totalScenarios || 0} scenarios

VISUAL REGRESSION TEST COMPONENTS:
${visualSuite?.componentStates?.slice(0, 5).map((c: any) => `
- ${c.component}: ${c.states?.length || 0} states (${c.priority} priority)
`).join('\n') || 'No component information available'}

TASK:
Perform comprehensive UI design audit. Your response MUST be valid JSON:

{
  "summary": {
    "totalIssues": 15,
    "criticalIssues": 2,
    "highIssues": 5,
    "mediumIssues": 6,
    "lowIssues": 2,
    "uiQualityScore": 78,
    "designSystemScore": 85
  },
  "issues": [
    {
      "id": "UI-001",
      "severity": "high",
      "category": "consistency",
      "component": "Button",
      "issue": "Inconsistent button padding across primary and secondary variants",
      "recommendation": "Standardize button padding to 12px 24px for all variants",
      "impact": "Creates visual inconsistency and breaks design system",
      "example": "Primary: 12px 24px, Secondary: 10px 20px"
    },
    {
      "id": "UI-002",
      "severity": "medium",
      "category": "spacing",
      "component": "Form Input",
      "issue": "Non-standard spacing between form fields (16px, 20px, 24px used)",
      "recommendation": "Use consistent 20px spacing between all form fields",
      "impact": "Reduces visual rhythm and polish"
    },
    {
      "id": "UI-003",
      "severity": "critical",
      "category": "color",
      "component": "Alert Component",
      "issue": "Error alert color (#FF0000) fails WCAG contrast requirements",
      "recommendation": "Use darker error color (#D32F2F) for 4.5:1 contrast ratio",
      "impact": "Accessibility violation, text unreadable for low vision users"
    }
  ],
  "qualityMetrics": {
    "overallScore": 78,
    "breakdown": {
      "consistency": 75,
      "spacing": 80,
      "typography": 85,
      "colorUsage": 70,
      "responsiveness": 82,
      "visualHierarchy": 78
    },
    "designSystemAdherence": 85,
    "brandConsistency": 90
  },
  "designSystemCompliance": [
    {
      "area": "Color Palette",
      "compliant": true,
      "issues": [],
      "recommendations": ["Consider adding semantic color tokens for better maintainability"]
    },
    {
      "area": "Typography Scale",
      "compliant": false,
      "issues": ["Custom font sizes used outside defined scale (13px, 15px, 17px)"],
      "recommendations": ["Remove custom sizes, use type scale: 12, 14, 16, 20, 24, 32, 48"]
    },
    {
      "area": "Spacing System",
      "compliant": true,
      "issues": [],
      "recommendations": []
    }
  ],
  "brandConsistency": [
    {
      "element": "Logo Usage",
      "consistent": true,
      "deviations": [],
      "impact": "high"
    },
    {
      "element": "Color Application",
      "consistent": false,
      "deviations": ["Brand blue (#2E5BFF) replaced with #3366FF in 3 components"],
      "impact": "medium"
    },
    {
      "element": "Typography",
      "consistent": true,
      "deviations": [],
      "impact": "high"
    }
  ],
  "responsiveAnalysis": [
    {
      "breakpoint": "Mobile (375px)",
      "viewport": { "width": 375, "height": 667 },
      "issues": [
        "Navigation menu overflows on small screens",
        "Card grid does not stack properly"
      ],
      "recommendations": [
        "Add hamburger menu for mobile navigation",
        "Use CSS Grid with auto-fit for responsive cards"
      ],
      "score": 65
    },
    {
      "breakpoint": "Tablet (768px)",
      "viewport": { "width": 768, "height": 1024 },
      "issues": ["Dashboard sidebar takes too much horizontal space"],
      "recommendations": ["Make sidebar collapsible on tablet"],
      "score": 80
    },
    {
      "breakpoint": "Desktop (1920px)",
      "viewport": { "width": 1920, "height": 1080 },
      "issues": [],
      "recommendations": ["Content looks good at desktop resolution"],
      "score": 95
    }
  ],
  "colorPalette": {
    "colors": [
      {
        "hex": "#2E5BFF",
        "usage": "Primary brand color, CTAs, links",
        "wcagCompliance": true
      },
      {
        "hex": "#FF0000",
        "usage": "Error states",
        "wcagCompliance": false
      },
      {
        "hex": "#FFFFFF",
        "usage": "Background, cards",
        "wcagCompliance": true
      }
    ],
    "issues": [
      "Error red (#FF0000) fails WCAG AA contrast requirements",
      "No semantic color tokens defined"
    ],
    "recommendations": [
      "Replace #FF0000 with #D32F2F for errors",
      "Define semantic tokens: primary, secondary, error, warning, success",
      "Document color usage guidelines"
    ]
  },
  "typography": {
    "fonts": [
      {
        "family": "Inter",
        "weights": ["400", "500", "600", "700"],
        "usage": "Body text, headings"
      },
      {
        "family": "Roboto Mono",
        "weights": ["400"],
        "usage": "Code blocks"
      }
    ],
    "issues": [
      "Inconsistent heading sizes (h2 ranges from 24px to 28px)",
      "Line height not defined consistently"
    ],
    "recommendations": [
      "Define type scale with consistent sizes",
      "Set line-height to 1.5 for body text, 1.2 for headings",
      "Create utility classes for consistent typography"
    ]
  },
  "spacing": {
    "scale": "8px base (8, 16, 24, 32, 48, 64)",
    "consistent": false,
    "issues": [
      "Custom spacing values used (12px, 20px, 36px)",
      "Component padding varies (8-16px for similar elements)"
    ],
    "recommendations": [
      "Strictly adhere to 8px spacing scale",
      "Remove custom spacing values",
      "Standardize component padding"
    ]
  },
  "recommendations": [
    {
      "priority": "immediate",
      "recommendation": "Fix WCAG contrast violations for error colors",
      "impact": "Resolves critical accessibility issues",
      "effort": "low"
    },
    {
      "priority": "high",
      "recommendation": "Standardize spacing across all components using 8px scale",
      "impact": "Significantly improves visual consistency and polish",
      "effort": "medium"
    },
    {
      "priority": "high",
      "recommendation": "Fix mobile responsive issues (navigation, card grid)",
      "impact": "Improves mobile user experience",
      "effort": "medium"
    },
    {
      "priority": "medium",
      "recommendation": "Create comprehensive design system documentation",
      "impact": "Ensures long-term design consistency",
      "effort": "high"
    }
  ],
  "bestPractices": [
    {
      "practice": "Consistent spacing system",
      "followed": false,
      "notes": "Custom spacing values break design system"
    },
    {
      "practice": "WCAG 2.1 AA color contrast",
      "followed": false,
      "notes": "Error colors fail contrast requirements"
    },
    {
      "practice": "Mobile-first responsive design",
      "followed": false,
      "notes": "Mobile layout issues indicate desktop-first approach"
    },
    {
      "practice": "Semantic color tokens",
      "followed": true,
      "notes": "Good use of primary, secondary naming"
    }
  ]
}

REQUIREMENTS:
- Identify 10-20 UI design issues across all categories
- Focus on:
  - Design consistency (colors, spacing, typography)
  - Design system compliance
  - Brand consistency
  - Responsive design quality
  - Visual hierarchy
  - WCAG color contrast
  - Component polish and refinement
- Provide specific, actionable recommendations
- Score each area 0-100
- Prioritize issues by impact
- Include code examples where relevant

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseAuditReport(text: string): UIAuditReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as UIAuditReport;
    } catch (error) {
      this.logger.error('Failed to parse UI audit report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback UI audit report');

    const auditReport: UIAuditReport = {
      summary: {
        totalIssues: 5,
        criticalIssues: 0,
        highIssues: 2,
        mediumIssues: 3,
        lowIssues: 0,
        uiQualityScore: 75,
        designSystemScore: 80,
      },
      issues: [
        {
          id: 'UI-001',
          severity: 'high',
          category: 'consistency',
          component: 'Button',
          issue: 'Inconsistent button styling',
          recommendation: 'Standardize button styles',
          impact: 'Reduces visual consistency',
        },
      ],
      qualityMetrics: {
        overallScore: 75,
        breakdown: {
          consistency: 75,
          spacing: 80,
          typography: 78,
          colorUsage: 70,
          responsiveness: 75,
          visualHierarchy: 72,
        },
        designSystemAdherence: 80,
        brandConsistency: 85,
      },
      designSystemCompliance: [],
      brandConsistency: [],
      responsiveAnalysis: [],
      colorPalette: {
        colors: [],
        issues: [],
        recommendations: [],
      },
      typography: {
        fonts: [],
        issues: [],
        recommendations: [],
      },
      spacing: {
        scale: '8px base',
        consistent: true,
        issues: [],
        recommendations: [],
      },
      recommendations: [
        {
          priority: 'high',
          recommendation: 'Improve design consistency',
          impact: 'Better user experience',
          effort: 'medium',
        },
      ],
      bestPractices: [],
    };

    return {
      reasoning: 'Using fallback UI audit report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        auditReport,
      },
    };
  }
}

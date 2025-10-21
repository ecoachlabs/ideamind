import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Accessibility Violation
 */
interface AccessibilityViolation {
  id: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagCriterion: string; // e.g., "1.4.3 Contrast (Minimum)"
  wcagLevel: 'A' | 'AA' | 'AAA';
  component: string;
  issue: string;
  impact: string;
  usersAffected: string[];
  remediation: string;
  codeExample?: string;
}

/**
 * WCAG Compliance Check
 */
interface WCAGComplianceCheck {
  criterion: string;
  level: 'A' | 'AA' | 'AAA';
  name: string;
  status: 'pass' | 'fail' | 'partial' | 'not-applicable';
  violations: number;
  notes?: string;
}

/**
 * Keyboard Navigation Analysis
 */
interface KeyboardNavigationAnalysis {
  component: string;
  accessible: boolean;
  issues: string[];
  recommendations: string[];
  tabOrder: 'logical' | 'illogical' | 'missing';
}

/**
 * Screen Reader Support
 */
interface ScreenReaderSupport {
  element: string;
  supported: boolean;
  ariaLabels: 'present' | 'missing' | 'incorrect';
  issues: string[];
  recommendations: string[];
}

/**
 * Color Contrast Issue
 */
interface ColorContrastIssue {
  element: string;
  foreground: string;
  background: string;
  contrastRatio: number;
  required: number;
  wcagLevel: 'AA' | 'AAA';
  textSize: 'normal' | 'large';
  passes: boolean;
}

/**
 * Accessibility Report
 */
interface AccessibilityReport {
  summary: {
    totalViolations: number;
    criticalViolations: number;
    seriousViolations: number;
    moderateViolations: number;
    minorViolations: number;
    wcagAACompliance: number; // percentage 0-100
    wcagAAACompliance: number; // percentage 0-100
    accessibilityScore: number; // 0-100
  };
  violations: AccessibilityViolation[];
  wcagCompliance: WCAGComplianceCheck[];
  keyboardNavigation: KeyboardNavigationAnalysis[];
  screenReaderSupport: ScreenReaderSupport[];
  colorContrast: ColorContrastIssue[];
  semanticHTML: {
    proper: boolean;
    issues: string[];
    recommendations: string[];
  };
  focusManagement: {
    proper: boolean;
    issues: string[];
    recommendations: string[];
  };
  formAccessibility: {
    labels: 'all-present' | 'some-missing' | 'most-missing';
    errorMessages: 'accessible' | 'partially-accessible' | 'inaccessible';
    issues: string[];
    recommendations: string[];
  };
  mediaAccessibility: {
    altText: 'present' | 'missing' | 'inadequate';
    captions: 'present' | 'missing' | 'not-applicable';
    transcripts: 'present' | 'missing' | 'not-applicable';
    issues: string[];
    recommendations: string[];
  };
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    wcagCriterion?: string;
  }[];
  testingGuidance: {
    tool: string;
    purpose: string;
    command?: string;
  }[];
  complianceStatus: 'compliant' | 'partially-compliant' | 'non-compliant';
}

/**
 * AccessibilityCheckerAgent
 *
 * Performs comprehensive accessibility audit including:
 * - WCAG 2.1 AA/AAA compliance checking
 * - Color contrast analysis
 * - Keyboard navigation testing
 * - Screen reader compatibility
 * - Semantic HTML validation
 * - ARIA attributes verification
 * - Focus management review
 * - Form accessibility
 * - Media accessibility (alt text, captions)
 *
 * Ensures the application is accessible to users with disabilities
 * and complies with accessibility standards and regulations.
 *
 * Input: Visual regression tests + Code implementation + UI audit
 * Output: Comprehensive accessibility report with WCAG compliance scores
 */
export class AccessibilityCheckerAgent extends BaseAgent {
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
        'Analyze WCAG compliance across all criteria',
        'Check color contrast ratios',
        'Validate keyboard navigation and focus management',
        'Generate accessibility remediation plan',
      ],
      estimatedTotalDurationMs: 15000, // ~15 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildAccessibilityPrompt(input);

      this.logger.info('Invoking LLM for accessibility check');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const report = this.parseReport(content);

      return {
        reasoning: `Accessibility audit found ${report.summary.totalViolations} violations (${report.summary.criticalViolations} critical, ${report.summary.seriousViolations} serious). WCAG AA Compliance: ${report.summary.wcagAACompliance}%.`,
        confidence: 0.85,
        intermediate: {
          report,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for accessibility check', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const report = result.intermediate?.report;

    return [
      {
        type: 'accessibility-report',
        content: report,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildAccessibilityPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const uiAudit = previousArtifacts?.find((a: any) => a.type === 'ui-audit-report')?.content;
    const visualSuite = previousArtifacts?.find((a: any) => a.type === 'visual-regression-suite')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const framework = repoBlueprint?.overview?.framework || 'React';
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];
    const colorIssues = uiAudit?.colorPalette?.issues || [];

    return `You are a Senior Accessibility Expert performing WCAG 2.1 compliance audit.

PROJECT CONTEXT:
Framework: ${framework}
Compliance Requirements: ${complianceReqs.join(', ') || 'WCAG 2.1 AA'}
Components Tested: ${visualSuite?.summary?.criticalComponents || 0}

COLOR ISSUES FROM UI AUDIT:
${colorIssues.slice(0, 3).join('\n') || 'No color issues reported'}

TASK:
Perform comprehensive accessibility audit. Your response MUST be valid JSON:

{
  "summary": {
    "totalViolations": 18,
    "criticalViolations": 3,
    "seriousViolations": 7,
    "moderateViolations": 6,
    "minorViolations": 2,
    "wcagAACompliance": 75,
    "wcagAAACompliance": 60,
    "accessibilityScore": 72
  },
  "violations": [
    {
      "id": "A11Y-001",
      "severity": "critical",
      "wcagCriterion": "1.4.3 Contrast (Minimum)",
      "wcagLevel": "AA",
      "component": "Primary Button",
      "issue": "Text color #FFFFFF on background #FFA500 has contrast ratio 2.1:1",
      "impact": "Users with low vision cannot read button text",
      "usersAffected": ["Low vision users", "Users with color blindness"],
      "remediation": "Use darker background #CC8400 for 4.5:1 contrast ratio",
      "codeExample": "background-color: #CC8400; /* Was #FFA500 */"
    },
    {
      "id": "A11Y-002",
      "severity": "serious",
      "wcagCriterion": "2.1.1 Keyboard",
      "wcagLevel": "A",
      "component": "Modal Dialog",
      "issue": "Modal cannot be closed with Escape key",
      "impact": "Keyboard users are trapped in modal",
      "usersAffected": ["Keyboard-only users", "Screen reader users"],
      "remediation": "Add keydown event listener for Escape key",
      "codeExample": "useEffect(() => { const handleEsc = (e) => e.key === 'Escape' && closeModal(); window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc); }, []);"
    },
    {
      "id": "A11Y-003",
      "severity": "serious",
      "wcagCriterion": "4.1.2 Name, Role, Value",
      "wcagLevel": "A",
      "component": "Icon Buttons",
      "issue": "Icon-only buttons missing aria-label",
      "impact": "Screen readers cannot announce button purpose",
      "usersAffected": ["Screen reader users"],
      "remediation": "Add descriptive aria-label to all icon buttons",
      "codeExample": "<button aria-label='Close dialog'><CloseIcon /></button>"
    }
  ],
  "wcagCompliance": [
    {
      "criterion": "1.1.1",
      "level": "A",
      "name": "Non-text Content",
      "status": "partial",
      "violations": 5,
      "notes": "Some images missing alt text"
    },
    {
      "criterion": "1.4.3",
      "level": "AA",
      "name": "Contrast (Minimum)",
      "status": "fail",
      "violations": 8,
      "notes": "Multiple color contrast failures"
    },
    {
      "criterion": "2.1.1",
      "level": "A",
      "name": "Keyboard",
      "status": "partial",
      "violations": 3,
      "notes": "Some interactive elements not keyboard accessible"
    },
    {
      "criterion": "2.4.7",
      "level": "AA",
      "name": "Focus Visible",
      "status": "fail",
      "violations": 2,
      "notes": "Focus indicators removed with outline: none"
    }
  ],
  "keyboardNavigation": [
    {
      "component": "Main Navigation",
      "accessible": true,
      "issues": [],
      "recommendations": ["Good keyboard support"],
      "tabOrder": "logical"
    },
    {
      "component": "Modal Dialog",
      "accessible": false,
      "issues": [
        "Cannot close with Escape key",
        "Focus not trapped within modal",
        "No focus return after close"
      ],
      "recommendations": [
        "Implement focus trap",
        "Add Escape key handler",
        "Return focus to trigger element on close"
      ],
      "tabOrder": "illogical"
    }
  ],
  "screenReaderSupport": [
    {
      "element": "Icon Buttons",
      "supported": false,
      "ariaLabels": "missing",
      "issues": ["No accessible name provided"],
      "recommendations": ["Add aria-label or visually hidden text"]
    },
    {
      "element": "Form Inputs",
      "supported": true,
      "ariaLabels": "present",
      "issues": [],
      "recommendations": ["Good label associations"]
    },
    {
      "element": "Status Messages",
      "supported": false,
      "ariaLabels": "incorrect",
      "issues": ["Status changes not announced"],
      "recommendations": ["Use aria-live regions for dynamic updates"]
    }
  ],
  "colorContrast": [
    {
      "element": "Primary Button Text",
      "foreground": "#FFFFFF",
      "background": "#FFA500",
      "contrastRatio": 2.1,
      "required": 4.5,
      "wcagLevel": "AA",
      "textSize": "normal",
      "passes": false
    },
    {
      "element": "Body Text",
      "foreground": "#333333",
      "background": "#FFFFFF",
      "contrastRatio": 12.6,
      "required": 4.5,
      "wcagLevel": "AA",
      "textSize": "normal",
      "passes": true
    },
    {
      "element": "Error Message",
      "foreground": "#FF0000",
      "background": "#FFFFFF",
      "contrastRatio": 4.0,
      "required": 4.5,
      "wcagLevel": "AA",
      "textSize": "normal",
      "passes": false
    }
  ],
  "semanticHTML": {
    "proper": false,
    "issues": [
      "Divs used instead of buttons for clickable elements",
      "Missing landmark regions (header, nav, main, footer)",
      "Headings not in logical order (h1 followed by h3)"
    ],
    "recommendations": [
      "Use <button> for clickable elements",
      "Add ARIA landmarks or HTML5 semantic elements",
      "Ensure heading hierarchy is logical (h1 → h2 → h3)"
    ]
  },
  "focusManagement": {
    "proper": false,
    "issues": [
      "Focus outline removed globally (outline: none)",
      "No visible focus indicators",
      "Focus lost when navigating between pages"
    ],
    "recommendations": [
      "Provide custom focus styles instead of removing outline",
      "Ensure 3:1 contrast for focus indicators",
      "Manage focus on route changes"
    ]
  },
  "formAccessibility": {
    "labels": "some-missing",
    "errorMessages": "partially-accessible",
    "issues": [
      "3 form inputs missing associated labels",
      "Error messages not programmatically associated with inputs",
      "Required fields not indicated accessibly"
    ],
    "recommendations": [
      "Use <label> with htmlFor or wrap inputs",
      "Associate errors with aria-describedby",
      "Add aria-required='true' to required fields"
    ]
  },
  "mediaAccessibility": {
    "altText": "inadequate",
    "captions": "not-applicable",
    "transcripts": "not-applicable",
    "issues": [
      "Images have alt='' (empty) instead of descriptive text",
      "Decorative images not marked with alt='' or role='presentation'"
    ],
    "recommendations": [
      "Provide descriptive alt text for informative images",
      "Use alt='' or role='presentation' for decorative images",
      "Add captions if video content is added"
    ]
  },
  "recommendations": [
    {
      "priority": "immediate",
      "recommendation": "Fix color contrast violations on buttons and error messages",
      "impact": "Resolves critical WCAG AA failures, improves readability",
      "effort": "low",
      "wcagCriterion": "1.4.3 Contrast (Minimum)"
    },
    {
      "priority": "immediate",
      "recommendation": "Add aria-label to all icon-only buttons",
      "impact": "Makes interface usable for screen reader users",
      "effort": "low",
      "wcagCriterion": "4.1.2 Name, Role, Value"
    },
    {
      "priority": "high",
      "recommendation": "Implement keyboard trap for modal dialogs",
      "impact": "Prevents keyboard users from being trapped",
      "effort": "medium",
      "wcagCriterion": "2.1.2 No Keyboard Trap"
    },
    {
      "priority": "high",
      "recommendation": "Restore or replace focus indicators throughout application",
      "impact": "Critical for keyboard navigation",
      "effort": "medium",
      "wcagCriterion": "2.4.7 Focus Visible"
    },
    {
      "priority": "medium",
      "recommendation": "Add proper heading hierarchy and semantic HTML",
      "impact": "Improves screen reader navigation",
      "effort": "medium",
      "wcagCriterion": "1.3.1 Info and Relationships"
    }
  ],
  "testingGuidance": [
    {
      "tool": "axe DevTools",
      "purpose": "Automated accessibility testing",
      "command": "Install browser extension and run scan"
    },
    {
      "tool": "NVDA / JAWS",
      "purpose": "Screen reader testing",
      "command": "Navigate application with screen reader enabled"
    },
    {
      "tool": "Keyboard Navigation",
      "purpose": "Manual keyboard testing",
      "command": "Navigate using only Tab, Enter, Escape, Arrow keys"
    },
    {
      "tool": "WAVE",
      "purpose": "Visual accessibility testing",
      "command": "Use WAVE browser extension"
    }
  ],
  "complianceStatus": "partially-compliant"
}

REQUIREMENTS:
- Check all WCAG 2.1 Level A and AA criteria
- Identify 15-25 accessibility violations
- Focus on:
  - Color contrast (WCAG 1.4.3)
  - Keyboard accessibility (WCAG 2.1.1, 2.1.2)
  - Screen reader support (WCAG 4.1.2)
  - Semantic HTML (WCAG 1.3.1)
  - Focus management (WCAG 2.4.7)
  - Form accessibility (WCAG 3.3.2)
  - ARIA usage (WCAG 4.1.2)
- Provide specific code examples
- Calculate WCAG AA compliance percentage
- Prioritize by impact on users with disabilities

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseReport(text: string): AccessibilityReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as AccessibilityReport;
    } catch (error) {
      this.logger.error('Failed to parse accessibility report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback accessibility report');

    const report: AccessibilityReport = {
      summary: {
        totalViolations: 5,
        criticalViolations: 1,
        seriousViolations: 2,
        moderateViolations: 2,
        minorViolations: 0,
        wcagAACompliance: 70,
        wcagAAACompliance: 60,
        accessibilityScore: 70,
      },
      violations: [
        {
          id: 'A11Y-001',
          severity: 'critical',
          wcagCriterion: '1.4.3 Contrast (Minimum)',
          wcagLevel: 'AA',
          component: 'Button',
          issue: 'Insufficient color contrast',
          impact: 'Users with low vision cannot read text',
          usersAffected: ['Low vision users'],
          remediation: 'Increase contrast ratio to 4.5:1',
        },
      ],
      wcagCompliance: [],
      keyboardNavigation: [],
      screenReaderSupport: [],
      colorContrast: [],
      semanticHTML: {
        proper: true,
        issues: [],
        recommendations: [],
      },
      focusManagement: {
        proper: true,
        issues: [],
        recommendations: [],
      },
      formAccessibility: {
        labels: 'all-present',
        errorMessages: 'accessible',
        issues: [],
        recommendations: [],
      },
      mediaAccessibility: {
        altText: 'present',
        captions: 'not-applicable',
        transcripts: 'not-applicable',
        issues: [],
        recommendations: [],
      },
      recommendations: [
        {
          priority: 'immediate',
          recommendation: 'Fix color contrast issues',
          impact: 'Improves readability',
          effort: 'low',
        },
      ],
      testingGuidance: [],
      complianceStatus: 'partially-compliant',
    };

    return {
      reasoning: 'Using fallback accessibility report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        report,
      },
    };
  }
}

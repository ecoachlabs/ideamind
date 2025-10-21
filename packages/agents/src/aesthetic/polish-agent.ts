import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Polish Issue
 */
interface PolishIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'animation' | 'transition' | 'loading' | 'empty-state' | 'error-state' | 'microinteraction' | 'performance';
  component: string;
  issue: string;
  recommendation: string;
  impact: string;
  userExperience: 'excellent' | 'good' | 'poor' | 'broken';
  codeExample?: string;
}

/**
 * Animation Analysis
 */
interface AnimationAnalysis {
  animationType: string;
  component: string;
  duration: number; // milliseconds
  easing: string;
  performanceImpact: 'low' | 'medium' | 'high';
  issues: string[];
  recommendations: string[];
  optimized: boolean;
}

/**
 * Micro-interaction Detail
 */
interface MicroInteraction {
  interaction: string;
  component: string;
  trigger: string;
  feedback: string;
  quality: 'excellent' | 'good' | 'adequate' | 'missing';
  delightFactor: number; // 0-100
  recommendations: string[];
}

/**
 * Loading State Analysis
 */
interface LoadingStateAnalysis {
  component: string;
  hasLoadingState: boolean;
  loadingType: 'spinner' | 'skeleton' | 'progress-bar' | 'placeholder' | 'none';
  appropriateForContext: boolean;
  issues: string[];
  recommendations: string[];
  userPerception: 'fast' | 'acceptable' | 'slow';
}

/**
 * Empty State Analysis
 */
interface EmptyStateAnalysis {
  screen: string;
  hasEmptyState: boolean;
  illustration: boolean;
  messaging: { clear: boolean; actionable: boolean; friendly: boolean };
  callToAction: boolean;
  issues: string[];
  recommendations: string[];
  quality: 'excellent' | 'good' | 'poor' | 'missing';
}

/**
 * Error State Analysis
 */
interface ErrorStateAnalysis {
  errorType: string;
  component: string;
  hasErrorState: boolean;
  messaging: { clear: boolean; helpful: boolean; friendly: boolean };
  recoveryOptions: boolean;
  issues: string[];
  recommendations: string[];
  userFriendliness: number; // 0-100
}

/**
 * Transition Analysis
 */
interface TransitionAnalysis {
  transition: string;
  fromState: string;
  toState: string;
  smoothness: number; // 0-100
  duration: number;
  issues: string[];
  recommendations: string[];
  jarring: boolean;
}

/**
 * Delight Factor Assessment
 */
interface DelightFactorAssessment {
  element: string;
  delightType: 'animation' | 'interaction' | 'visual' | 'copy' | 'easter-egg';
  impact: 'high' | 'medium' | 'low';
  appropriate: boolean;
  overused: boolean;
  recommendations: string[];
}

/**
 * Polish Quality Metrics
 */
interface PolishQualityMetrics {
  overallScore: number; // 0-100
  breakdown: {
    animations: number;
    transitions: number;
    loadingStates: number;
    emptyStates: number;
    errorStates: number;
    microInteractions: number;
    delightFactor: number;
    performance: number;
  };
  userExperienceScore: number; // 0-100
  professionalPolish: number; // 0-100
}

/**
 * Polish Report
 */
interface PolishReport {
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    polishScore: number; // 0-100
    delightScore: number; // 0-100
  };
  issues: PolishIssue[];
  qualityMetrics: PolishQualityMetrics;
  animations: AnimationAnalysis[];
  microInteractions: MicroInteraction[];
  loadingStates: LoadingStateAnalysis[];
  emptyStates: EmptyStateAnalysis[];
  errorStates: ErrorStateAnalysis[];
  transitions: TransitionAnalysis[];
  delightFactors: DelightFactorAssessment[];
  performance: {
    animationPerformance: number; // 0-100
    fps: number;
    jank: boolean;
    issues: string[];
    recommendations: string[];
  };
  crossBrowser: {
    compatible: boolean;
    issues: string[];
    fallbacks: string[];
    recommendations: string[];
  };
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    delightValue: number; // 0-100
  }[];
  bestPractices: {
    practice: string;
    followed: boolean;
    notes?: string;
  }[];
}

/**
 * PolishAgent
 *
 * Evaluates UI polish and refinement including:
 * - Micro-interactions and animations
 * - Transition smoothness and quality
 * - Loading states and skeleton screens
 * - Empty states and zero-data experiences
 * - Error states and user-friendly messaging
 * - Delight factors and attention to detail
 * - Animation performance optimization
 * - Cross-browser animation compatibility
 *
 * Provides actionable recommendations for elevating the user experience
 * from functional to delightful.
 *
 * Input: UI audit + Accessibility report + Visual regression tests
 * Output: Comprehensive polish report with refinement recommendations
 */
export class PolishAgent extends BaseAgent {
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
        'Analyze animations and transitions',
        'Evaluate loading and empty states',
        'Assess micro-interactions and delight factors',
        'Generate polish recommendations',
      ],
      estimatedTotalDurationMs: 13000, // ~13 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildPolishPrompt(input);

      this.logger.info('Invoking LLM for polish analysis');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const polishReport = this.parsePolishReport(content);

      return {
        reasoning: `Polish analysis identified ${polishReport.summary.totalIssues} refinement opportunities (${polishReport.summary.criticalIssues} critical, ${polishReport.summary.highIssues} high). Polish Score: ${polishReport.summary.polishScore}/100, Delight Score: ${polishReport.summary.delightScore}/100.`,
        confidence: 0.85,
        intermediate: {
          polishReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for polish analysis', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const polishReport = result.intermediate?.polishReport;

    return [
      {
        type: 'polish-report',
        content: polishReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildPolishPrompt(input: any): string {
    const { previousArtifacts } = input;

    // Extract context
    const uiAudit = previousArtifacts?.find((a: any) => a.type === 'ui-audit-report')?.content;
    const accessibilityReport = previousArtifacts?.find((a: any) => a.type === 'accessibility-report')?.content;
    const visualSuite = previousArtifacts?.find((a: any) => a.type === 'visual-regression-suite')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const framework = repoBlueprint?.overview?.framework || 'React';
    const totalComponents = visualSuite?.summary?.criticalComponents || 0;
    const uiQualityScore = uiAudit?.summary?.uiQualityScore || 0;

    return `You are a Senior Product Designer specializing in UI polish and micro-interactions.

PROJECT CONTEXT:
Framework: ${framework}
Total Components: ${totalComponents}
UI Quality Score: ${uiQualityScore}/100
Visual Tests: ${visualSuite?.summary?.totalScenarios || 0} scenarios

UI AUDIT SUMMARY:
${uiAudit?.issues?.slice(0, 3).map((i: any) => `
- ${i.component}: ${i.issue} (${i.severity})
`).join('\\n') || 'No UI issues available'}

ACCESSIBILITY SUMMARY:
WCAG AA Compliance: ${accessibilityReport?.summary?.wcagAACompliance || 0}%
Critical Violations: ${accessibilityReport?.summary?.criticalViolations || 0}

TASK:
Perform comprehensive UI polish analysis. Your response MUST be valid JSON:

{
  "summary": {
    "totalIssues": 12,
    "criticalIssues": 1,
    "highIssues": 4,
    "mediumIssues": 5,
    "lowIssues": 2,
    "polishScore": 72,
    "delightScore": 65
  },
  "issues": [
    {
      "id": "POLISH-001",
      "severity": "high",
      "category": "animation",
      "component": "Modal",
      "issue": "Modal enter/exit lacks smooth animation, appears instantly",
      "recommendation": "Add fade + scale animation with 200ms duration and ease-out timing",
      "impact": "Jarring experience, feels unpolished and abrupt",
      "userExperience": "poor",
      "codeExample": "transition: opacity 200ms ease-out, transform 200ms ease-out;"
    },
    {
      "id": "POLISH-002",
      "severity": "medium",
      "category": "loading",
      "component": "Product List",
      "issue": "No skeleton loader, shows blank screen during data fetch",
      "recommendation": "Implement skeleton screen with shimmer animation",
      "impact": "Users uncertain if app is working, perceived performance suffers",
      "userExperience": "poor"
    },
    {
      "id": "POLISH-003",
      "severity": "critical",
      "category": "error-state",
      "component": "Form Validation",
      "issue": "Error messages appear without animation, no visual feedback on submit",
      "recommendation": "Add shake animation on error + smooth fade-in for messages",
      "impact": "Users miss error feedback, submit repeatedly",
      "userExperience": "broken",
      "codeExample": "@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } }"
    }
  ],
  "qualityMetrics": {
    "overallScore": 72,
    "breakdown": {
      "animations": 65,
      "transitions": 70,
      "loadingStates": 60,
      "emptyStates": 75,
      "errorStates": 55,
      "microInteractions": 80,
      "delightFactor": 65,
      "performance": 85
    },
    "userExperienceScore": 70,
    "professionalPolish": 68
  },
  "animations": [
    {
      "animationType": "Modal entrance",
      "component": "Dialog",
      "duration": 0,
      "easing": "none",
      "performanceImpact": "low",
      "issues": ["No animation defined", "Instant appearance"],
      "recommendations": [
        "Add opacity + scale animation (0.95 to 1.0)",
        "Use 200ms duration with ease-out easing",
        "Consider backdrop blur transition"
      ],
      "optimized": false
    },
    {
      "animationType": "Button hover",
      "component": "Primary Button",
      "duration": 300,
      "easing": "ease",
      "performanceImpact": "low",
      "issues": ["Duration too long for hover feedback"],
      "recommendations": ["Reduce to 150ms for snappier feel"],
      "optimized": false
    }
  ],
  "microInteractions": [
    {
      "interaction": "Button click feedback",
      "component": "CTA Button",
      "trigger": "click",
      "feedback": "Scale down slightly (0.98)",
      "quality": "good",
      "delightFactor": 75,
      "recommendations": ["Add haptic feedback on mobile", "Consider ripple effect"]
    },
    {
      "interaction": "Input focus",
      "component": "Text Input",
      "trigger": "focus",
      "feedback": "Border color change only",
      "quality": "adequate",
      "delightFactor": 50,
      "recommendations": [
        "Add subtle shadow transition",
        "Animate label position for floating label effect"
      ]
    },
    {
      "interaction": "Card hover",
      "component": "Product Card",
      "trigger": "hover",
      "feedback": "None",
      "quality": "missing",
      "delightFactor": 0,
      "recommendations": [
        "Add subtle lift effect (translateY(-4px))",
        "Increase shadow on hover",
        "200ms ease-out transition"
      ]
    }
  ],
  "loadingStates": [
    {
      "component": "Dashboard",
      "hasLoadingState": true,
      "loadingType": "spinner",
      "appropriateForContext": false,
      "issues": ["Generic spinner not ideal for content-heavy dashboard"],
      "recommendations": [
        "Replace with skeleton screen matching layout",
        "Add shimmer animation for perceived performance"
      ],
      "userPerception": "slow"
    },
    {
      "component": "Button (form submit)",
      "hasLoadingState": true,
      "loadingType": "spinner",
      "appropriateForContext": true,
      "issues": [],
      "recommendations": ["Consider adding success checkmark animation"],
      "userPerception": "acceptable"
    },
    {
      "component": "Image Gallery",
      "hasLoadingState": false,
      "loadingType": "none",
      "appropriateForContext": false,
      "issues": ["Images pop in suddenly", "No placeholder"],
      "recommendations": [
        "Add blurred placeholder images",
        "Progressive image loading",
        "Fade-in animation when loaded"
      ],
      "userPerception": "slow"
    }
  ],
  "emptyStates": [
    {
      "screen": "Shopping Cart",
      "hasEmptyState": true,
      "illustration": true,
      "messaging": {
        "clear": true,
        "actionable": true,
        "friendly": true
      },
      "callToAction": true,
      "issues": [],
      "recommendations": ["Consider animated illustration for delight"],
      "quality": "excellent"
    },
    {
      "screen": "Search Results",
      "hasEmptyState": true,
      "illustration": false,
      "messaging": {
        "clear": true,
        "actionable": false,
        "friendly": false
      },
      "callToAction": false,
      "issues": ["Generic 'No results' message", "No suggested actions"],
      "recommendations": [
        "Add illustration (magnifying glass)",
        "Suggest search tips or popular items",
        "Include CTA to browse all products"
      ],
      "quality": "poor"
    }
  ],
  "errorStates": [
    {
      "errorType": "Form validation error",
      "component": "Login Form",
      "hasErrorState": true,
      "messaging": {
        "clear": true,
        "helpful": false,
        "friendly": false
      },
      "recoveryOptions": false,
      "issues": ["Technical error messages", "No recovery guidance"],
      "recommendations": [
        "Use friendly language: 'Hmm, we couldn't find that email'",
        "Add 'Forgot password?' link on error",
        "Shake animation to draw attention"
      ],
      "userFriendliness": 45
    },
    {
      "errorType": "Network error",
      "component": "API call",
      "hasErrorState": false,
      "messaging": {
        "clear": false,
        "helpful": false,
        "friendly": false
      },
      "recoveryOptions": false,
      "issues": ["No error handling", "Silent failure"],
      "recommendations": [
        "Add toast notification for network errors",
        "Provide retry button",
        "Cache last successful state"
      ],
      "userFriendliness": 10
    }
  ],
  "transitions": [
    {
      "transition": "Page navigation",
      "fromState": "Home",
      "toState": "Product Details",
      "smoothness": 40,
      "duration": 0,
      "issues": ["Hard page reload", "No transition between views"],
      "recommendations": [
        "Implement route transitions with fade",
        "Consider shared element transitions",
        "300ms crossfade between pages"
      ],
      "jarring": true
    },
    {
      "transition": "Tab switching",
      "fromState": "Tab 1",
      "toState": "Tab 2",
      "smoothness": 80,
      "duration": 200,
      "issues": [],
      "recommendations": ["Consider slide animation for spatial context"],
      "jarring": false
    }
  ],
  "delightFactors": [
    {
      "element": "Success confetti",
      "delightType": "animation",
      "impact": "high",
      "appropriate": true,
      "overused": false,
      "recommendations": ["Excellent! Keep for purchase completion"]
    },
    {
      "element": "Loading spinner with jokes",
      "delightType": "copy",
      "impact": "medium",
      "appropriate": true,
      "overused": false,
      "recommendations": ["Great humanizing touch, rotate messages"]
    },
    {
      "element": "Button hover bounce",
      "delightType": "animation",
      "impact": "low",
      "appropriate": false,
      "overused": true,
      "recommendations": ["Too bouncy, use subtle scale instead"]
    }
  ],
  "performance": {
    "animationPerformance": 75,
    "fps": 58,
    "jank": true,
    "issues": [
      "Some animations drop below 60fps on lower-end devices",
      "Shadow transitions cause paint operations"
    ],
    "recommendations": [
      "Use transform and opacity only for animations (GPU accelerated)",
      "Replace box-shadow transitions with pseudo-element opacity",
      "Add will-change hint for frequently animated elements",
      "Consider prefers-reduced-motion media query"
    ]
  },
  "crossBrowser": {
    "compatible": false,
    "issues": [
      "backdrop-filter not supported in Firefox",
      "CSS Grid animations janky in Safari"
    ],
    "fallbacks": [
      "Provide solid background fallback for backdrop-filter",
      "Use flexbox for Safari animation performance"
    ],
    "recommendations": [
      "Test on Safari, Firefox, Chrome, Edge",
      "Add @supports queries for progressive enhancement",
      "Provide graceful degradation for older browsers"
    ]
  },
  "recommendations": [
    {
      "priority": "immediate",
      "recommendation": "Fix critical error state animations for form validation",
      "impact": "Users currently missing error feedback, causing confusion",
      "effort": "low",
      "delightValue": 85
    },
    {
      "priority": "high",
      "recommendation": "Add skeleton screens for all loading states",
      "impact": "Significantly improves perceived performance",
      "effort": "medium",
      "delightValue": 80
    },
    {
      "priority": "high",
      "recommendation": "Implement smooth page transitions",
      "impact": "Eliminates jarring navigation experience",
      "effort": "medium",
      "delightValue": 75
    },
    {
      "priority": "medium",
      "recommendation": "Add micro-interactions to interactive elements (cards, buttons)",
      "impact": "Increases polish and professional feel",
      "effort": "low",
      "delightValue": 70
    },
    {
      "priority": "medium",
      "recommendation": "Optimize animation performance for GPU acceleration",
      "impact": "Ensures smooth 60fps animations on all devices",
      "effort": "low",
      "delightValue": 60
    }
  ],
  "bestPractices": [
    {
      "practice": "60fps animation performance",
      "followed": false,
      "notes": "Some animations drop to 58fps, causing jank"
    },
    {
      "practice": "Skeleton screens for loading states",
      "followed": false,
      "notes": "Most components use generic spinners"
    },
    {
      "practice": "Smooth page transitions",
      "followed": false,
      "notes": "Hard page reloads, no transition animations"
    },
    {
      "practice": "Error state animations for feedback",
      "followed": false,
      "notes": "Errors appear without animation"
    },
    {
      "practice": "GPU-accelerated animations (transform/opacity)",
      "followed": false,
      "notes": "Using box-shadow and other paint properties"
    },
    {
      "practice": "Prefers-reduced-motion support",
      "followed": false,
      "notes": "No accessibility consideration for motion sensitivity"
    },
    {
      "practice": "Meaningful micro-interactions",
      "followed": true,
      "notes": "Good button feedback, could expand to more elements"
    },
    {
      "practice": "Delight factors without overuse",
      "followed": true,
      "notes": "Appropriate use of confetti and friendly copy"
    }
  ]
}

REQUIREMENTS:
- Identify 10-20 polish opportunities across all categories
- Focus on:
  - Animation quality and smoothness
  - Loading states (skeleton vs spinner)
  - Empty state design and messaging
  - Error state user-friendliness
  - Micro-interactions and feedback
  - Transition smoothness
  - Delight factors and personality
  - Animation performance (60fps target)
  - Cross-browser compatibility
- Provide specific, actionable recommendations with code examples
- Score each area 0-100
- Prioritize high-impact, low-effort improvements
- Consider performance implications

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parsePolishReport(text: string): PolishReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as PolishReport;
    } catch (error) {
      this.logger.error('Failed to parse polish report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback polish report');

    const polishReport: PolishReport = {
      summary: {
        totalIssues: 5,
        criticalIssues: 0,
        highIssues: 2,
        mediumIssues: 3,
        lowIssues: 0,
        polishScore: 70,
        delightScore: 65,
      },
      issues: [
        {
          id: 'POLISH-001',
          severity: 'high',
          category: 'loading',
          component: 'Content Area',
          issue: 'Missing loading states',
          recommendation: 'Add skeleton screens',
          impact: 'Poor perceived performance',
          userExperience: 'poor',
        },
      ],
      qualityMetrics: {
        overallScore: 70,
        breakdown: {
          animations: 70,
          transitions: 65,
          loadingStates: 60,
          emptyStates: 75,
          errorStates: 65,
          microInteractions: 75,
          delightFactor: 65,
          performance: 80,
        },
        userExperienceScore: 70,
        professionalPolish: 68,
      },
      animations: [],
      microInteractions: [],
      loadingStates: [],
      emptyStates: [],
      errorStates: [],
      transitions: [],
      delightFactors: [],
      performance: {
        animationPerformance: 80,
        fps: 60,
        jank: false,
        issues: [],
        recommendations: [],
      },
      crossBrowser: {
        compatible: true,
        issues: [],
        fallbacks: [],
        recommendations: [],
      },
      recommendations: [
        {
          priority: 'high',
          recommendation: 'Add skeleton screens for loading states',
          impact: 'Improves perceived performance',
          effort: 'medium',
          delightValue: 75,
        },
      ],
      bestPractices: [],
    };

    return {
      reasoning: 'Using fallback polish report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        polishReport,
      },
    };
  }
}

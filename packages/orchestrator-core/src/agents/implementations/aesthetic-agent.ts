import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * AestheticAgent - UX/UI review and design guidelines
 *
 * Provides comprehensive UX/UI analysis covering:
 * - User experience evaluation
 * - Visual design review
 * - Accessibility compliance
 * - Design system recommendations
 * - Interaction patterns
 * - Responsive design guidelines
 */
export class AestheticAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('AestheticAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: true,
      supportsCheckpointing: true,
      maxInputSize: 70000,
      maxOutputSize: 90000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Aesthetic Agent');

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

      const aestheticReview = this.parseJSON(text);

      return {
        success: true,
        output: aestheticReview,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          ux_issues_count: aestheticReview.ux_issues?.length || 0,
          accessibility_issues_count: aestheticReview.accessibility_issues?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Aesthetic Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are an Aesthetic Agent that reviews UX/UI design and provides recommendations.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Provide comprehensive UX/UI analysis and design recommendations.

Evaluate:
1. **User Experience**: Overall UX quality and user journey
2. **Visual Design**: Aesthetics, consistency, visual hierarchy
3. **Accessibility**: WCAG compliance and inclusive design
4. **Design System**: Component library and design tokens
5. **Interaction Design**: Microinteractions and user feedback
6. **Responsive Design**: Mobile, tablet, desktop optimization
7. **Performance UX**: Perceived performance and loading states
8. **Content Design**: Microcopy, tone of voice, information architecture
9. **Design Patterns**: Use of established patterns and conventions
10. **Brand Alignment**: Consistency with brand guidelines

Output as JSON:
{
  "overall_assessment": {
    "ux_score": 8,
    "design_score": 7,
    "accessibility_score": 6,
    "overall_rating": "good",
    "summary": "Overall assessment summary",
    "key_strengths": ["strength1", "strength2"],
    "key_weaknesses": ["weakness1", "weakness2"]
  },
  "user_experience": {
    "score": 8,
    "user_flows": [
      {
        "flow": "User registration flow",
        "rating": "excellent|good|fair|poor",
        "friction_points": ["Friction point description"],
        "recommendations": ["Recommendation"]
      }
    ],
    "navigation": {
      "rating": "intuitive|moderate|confusing",
      "issues": ["Navigation issue"],
      "recommendations": ["Use breadcrumbs", "Add search"]
    },
    "information_architecture": {
      "rating": "clear|moderate|unclear",
      "structure": "How content is organized",
      "improvements": ["Improvement suggestion"]
    },
    "user_feedback": {
      "error_messages": "Quality of error messages",
      "success_feedback": "Quality of success feedback",
      "loading_states": "Quality of loading indicators",
      "recommendations": ["Be more specific in error messages"]
    }
  },
  "visual_design": {
    "score": 7,
    "color_scheme": {
      "rating": "harmonious|adequate|discordant",
      "primary_colors": ["#3B82F6", "#10B981"],
      "contrast_issues": ["Issue description"],
      "recommendations": ["Use color contrast checker"]
    },
    "typography": {
      "rating": "excellent|good|poor",
      "font_families": ["Inter", "Roboto"],
      "hierarchy": "Clear|Moderate|Unclear",
      "readability": "Excellent|Good|Poor",
      "issues": ["Font size too small on mobile"],
      "recommendations": ["Increase base font size to 16px"]
    },
    "spacing_rhythm": {
      "rating": "consistent|moderate|inconsistent",
      "issues": ["Inconsistent padding in cards"],
      "recommendations": ["Use 8px grid system"]
    },
    "visual_hierarchy": {
      "rating": "clear|moderate|unclear",
      "issues": ["CTAs don't stand out enough"],
      "recommendations": ["Increase button size and contrast"]
    },
    "imagery": {
      "quality": "high|medium|low",
      "consistency": "consistent|moderate|inconsistent",
      "recommendations": ["Use consistent illustration style"]
    }
  },
  "accessibility": {
    "score": 6,
    "wcag_level": "A|AA|AAA",
    "target_level": "AA",
    "issues": [
      {
        "severity": "critical|high|medium|low",
        "wcag_criterion": "1.4.3 Contrast (Minimum)",
        "issue": "Text contrast ratio below 4.5:1",
        "affected_areas": ["Button text", "Secondary nav"],
        "remediation": "Increase text color contrast",
        "priority": 1
      }
    ],
    "keyboard_navigation": {
      "supported": true,
      "issues": ["Modal cannot be closed with Escape"],
      "recommendations": ["Add keyboard handlers for all interactions"]
    },
    "screen_reader": {
      "supported": true,
      "issues": ["Images missing alt text"],
      "recommendations": ["Add descriptive alt text to all images"]
    },
    "focus_management": {
      "rating": "good|fair|poor",
      "issues": ["Focus indicator not visible"],
      "recommendations": ["Add prominent focus outline"]
    },
    "semantic_html": {
      "rating": "good|fair|poor",
      "issues": ["Using divs instead of buttons"],
      "recommendations": ["Use semantic HTML elements"]
    },
    "aria_labels": {
      "coverage": "complete|partial|missing",
      "issues": ["Icon buttons missing aria-labels"],
      "recommendations": ["Add aria-label to all icon buttons"]
    }
  },
  "design_system": {
    "exists": true,
    "completeness": "comprehensive|partial|minimal",
    "components": [
      {
        "component": "Button",
        "variants": ["primary", "secondary", "ghost"],
        "states": ["default", "hover", "active", "disabled"],
        "documented": true,
        "code_examples": true,
        "accessibility_notes": true
      }
    ],
    "design_tokens": {
      "colors": {
        "defined": true,
        "count": 20,
        "naming": "semantic|descriptive",
        "usage": "Consistent use of tokens"
      },
      "spacing": {
        "system": "8px grid",
        "scale": ["4px", "8px", "16px", "24px", "32px", "48px", "64px"]
      },
      "typography": {
        "scale": "Modular scale 1.25",
        "sizes": ["12px", "14px", "16px", "20px", "24px", "32px", "48px"]
      }
    },
    "recommendations": [
      "Document all component variants",
      "Add Storybook for component library",
      "Create Figma library matching code components"
    ]
  },
  "interaction_design": {
    "score": 7,
    "microinteractions": [
      {
        "interaction": "Button hover",
        "quality": "good|adequate|poor",
        "feedback": "Visual feedback present",
        "timing": "Appropriate",
        "recommendations": ["Add subtle scale transform"]
      }
    ],
    "animations": {
      "usage": "appropriate|excessive|minimal",
      "performance": "Smooth and performant",
      "accessibility": "Respects prefers-reduced-motion",
      "recommendations": ["Add loading skeleton animations"]
    },
    "transitions": {
      "consistency": "consistent|moderate|inconsistent",
      "timing": "250ms ease-in-out",
      "recommendations": ["Standardize transition timing"]
    },
    "haptic_feedback": {
      "implemented": false,
      "recommendations": ["Add haptic feedback for mobile interactions"]
    }
  },
  "responsive_design": {
    "score": 7,
    "breakpoints": ["mobile: 375px", "tablet: 768px", "desktop: 1024px", "wide: 1440px"],
    "mobile": {
      "rating": "excellent|good|fair|poor",
      "issues": ["Navigation menu hard to use"],
      "recommendations": ["Implement hamburger menu"]
    },
    "tablet": {
      "rating": "excellent|good|fair|poor",
      "issues": ["Wasted space in grid layout"],
      "recommendations": ["Optimize grid for tablet viewport"]
    },
    "desktop": {
      "rating": "excellent|good|fair|poor",
      "issues": ["Content too wide on large screens"],
      "recommendations": ["Add max-width container"]
    },
    "touch_targets": {
      "size": "Minimum 44x44px",
      "issues": ["Some buttons too small on mobile"],
      "recommendations": ["Increase touch target size"]
    }
  },
  "performance_ux": {
    "perceived_performance": {
      "rating": "fast|moderate|slow",
      "loading_indicators": "Present and informative",
      "skeleton_screens": "Used appropriately",
      "recommendations": ["Add optimistic UI updates"]
    },
    "progressive_disclosure": {
      "used": true,
      "effectiveness": "good",
      "recommendations": ["Load critical content first"]
    },
    "lazy_loading": {
      "implemented": true,
      "images": "Lazy loaded",
      "components": "Code-split",
      "recommendations": ["Add blur-up image loading"]
    }
  },
  "content_design": {
    "score": 7,
    "microcopy": {
      "quality": "clear|moderate|unclear",
      "tone": "friendly|professional|technical",
      "consistency": "consistent|moderate|inconsistent",
      "examples": [
        {
          "context": "Empty state",
          "current": "No items",
          "recommended": "You haven't created any items yet. Click 'Create' to get started!",
          "rationale": "More helpful and actionable"
        }
      ]
    },
    "error_messages": {
      "quality": "helpful|adequate|poor",
      "actionable": "Tells user how to fix",
      "examples": [
        {
          "context": "Form validation",
          "current": "Invalid input",
          "recommended": "Email must include @ symbol",
          "rationale": "Specific and actionable"
        }
      ]
    },
    "tone_of_voice": {
      "consistency": "consistent|moderate|inconsistent",
      "brand_alignment": "strong|moderate|weak",
      "recommendations": ["Create content style guide"]
    }
  },
  "design_patterns": {
    "score": 8,
    "patterns_used": [
      {
        "pattern": "Progressive disclosure",
        "usage": "Appropriately used",
        "examples": ["Advanced search options hidden by default"]
      },
      {
        "pattern": "Infinite scroll",
        "usage": "Implemented",
        "concerns": ["Consider pagination for better performance"],
        "alternatives": ["Load more button"]
      }
    ],
    "anti_patterns": [
      {
        "anti_pattern": "Dark patterns",
        "found": false,
        "note": "No manipulative design detected"
      }
    ],
    "recommendations": [
      "Follow Material Design or similar system",
      "Use established patterns for common interactions"
    ]
  },
  "brand_alignment": {
    "score": 7,
    "brand_consistency": {
      "colors": "Aligned with brand palette",
      "typography": "Uses brand fonts",
      "imagery": "Matches brand style",
      "voice": "Consistent with brand tone"
    },
    "gaps": [
      "Logo usage inconsistent",
      "Brand guidelines not fully implemented"
    ],
    "recommendations": [
      "Create comprehensive brand guidelines",
      "Ensure all touchpoints reflect brand"
    ]
  },
  "ux_issues": [
    {
      "id": "UX-001",
      "severity": "critical|high|medium|low",
      "category": "navigation|forms|content|interaction",
      "issue": "Issue description",
      "impact": "Impact on users",
      "affected_screens": ["Screen 1", "Screen 2"],
      "recommendation": "How to fix",
      "priority": 1,
      "effort": "low|medium|high"
    }
  ],
  "accessibility_issues": [
    {
      "id": "A11Y-001",
      "severity": "critical|high|medium|low",
      "wcag_criterion": "1.1.1 Non-text Content",
      "issue": "Images missing alt text",
      "impact": "Screen reader users cannot understand images",
      "affected_areas": ["Product images", "Icons"],
      "remediation": "Add descriptive alt text",
      "priority": 1,
      "effort": "low"
    }
  ],
  "design_recommendations": [
    {
      "priority": 1,
      "category": "accessibility",
      "recommendation": "Fix color contrast issues",
      "rationale": "WCAG AA compliance required",
      "impact": "high",
      "effort": "low",
      "implementation": "Update color tokens to meet 4.5:1 contrast ratio"
    },
    {
      "priority": 2,
      "category": "ux",
      "recommendation": "Simplify registration flow",
      "rationale": "High drop-off rate observed",
      "impact": "high",
      "effort": "medium",
      "implementation": "Reduce fields from 8 to 3, collect additional info later"
    }
  ],
  "design_system_spec": {
    "recommended_tools": ["Figma", "Storybook", "Style Dictionary"],
    "component_library": {
      "framework": "React",
      "styling": "Tailwind CSS|CSS Modules|Styled Components",
      "component_count": "30+ components needed"
    },
    "documentation": {
      "tool": "Storybook",
      "content": ["Component API", "Usage examples", "Accessibility notes", "Do's and Don'ts"]
    }
  },
  "usability_testing_plan": {
    "methods": ["User interviews", "Usability testing", "A/B testing", "Heatmaps"],
    "priority_areas": [
      "Registration flow",
      "Core task completion",
      "Navigation structure"
    ],
    "participants": "5-8 users per test round",
    "frequency": "Monthly usability sessions"
  }
}`;
  }

  private getSystemPrompt(): string {
    return `You are a UX/UI design expert specializing in:
- User experience design and evaluation
- Visual design and aesthetics
- Accessibility (WCAG 2.1 AA/AAA standards)
- Design systems and component libraries
- Interaction design and microinteractions
- Responsive and mobile-first design
- Content design and microcopy
- Design patterns and best practices

Provide actionable design recommendations that:
- Improve usability and user satisfaction
- Ensure accessibility for all users
- Create consistent, cohesive experiences
- Follow industry best practices and standards
- Balance aesthetics with functionality
- Consider business goals and constraints

Be specific with examples and concrete suggestions.`;
  }
}

import { z } from 'zod';
import { BaseTool, ToolContext, ToolMetadata } from '../base/tool-base';
import { Constraints, ConstraintsSchema } from '@ideamine/schemas';

/**
 * Input schema for validateConstraints tool
 */
const ValidateConstraintsInputSchema = z.object({
  constraints: ConstraintsSchema,
});

type ValidateConstraintsInput = z.infer<typeof ValidateConstraintsInputSchema>;

/**
 * Validation issue
 */
const ValidationIssueSchema = z.object({
  field: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  suggestion: z.string().optional(),
});

type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/**
 * Output schema for validateConstraints tool
 */
const ValidateConstraintsOutputSchema = z.object({
  valid: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  adjustedConstraints: ConstraintsSchema.optional(),
});

type ValidateConstraintsOutput = z.infer<typeof ValidateConstraintsOutputSchema>;

/**
 * Constraint limits and defaults
 */
const CONSTRAINT_LIMITS = {
  budget: {
    min: 100,
    max: 10000,
    default: 500,
    recommended: {
      low: 200,
      medium: 500,
      high: 2000,
    },
  },
  timeline: {
    min: 3,
    max: 90,
    default: 14,
    recommended: {
      low: 7,
      medium: 14,
      high: 30,
    },
  },
  compliance: {
    supported: ['GDPR', 'SOC2', 'HIPAA', 'PCI-DSS', 'ISO27001'] as const,
    complexityMultiplier: {
      GDPR: 1.2,
      SOC2: 1.5,
      HIPAA: 2.0,
      'PCI-DSS': 1.8,
      ISO27001: 1.5,
    },
  },
};

/**
 * ValidateConstraints Tool
 *
 * Validates project constraints against platform limits and best practices.
 * Checks budget, timeline, compliance requirements, and tech preferences.
 *
 * @category validation
 * @cost $0.01
 * @avgDuration 50ms
 */
export class ValidateConstraintsTool extends BaseTool<
  ValidateConstraintsInput,
  ValidateConstraintsOutput
> {
  constructor() {
    const metadata: ToolMetadata = {
      id: 'validate-constraints',
      name: 'validateConstraints',
      description:
        'Validate project constraints including budget ($100-$10,000), timeline (3-90 days), compliance requirements, and tech preferences.',
      version: '1.0.0',
      category: 'validation',
      costEstimate: 0.01,
      avgDurationMs: 50,
      requiresApproval: false,
      resourceLimits: {
        maxDurationMs: 1000, // 1 second max
      },
    };

    super(metadata, ValidateConstraintsInputSchema, ValidateConstraintsOutputSchema);
  }

  /**
   * Execute constraint validation
   */
  protected async executeImpl(
    input: ValidateConstraintsInput,
    context: ToolContext
  ): Promise<ValidateConstraintsOutput> {
    const issues: ValidationIssue[] = [];
    const adjustedConstraints: Partial<Constraints> = { ...input.constraints };
    let valid = true;

    // Validate budget
    if (input.constraints.budget !== undefined) {
      const budgetIssues = this.validateBudget(input.constraints.budget);
      issues.push(...budgetIssues);

      // Auto-adjust if out of range
      if (input.constraints.budget < CONSTRAINT_LIMITS.budget.min) {
        adjustedConstraints.budget = CONSTRAINT_LIMITS.budget.min;
        valid = false;
      } else if (input.constraints.budget > CONSTRAINT_LIMITS.budget.max) {
        adjustedConstraints.budget = CONSTRAINT_LIMITS.budget.max;
        valid = false;
      }
    } else {
      // Apply default
      adjustedConstraints.budget = CONSTRAINT_LIMITS.budget.default;
      issues.push({
        field: 'budget',
        severity: 'info',
        message: `No budget specified, using default: $${CONSTRAINT_LIMITS.budget.default}`,
      });
    }

    // Validate timeline
    if (input.constraints.timeline !== undefined) {
      const timelineIssues = this.validateTimeline(input.constraints.timeline);
      issues.push(...timelineIssues);

      // Auto-adjust if out of range
      if (input.constraints.timeline < CONSTRAINT_LIMITS.timeline.min) {
        adjustedConstraints.timeline = CONSTRAINT_LIMITS.timeline.min;
        valid = false;
      } else if (input.constraints.timeline > CONSTRAINT_LIMITS.timeline.max) {
        adjustedConstraints.timeline = CONSTRAINT_LIMITS.timeline.max;
        valid = false;
      }
    } else {
      // Apply default
      adjustedConstraints.timeline = CONSTRAINT_LIMITS.timeline.default;
      issues.push({
        field: 'timeline',
        severity: 'info',
        message: `No timeline specified, using default: ${CONSTRAINT_LIMITS.timeline.default} days`,
      });
    }

    // Validate compliance requirements
    if (input.constraints.compliance && input.constraints.compliance.length > 0) {
      const complianceIssues = this.validateCompliance(input.constraints.compliance);
      issues.push(...complianceIssues);

      // Check if compliance requirements are compatible with budget/timeline
      const complianceMultiplier = this.calculateComplianceMultiplier(
        input.constraints.compliance
      );

      if (adjustedConstraints.budget && adjustedConstraints.timeline) {
        const recommendedBudget = CONSTRAINT_LIMITS.budget.recommended.medium * complianceMultiplier;
        const recommendedTimeline =
          CONSTRAINT_LIMITS.timeline.recommended.medium * complianceMultiplier;

        if (adjustedConstraints.budget < recommendedBudget) {
          issues.push({
            field: 'budget',
            severity: 'warning',
            message: `Budget may be insufficient for compliance requirements (${input.constraints.compliance.join(', ')})`,
            suggestion: `Consider increasing budget to at least $${Math.ceil(recommendedBudget)}`,
          });
        }

        if (adjustedConstraints.timeline < recommendedTimeline) {
          issues.push({
            field: 'timeline',
            severity: 'warning',
            message: `Timeline may be tight for compliance requirements (${input.constraints.compliance.join(', ')})`,
            suggestion: `Consider extending timeline to at least ${Math.ceil(recommendedTimeline)} days`,
          });
        }
      }
    }

    // Validate tech preferences
    if (input.constraints.techPreferences && input.constraints.techPreferences.length > 0) {
      const techIssues = this.validateTechPreferences(input.constraints.techPreferences);
      issues.push(...techIssues);
    }

    return {
      valid: valid && issues.filter((i) => i.severity === 'error').length === 0,
      issues,
      adjustedConstraints: valid ? undefined : adjustedConstraints,
    };
  }

  /**
   * Validate budget constraint
   */
  private validateBudget(budget: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (budget < CONSTRAINT_LIMITS.budget.min) {
      issues.push({
        field: 'budget',
        severity: 'error',
        message: `Budget $${budget} is below minimum $${CONSTRAINT_LIMITS.budget.min}`,
        suggestion: `Increase budget to at least $${CONSTRAINT_LIMITS.budget.min}`,
      });
    } else if (budget > CONSTRAINT_LIMITS.budget.max) {
      issues.push({
        field: 'budget',
        severity: 'error',
        message: `Budget $${budget} exceeds maximum $${CONSTRAINT_LIMITS.budget.max}`,
        suggestion: `Reduce budget to at most $${CONSTRAINT_LIMITS.budget.max}`,
      });
    } else if (budget < CONSTRAINT_LIMITS.budget.recommended.medium) {
      issues.push({
        field: 'budget',
        severity: 'warning',
        message: `Budget $${budget} is below recommended amount for typical projects`,
        suggestion: `Consider $${CONSTRAINT_LIMITS.budget.recommended.medium} for better results`,
      });
    }

    return issues;
  }

  /**
   * Validate timeline constraint
   */
  private validateTimeline(timeline: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (timeline < CONSTRAINT_LIMITS.timeline.min) {
      issues.push({
        field: 'timeline',
        severity: 'error',
        message: `Timeline ${timeline} days is below minimum ${CONSTRAINT_LIMITS.timeline.min} days`,
        suggestion: `Extend timeline to at least ${CONSTRAINT_LIMITS.timeline.min} days`,
      });
    } else if (timeline > CONSTRAINT_LIMITS.timeline.max) {
      issues.push({
        field: 'timeline',
        severity: 'error',
        message: `Timeline ${timeline} days exceeds maximum ${CONSTRAINT_LIMITS.timeline.max} days`,
        suggestion: `Reduce timeline to at most ${CONSTRAINT_LIMITS.timeline.max} days`,
      });
    } else if (timeline < CONSTRAINT_LIMITS.timeline.recommended.medium) {
      issues.push({
        field: 'timeline',
        severity: 'warning',
        message: `Timeline ${timeline} days is aggressive for typical projects`,
        suggestion: `Consider ${CONSTRAINT_LIMITS.timeline.recommended.medium} days for better quality`,
      });
    }

    return issues;
  }

  /**
   * Validate compliance requirements
   */
  private validateCompliance(compliance: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const supported = CONSTRAINT_LIMITS.compliance.supported;

    for (const requirement of compliance) {
      if (!supported.includes(requirement as (typeof supported)[number])) {
        issues.push({
          field: 'compliance',
          severity: 'warning',
          message: `Compliance requirement "${requirement}" is not in supported list`,
          suggestion: `Supported: ${supported.join(', ')}`,
        });
      }
    }

    // Check for conflicting requirements
    if (compliance.includes('HIPAA') && compliance.includes('PCI-DSS')) {
      issues.push({
        field: 'compliance',
        severity: 'warning',
        message: 'HIPAA and PCI-DSS together significantly increase complexity',
        suggestion: 'Consider separate projects for healthcare and payment processing',
      });
    }

    return issues;
  }

  /**
   * Validate tech preferences
   */
  private validateTechPreferences(techPreferences: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for incompatible tech choices
    const hasReact = techPreferences.some((tech) =>
      tech.toLowerCase().includes('react')
    );
    const hasVue = techPreferences.some((tech) =>
      tech.toLowerCase().includes('vue')
    );
    const hasAngular = techPreferences.some((tech) =>
      tech.toLowerCase().includes('angular')
    );

    const frontendCount = [hasReact, hasVue, hasAngular].filter(Boolean).length;

    if (frontendCount > 1) {
      issues.push({
        field: 'techPreferences',
        severity: 'warning',
        message: 'Multiple frontend frameworks specified (React, Vue, Angular)',
        suggestion: 'Choose a single frontend framework for consistency',
      });
    }

    return issues;
  }

  /**
   * Calculate complexity multiplier from compliance requirements
   */
  private calculateComplianceMultiplier(compliance: string[]): number {
    let multiplier = 1.0;

    for (const requirement of compliance) {
      const factor =
        CONSTRAINT_LIMITS.compliance.complexityMultiplier[
          requirement as keyof typeof CONSTRAINT_LIMITS.compliance.complexityMultiplier
        ];
      if (factor) {
        multiplier *= factor;
      }
    }

    return multiplier;
  }
}

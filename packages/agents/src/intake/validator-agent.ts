import { ChatAnthropic } from '@langchain/anthropic';
import {
  BaseAgent,
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
  AgentConfig,
} from '@ideamine/agent-sdk';
import { ValidateConstraintsTool } from '@ideamine/tools';
import { IdeaSpecSchema } from '@ideamine/schemas';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';

/**
 * Validation issue
 */
interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

/**
 * Validation result
 */
interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  completeness: number; // 0.0-1.0
  appliedDefaults: string[];
}

/**
 * Full IdeaSpec type
 */
type IdeaSpec = z.infer<typeof IdeaSpecSchema>;

/**
 * IntakeValidatorAgent
 *
 * Third and final agent in the intake phase. Responsible for:
 * 1. Validating the partial IdeaSpec for completeness
 * 2. Checking all required fields are present
 * 3. Applying sensible defaults for missing fields
 * 4. Generating UUID v7 for projectId
 * 5. Creating the final IdeaSpec v1.0.0 artifact
 *
 * Extends BaseAgent with Analyzer-inside-Agent pattern.
 * Uses low temperature (0.2) for validation.
 */
export class IntakeValidatorAgent extends BaseAgent {
  private llm: ChatAnthropic;
  private validateConstraintsTool: ValidateConstraintsTool;

  constructor(config: AgentConfig) {
    super(config);

    // Initialize Claude LLM from config (temperature 0.2 for validation)
    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature, // 0.2 for strict validation
      maxTokens: config.llm.maxTokens,
      topP: config.llm.topP,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize tools
    this.validateConstraintsTool = new ValidateConstraintsTool();

    // Register tools with the agent
    this.registerTool(this.validateConstraintsTool);
  }

  /**
   * STEP 1: PLANNER
   * Create execution plan for validation
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      agentId: this.config.id,
      steps: [
        {
          stepId: 'extract-partial-spec',
          description: 'Extract partial IdeaSpec from previous agent output',
          estimatedDurationMs: 500,
          requiredTools: [],
        },
        {
          stepId: 'validate-completeness',
          description: 'Validate all required fields are present',
          estimatedDurationMs: 2000,
          requiredTools: [],
        },
        {
          stepId: 'apply-defaults',
          description: 'Apply defaults for missing optional fields',
          estimatedDurationMs: 1000,
          requiredTools: [],
        },
        {
          stepId: 'validate-constraints',
          description: 'Validate budget and timeline constraints',
          estimatedDurationMs: 2000,
          requiredTools: ['validate-constraints'],
        },
        {
          stepId: 'generate-final-spec',
          description: 'Generate final IdeaSpec v1.0.0 artifact',
          estimatedDurationMs: 1000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 6500,
      confidence: 0.95,
    };
  }

  /**
   * STEP 2: REASONING
   * Validate the partial spec and apply defaults
   */
  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const partialSpec = this.extractPartialSpec(input);

    try {
      // Step 1: Validate completeness
      const validation = await this.validateCompleteness(partialSpec);

      // Step 2: Apply defaults for missing fields
      const { completeSpec, appliedDefaults } = this.applyDefaults(partialSpec, validation);

      // Step 3: Final validation with LLM
      const finalValidation = await this.performFinalValidation(completeSpec);

      return {
        reasoning: `Validated IdeaSpec with ${validation.issues.length} issues. Completeness: ${Math.round(validation.completeness * 100)}%. Applied ${appliedDefaults.length} defaults.`,
        confidence: this.calculateValidationConfidence(validation, finalValidation),
        intermediate: {
          completeSpec,
          validation: finalValidation,
          appliedDefaults,
        },
      };
    } catch (error) {
      console.warn('[IntakeValidatorAgent] Validation failed, using permissive fallback:', error);
      return this.permissiveFallback(partialSpec);
    }
  }

  /**
   * STEP 3: Generate final IdeaSpec artifact
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const completeSpec: IdeaSpec = result.intermediate.completeSpec;
    const validation: ValidationResult = result.intermediate.validation;

    // Add metadata
    completeSpec.metadata = {
      ...completeSpec.metadata,
      source: 'intake-phase',
      validatedAt: new Date().toISOString(),
      validationConfidence: result.confidence,
      appliedDefaults: result.intermediate.appliedDefaults,
    };

    return [
      {
        type: 'idea-spec',
        version: '1.0.0',
        content: completeSpec,
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
      {
        type: 'intake-validation',
        version: '1.0.0',
        content: {
          validation,
          appliedDefaults: result.intermediate.appliedDefaults,
        },
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  /**
   * Extract partial spec from previous agent's output
   */
  private extractPartialSpec(input: AgentInput): Partial<IdeaSpec> {
    if (input.data && typeof input.data === 'object') {
      const data = input.data as any;

      // Extract from expansion artifact
      if (data.partialSpec) {
        return data.partialSpec;
      }

      // Extract from raw data
      return {
        title: data.title,
        description: data.description,
        targetUsers: data.targetUsers,
        problemStatement: data.problemStatement,
        successCriteria: data.successCriteria,
        constraints: data.constraints,
      };
    }

    return {};
  }

  /**
   * Validate completeness of the spec
   */
  private async validateCompleteness(partialSpec: Partial<IdeaSpec>): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    let completeness = 0;
    const totalFields = 7; // title, description, targetUsers, problemStatement, successCriteria, constraints.budget, constraints.timeline

    // Required fields validation
    if (!partialSpec.title || partialSpec.title.length < 5) {
      issues.push({
        field: 'title',
        severity: 'error',
        message: 'Title is required and must be at least 5 characters',
        suggestion: 'Provide a descriptive project title',
      });
    } else {
      completeness += 1;
    }

    if (!partialSpec.description || partialSpec.description.length < 100) {
      issues.push({
        field: 'description',
        severity: 'error',
        message: 'Description is required and must be at least 100 characters',
        suggestion: 'Provide a detailed description of the project',
      });
    } else {
      completeness += 1;
    }

    if (!partialSpec.targetUsers || partialSpec.targetUsers.length === 0) {
      issues.push({
        field: 'targetUsers',
        severity: 'error',
        message: 'At least one target user group is required',
        suggestion: 'Identify who will use this application',
      });
    } else {
      completeness += 1;
    }

    if (!partialSpec.problemStatement || partialSpec.problemStatement.length < 50) {
      issues.push({
        field: 'problemStatement',
        severity: 'error',
        message: 'Problem statement is required and must be at least 50 characters',
        suggestion: 'Describe the problem this project solves',
      });
    } else {
      completeness += 1;
    }

    if (!partialSpec.successCriteria || partialSpec.successCriteria.length === 0) {
      issues.push({
        field: 'successCriteria',
        severity: 'warning',
        message: 'Success criteria are highly recommended',
        suggestion: 'Define how you will measure project success',
      });
    } else {
      completeness += 1;
    }

    // Constraints validation
    if (!partialSpec.constraints?.budget) {
      issues.push({
        field: 'constraints.budget',
        severity: 'info',
        message: 'Budget not specified, will use default',
        suggestion: 'Specify a budget range for the project',
      });
    } else {
      completeness += 1;
    }

    if (!partialSpec.constraints?.timeline) {
      issues.push({
        field: 'constraints.timeline',
        severity: 'info',
        message: 'Timeline not specified, will use default',
        suggestion: 'Specify a desired timeline for completion',
      });
    } else {
      completeness += 1;
    }

    const isValid = issues.filter((i) => i.severity === 'error').length === 0;

    return {
      isValid,
      issues,
      completeness: completeness / totalFields,
      appliedDefaults: [],
    };
  }

  /**
   * Apply defaults for missing fields
   */
  private applyDefaults(
    partialSpec: Partial<IdeaSpec>,
    validation: ValidationResult
  ): { completeSpec: IdeaSpec; appliedDefaults: string[] } {
    const appliedDefaults: string[] = [];

    // Generate UUID v7 for projectId
    const projectId = uuidv7();
    appliedDefaults.push('projectId');

    // Default timestamps
    const now = new Date().toISOString();
    const submittedAt = partialSpec.submittedAt || now;
    if (!partialSpec.submittedAt) appliedDefaults.push('submittedAt');

    const submittedBy = partialSpec.submittedBy || 'user';
    if (!partialSpec.submittedBy) appliedDefaults.push('submittedBy');

    // Default title
    let title = partialSpec.title || 'Untitled Project';
    if (!partialSpec.title) appliedDefaults.push('title');
    title = title.slice(0, 200); // Ensure max length

    // Default description
    let description = partialSpec.description || 'No description provided.';
    if (!partialSpec.description) appliedDefaults.push('description');
    description = description.slice(0, 5000); // Ensure max length

    // Default target users
    const targetUsers = partialSpec.targetUsers || ['general users'];
    if (!partialSpec.targetUsers) appliedDefaults.push('targetUsers');

    // Default problem statement
    let problemStatement = partialSpec.problemStatement || 'Problem statement not provided.';
    if (!partialSpec.problemStatement) appliedDefaults.push('problemStatement');
    problemStatement = problemStatement.slice(0, 2000); // Ensure max length

    // Default success criteria
    const successCriteria = partialSpec.successCriteria || [
      'Project completion within timeline',
      'Positive user feedback',
    ];
    if (!partialSpec.successCriteria) appliedDefaults.push('successCriteria');

    // Default constraints
    const constraints = {
      budget: partialSpec.constraints?.budget || {
        min: 100,
        max: 500,
        currency: 'USD',
      },
      timeline: partialSpec.constraints?.timeline || {
        min: 7,
        max: 14,
        unit: 'days',
      },
      technicalPreferences: partialSpec.constraints?.technicalPreferences || [],
      complianceRequirements: partialSpec.constraints?.complianceRequirements || [],
    };

    if (!partialSpec.constraints?.budget) appliedDefaults.push('constraints.budget');
    if (!partialSpec.constraints?.timeline) appliedDefaults.push('constraints.timeline');

    // Default attachments
    const attachments = partialSpec.attachments || [];

    // Default metadata
    const metadata = {
      ...partialSpec.metadata,
      tags: partialSpec.metadata?.tags || [],
      priority: partialSpec.metadata?.priority || 'medium',
      customFields: partialSpec.metadata?.customFields || {},
    };

    const completeSpec: IdeaSpec = {
      version: '1.0.0',
      projectId,
      submittedBy,
      submittedAt,
      title,
      description,
      targetUsers,
      problemStatement,
      successCriteria,
      constraints,
      attachments,
      metadata,
    };

    return { completeSpec, appliedDefaults };
  }

  /**
   * Perform final validation using Claude
   */
  private async performFinalValidation(spec: IdeaSpec): Promise<ValidationResult> {
    const prompt = this.buildValidationPrompt(spec);

    const response = await this.llm.invoke(prompt);
    const analysisText = response.content.toString();

    return this.parseValidation(analysisText);
  }

  /**
   * Build validation prompt for Claude
   */
  private buildValidationPrompt(spec: IdeaSpec): string {
    return `You are a meticulous quality assurance analyst. Review the following IdeaSpec for completeness, consistency, and quality.

IdeaSpec:
${JSON.stringify(spec, null, 2)}

Analyze the spec and identify any issues in the following JSON format:

{
  "issues": [
    {
      "field": "<field name>",
      "severity": "<error|warning|info>",
      "message": "<description of the issue>",
      "suggestion": "<how to fix it>"
    }
  ],
  "completeness": <score 0.0-1.0>,
  "overallQuality": "<poor|fair|good|excellent>"
}

Check for:
1. **Completeness**: Are all required fields present and meaningful?
2. **Consistency**: Do the fields align with each other?
3. **Quality**: Is the information detailed enough to proceed?
4. **Feasibility**: Are the constraints (budget, timeline) realistic?

Severity Levels:
- **error**: Critical issues that prevent proceeding (missing required fields, invalid data)
- **warning**: Important issues that should be addressed (vague descriptions, unrealistic constraints)
- **info**: Minor suggestions for improvement (could be more detailed, missing optional fields)

Be strict but fair in your assessment.

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse validation from Claude response
   */
  private parseValidation(analysisText: string): ValidationResult {
    try {
      // Extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const issues: ValidationIssue[] = Array.isArray(parsed.issues)
        ? parsed.issues.map((issue: any) => ({
            field: issue.field || 'unknown',
            severity: this.normalizeSeverity(issue.severity),
            message: issue.message || 'Validation issue',
            suggestion: issue.suggestion,
          }))
        : [];

      const completeness = Math.max(0, Math.min(1, parsed.completeness || 0.8));
      const isValid = issues.filter((i) => i.severity === 'error').length === 0;

      return {
        isValid,
        issues,
        completeness,
        appliedDefaults: [],
      };
    } catch (error) {
      console.warn('[IntakeValidatorAgent] Failed to parse validation:', error);

      // Return permissive validation
      return {
        isValid: true,
        issues: [],
        completeness: 0.8,
        appliedDefaults: [],
      };
    }
  }

  /**
   * Normalize severity level
   */
  private normalizeSeverity(severity: string): 'error' | 'warning' | 'info' {
    const normalized = severity?.toLowerCase();
    if (normalized === 'error') return 'error';
    if (normalized === 'warning') return 'warning';
    return 'info';
  }

  /**
   * Calculate validation confidence
   */
  private calculateValidationConfidence(
    initialValidation: ValidationResult,
    finalValidation: ValidationResult
  ): number {
    const completenessScore = finalValidation.completeness;
    const errorCount = finalValidation.issues.filter((i) => i.severity === 'error').length;
    const warningCount = finalValidation.issues.filter((i) => i.severity === 'warning').length;

    // Confidence formula: completeness - (errors * 0.2) - (warnings * 0.05)
    const confidence = completenessScore - errorCount * 0.2 - warningCount * 0.05;

    return Math.max(0.5, Math.min(0.95, confidence));
  }

  /**
   * Permissive fallback when validation fails
   */
  private permissiveFallback(partialSpec: Partial<IdeaSpec>): ReasoningResult {
    const validation: ValidationResult = {
      isValid: true,
      issues: [],
      completeness: 0.7,
      appliedDefaults: [],
    };

    const { completeSpec, appliedDefaults } = this.applyDefaults(partialSpec, validation);

    return {
      reasoning: 'Permissive validation (LLM unavailable). Applied all defaults.',
      confidence: 0.7,
      intermediate: {
        completeSpec,
        validation,
        appliedDefaults,
      },
    };
  }
}

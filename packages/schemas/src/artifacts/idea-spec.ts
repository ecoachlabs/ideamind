import { z } from 'zod';

/**
 * IdeaSpec v1.0.0 Schema
 *
 * Structured artifact generated from raw idea submission during Intake phase.
 * Contains all essential context needed for downstream phases.
 *
 * @phase Intake
 * @version 1.0.0
 */

/**
 * Attachment schema for supporting materials
 */
export const AttachmentSchema = z.object({
  type: z.string().describe('MIME type or file type (e.g., "application/pdf", "image/png")'),
  url: z.string().url().describe('URL to the attachment (local or remote)'),
  hash: z.string().describe('SHA-256 content hash for integrity verification'),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Constraints schema for project limitations
 */
export const ConstraintsSchema = z.object({
  budget: z.number().min(100).max(10000).optional().describe('LLM budget in USD ($100-$10,000)'),
  timeline: z.number().min(3).max(90).optional().describe('Timeline in days (3-90 days)'),
  compliance: z.array(z.enum(['GDPR', 'SOC2', 'HIPAA', 'PCI-DSS', 'ISO27001'])).optional().describe('Compliance requirements'),
  techPreferences: z.array(z.string()).optional().describe('Preferred technologies or frameworks'),
});

export type Constraints = z.infer<typeof ConstraintsSchema>;

/**
 * Metadata schema for idea classification
 */
export const MetadataSchema = z.object({
  source: z.enum(['web', 'api', 'cli']).describe('Submission source channel'),
  complexity: z.enum(['low', 'medium', 'high']).describe('Estimated project complexity'),
  category: z.enum(['technical', 'business', 'creative', 'hybrid']).optional().describe('Idea category from classifier'),
  estimatedAgents: z.array(z.string()).optional().describe('Estimated agents needed (from classifier)'),
});

export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Complete IdeaSpec schema (v1.0.0)
 */
export const IdeaSpecSchema = z.object({
  version: z.literal('1.0.0').describe('Schema version for compatibility'),
  projectId: z.string().uuid().describe('Unique project ID (UUID v7 time-sortable)'),
  submittedBy: z.string().describe('User ID who submitted the idea'),
  submittedAt: z.string().datetime().describe('Submission timestamp (ISO 8601)'),

  // Core idea content
  title: z.string().min(5).max(200).describe('Concise project title'),
  description: z.string().min(100).max(5000).describe('Detailed idea description'),
  targetUsers: z.array(z.string()).min(1).describe('Target user groups or personas'),
  problemStatement: z.string().min(50).max(2000).describe('Problem being solved'),
  successCriteria: z.array(z.string()).min(1).describe('Measurable success criteria'),

  // Constraints and preferences
  constraints: ConstraintsSchema,

  // Supporting materials
  attachments: z.array(AttachmentSchema).default([]),

  // Metadata
  metadata: MetadataSchema,
});

export type IdeaSpec = z.infer<typeof IdeaSpecSchema>;

/**
 * Partial IdeaSpec for draft/in-progress submissions
 */
export const PartialIdeaSpecSchema = IdeaSpecSchema.partial({
  title: true,
  description: true,
  targetUsers: true,
  problemStatement: true,
  successCriteria: true,
  constraints: true,
}).required({
  version: true,
  projectId: true,
  submittedBy: true,
  submittedAt: true,
  metadata: true,
});

export type PartialIdeaSpec = z.infer<typeof PartialIdeaSpecSchema>;

/**
 * Validation result with detailed errors
 */
export interface IdeaSpecValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  completeness: number; // 0-100 percentage
  missingFields: string[];
}

/**
 * Validate IdeaSpec and return detailed validation result
 */
export function validateIdeaSpec(data: unknown): IdeaSpecValidationResult {
  const result = IdeaSpecSchema.safeParse(data);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      completeness: 100,
      missingFields: [],
    };
  }

  const errors = result.error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));

  // Calculate completeness
  const requiredFields = [
    'title',
    'description',
    'targetUsers',
    'problemStatement',
    'successCriteria',
  ];

  const presentFields = requiredFields.filter((field) => {
    const value = (data as Record<string, unknown>)?.[field];
    return value !== undefined && value !== null && value !== '';
  });

  const completeness = Math.round((presentFields.length / requiredFields.length) * 100);

  const missingFields = requiredFields.filter((field) => {
    const value = (data as Record<string, unknown>)?.[field];
    return value === undefined || value === null || value === '';
  });

  return {
    valid: false,
    errors,
    completeness,
    missingFields,
  };
}

/**
 * Create a new IdeaSpec with defaults
 */
export function createIdeaSpec(
  projectId: string,
  submittedBy: string,
  partial: Partial<Omit<IdeaSpec, 'version' | 'projectId' | 'submittedBy' | 'submittedAt'>>
): IdeaSpec {
  return {
    version: '1.0.0',
    projectId,
    submittedBy,
    submittedAt: new Date().toISOString(),
    title: partial.title ?? '',
    description: partial.description ?? '',
    targetUsers: partial.targetUsers ?? [],
    problemStatement: partial.problemStatement ?? '',
    successCriteria: partial.successCriteria ?? [],
    constraints: partial.constraints ?? {},
    attachments: partial.attachments ?? [],
    metadata: partial.metadata ?? {
      source: 'api',
      complexity: 'medium',
    },
  };
}

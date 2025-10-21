import { z } from 'zod';

/**
 * Classification result from IntakeClassifierAgent
 */
export const ClassificationResultSchema = z.object({
  category: z.enum(['technical', 'business', 'creative', 'hybrid']).describe('Primary idea category'),
  complexity: z.enum(['low', 'medium', 'high']).describe('Estimated complexity'),
  confidence: z.number().min(0).max(1).describe('Classification confidence (0-1)'),
  requiredAgents: z.array(z.string()).describe('Downstream agents likely needed'),
  reasoning: z.string().describe('Classification reasoning'),
  suggestedPhases: z.array(z.string()).describe('Phases that will likely be critical'),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

/**
 * Single clarifying question
 */
export const ClarifyingQuestionSchema = z.object({
  id: z.string().describe('Unique question ID'),
  question: z.string().describe('The question text'),
  purpose: z.string().describe('Why this question is being asked'),
  required: z.boolean().describe('Whether answer is required'),
  suggestedAnswers: z.array(z.string()).optional().describe('Optional suggested answers'),
});

export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

/**
 * Question set from IntakeExpanderAgent
 */
export const QuestionSetSchema = z.object({
  questions: z.array(ClarifyingQuestionSchema).min(5).max(10).describe('5-10 clarifying questions'),
  estimatedTime: z.number().describe('Estimated completion time in minutes'),
  context: z.string().describe('Context for why these questions were chosen'),
});

export type QuestionSet = z.infer<typeof QuestionSetSchema>;

/**
 * Answer to a clarifying question
 */
export const QuestionAnswerSchema = z.object({
  questionId: z.string().describe('ID of the question being answered'),
  answer: z.string().describe('User\'s answer'),
  answeredAt: z.string().datetime().describe('When the answer was provided'),
});

export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;

/**
 * Validation result from IntakeValidatorAgent
 */
export const ValidationResultSchema = z.object({
  valid: boolean,
  completeness: z.number().min(0).max(100).describe('Completeness percentage'),
  missingFields: z.array(z.string()).describe('Required fields that are missing'),
  issues: z.array(z.object({
    field: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    message: z.string(),
  })).describe('Validation issues'),
  estimatedTimeline: z.number().describe('Estimated timeline in days (default 14)'),
  estimatedBudget: z.number().describe('Estimated budget in USD (default $500)'),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Similar idea match from vector search
 */
export const SimilarIdeaSchema = z.object({
  projectId: z.string().describe('Similar project ID'),
  title: z.string().describe('Project title'),
  description: z.string().describe('Project description'),
  similarity: z.number().min(0).max(1).describe('Similarity score (0-1)'),
  outcome: z.enum(['success', 'failed', 'in-progress']).describe('Project outcome'),
  learnings: z.array(z.string()).describe('Key learnings from this project'),
});

export type SimilarIdea = z.infer<typeof SimilarIdeaSchema>;

/**
 * Complexity estimation result
 */
export const ComplexityEstimationSchema = z.object({
  complexity: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1).describe('Estimation confidence'),
  factors: z.object({
    featureCount: z.enum(['low', 'medium', 'high']),
    integrations: z.enum(['none', 'few', 'many']),
    dataVolume: z.enum(['low', 'medium', 'high']),
    userScale: z.enum(['small', 'medium', 'large']),
    technicalNovelty: z.enum(['low', 'medium', 'high']),
  }).describe('Contributing complexity factors'),
  reasoning: z.string().describe('Explanation of complexity estimation'),
  estimatedDuration: z.number().describe('Estimated duration in days'),
});

export type ComplexityEstimation = z.infer<typeof ComplexityEstimationSchema>;

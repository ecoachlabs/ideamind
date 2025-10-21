import { z } from 'zod';

/**
 * Intake Phase: Idea Spec
 * The initial idea submission from the user
 */
export const IdeaSpecSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  targetUsers: z.string().optional(),
  problemStatement: z.string().optional(),
  existingSolutions: z.string().optional(),
  constraints: z.object({
    budget: z.number().positive().optional(),
    timeline: z.string().optional(),
    technicalConstraints: z.array(z.string()).optional(),
  }).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    type: z.string(),
  })).optional(),
});

export type IdeaSpec = z.infer<typeof IdeaSpecSchema>;

/**
 * PRD Phase: Product Requirements Document
 * Comprehensive product specification
 */
export const PRDDocumentSchema = z.object({
  version: z.string(),
  executiveSummary: z.string(),
  productOverview: z.object({
    vision: z.string(),
    goals: z.array(z.string()),
    successMetrics: z.array(z.object({
      metric: z.string(),
      target: z.string(),
    })),
  }),
  userPersonas: z.array(z.object({
    name: z.string(),
    description: z.string(),
    goals: z.array(z.string()),
    painPoints: z.array(z.string()),
  })),
  features: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']),
    userStories: z.array(z.string()),
    acceptanceCriteria: z.array(z.string()),
  })),
  nonFunctionalRequirements: z.object({
    performance: z.array(z.string()).optional(),
    security: z.array(z.string()).optional(),
    scalability: z.array(z.string()).optional(),
    accessibility: z.array(z.string()).optional(),
  }),
  technicalConstraints: z.array(z.string()).optional(),
  outOfScope: z.array(z.string()).optional(),
});

export type PRDDocument = z.infer<typeof PRDDocumentSchema>;

/**
 * Architecture Phase: System Architecture Document
 */
export const ArchitectureDocumentSchema = z.object({
  version: z.string(),
  systemOverview: z.string(),
  components: z.array(z.object({
    name: z.string(),
    type: z.enum(['service', 'library', 'database', 'queue', 'cache', 'external']),
    description: z.string(),
    responsibilities: z.array(z.string()),
    dependencies: z.array(z.string()),
    apis: z.array(z.object({
      endpoint: z.string(),
      method: z.string(),
      description: z.string(),
    })).optional(),
  })),
  dataModel: z.object({
    entities: z.array(z.object({
      name: z.string(),
      description: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string().optional(),
      })),
      relationships: z.array(z.object({
        type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
        target: z.string(),
        description: z.string().optional(),
      })).optional(),
    })),
  }),
  technologyStack: z.object({
    frontend: z.array(z.string()).optional(),
    backend: z.array(z.string()),
    database: z.array(z.string()),
    infrastructure: z.array(z.string()),
    thirdParty: z.array(z.object({
      name: z.string(),
      purpose: z.string(),
    })).optional(),
  }),
  deploymentArchitecture: z.object({
    environments: z.array(z.string()),
    infrastructure: z.string(),
    cicd: z.string(),
  }),
  securityConsiderations: z.array(z.string()),
  scalabilityStrategy: z.string().optional(),
});

export type ArchitectureDocument = z.infer<typeof ArchitectureDocumentSchema>;

/**
 * QA Phase: Test Results
 */
export const TestResultsSchema = z.object({
  testSuite: z.string(),
  timestamp: z.string().datetime(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    duration: z.number().int().positive(), // milliseconds
  }),
  tests: z.array(z.object({
    name: z.string(),
    status: z.enum(['passed', 'failed', 'skipped']),
    duration: z.number().int().nonnegative(),
    error: z.string().optional(),
  })),
  coverage: z.object({
    lines: z.number().min(0).max(100),
    branches: z.number().min(0).max(100),
    functions: z.number().min(0).max(100),
    statements: z.number().min(0).max(100),
  }).optional(),
});

export type TestResults = z.infer<typeof TestResultsSchema>;

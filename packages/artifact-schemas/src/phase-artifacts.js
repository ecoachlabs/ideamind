"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestResultsSchema = exports.ArchitectureDocumentSchema = exports.PRDDocumentSchema = exports.IdeaSpecSchema = void 0;
const zod_1 = require("zod");
/**
 * Intake Phase: Idea Spec
 * The initial idea submission from the user
 */
exports.IdeaSpecSchema = zod_1.z.object({
    title: zod_1.z.string().min(5).max(200),
    description: zod_1.z.string().min(20),
    targetUsers: zod_1.z.string().optional(),
    problemStatement: zod_1.z.string().optional(),
    existingSolutions: zod_1.z.string().optional(),
    constraints: zod_1.z.object({
        budget: zod_1.z.number().positive().optional(),
        timeline: zod_1.z.string().optional(),
        technicalConstraints: zod_1.z.array(zod_1.z.string()).optional(),
    }).optional(),
    attachments: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        url: zod_1.z.string().url(),
        type: zod_1.z.string(),
    })).optional(),
});
/**
 * PRD Phase: Product Requirements Document
 * Comprehensive product specification
 */
exports.PRDDocumentSchema = zod_1.z.object({
    version: zod_1.z.string(),
    executiveSummary: zod_1.z.string(),
    productOverview: zod_1.z.object({
        vision: zod_1.z.string(),
        goals: zod_1.z.array(zod_1.z.string()),
        successMetrics: zod_1.z.array(zod_1.z.object({
            metric: zod_1.z.string(),
            target: zod_1.z.string(),
        })),
    }),
    userPersonas: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        description: zod_1.z.string(),
        goals: zod_1.z.array(zod_1.z.string()),
        painPoints: zod_1.z.array(zod_1.z.string()),
    })),
    features: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        description: zod_1.z.string(),
        priority: zod_1.z.enum(['P0', 'P1', 'P2', 'P3']),
        userStories: zod_1.z.array(zod_1.z.string()),
        acceptanceCriteria: zod_1.z.array(zod_1.z.string()),
    })),
    nonFunctionalRequirements: zod_1.z.object({
        performance: zod_1.z.array(zod_1.z.string()).optional(),
        security: zod_1.z.array(zod_1.z.string()).optional(),
        scalability: zod_1.z.array(zod_1.z.string()).optional(),
        accessibility: zod_1.z.array(zod_1.z.string()).optional(),
    }),
    technicalConstraints: zod_1.z.array(zod_1.z.string()).optional(),
    outOfScope: zod_1.z.array(zod_1.z.string()).optional(),
});
/**
 * Architecture Phase: System Architecture Document
 */
exports.ArchitectureDocumentSchema = zod_1.z.object({
    version: zod_1.z.string(),
    systemOverview: zod_1.z.string(),
    components: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        type: zod_1.z.enum(['service', 'library', 'database', 'queue', 'cache', 'external']),
        description: zod_1.z.string(),
        responsibilities: zod_1.z.array(zod_1.z.string()),
        dependencies: zod_1.z.array(zod_1.z.string()),
        apis: zod_1.z.array(zod_1.z.object({
            endpoint: zod_1.z.string(),
            method: zod_1.z.string(),
            description: zod_1.z.string(),
        })).optional(),
    })),
    dataModel: zod_1.z.object({
        entities: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string(),
            description: zod_1.z.string(),
            fields: zod_1.z.array(zod_1.z.object({
                name: zod_1.z.string(),
                type: zod_1.z.string(),
                required: zod_1.z.boolean(),
                description: zod_1.z.string().optional(),
            })),
            relationships: zod_1.z.array(zod_1.z.object({
                type: zod_1.z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
                target: zod_1.z.string(),
                description: zod_1.z.string().optional(),
            })).optional(),
        })),
    }),
    technologyStack: zod_1.z.object({
        frontend: zod_1.z.array(zod_1.z.string()).optional(),
        backend: zod_1.z.array(zod_1.z.string()),
        database: zod_1.z.array(zod_1.z.string()),
        infrastructure: zod_1.z.array(zod_1.z.string()),
        thirdParty: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string(),
            purpose: zod_1.z.string(),
        })).optional(),
    }),
    deploymentArchitecture: zod_1.z.object({
        environments: zod_1.z.array(zod_1.z.string()),
        infrastructure: zod_1.z.string(),
        cicd: zod_1.z.string(),
    }),
    securityConsiderations: zod_1.z.array(zod_1.z.string()),
    scalabilityStrategy: zod_1.z.string().optional(),
});
/**
 * QA Phase: Test Results
 */
exports.TestResultsSchema = zod_1.z.object({
    testSuite: zod_1.z.string(),
    timestamp: zod_1.z.string().datetime(),
    summary: zod_1.z.object({
        total: zod_1.z.number().int().nonnegative(),
        passed: zod_1.z.number().int().nonnegative(),
        failed: zod_1.z.number().int().nonnegative(),
        skipped: zod_1.z.number().int().nonnegative(),
        duration: zod_1.z.number().int().positive(), // milliseconds
    }),
    tests: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        status: zod_1.z.enum(['passed', 'failed', 'skipped']),
        duration: zod_1.z.number().int().nonnegative(),
        error: zod_1.z.string().optional(),
    })),
    coverage: zod_1.z.object({
        lines: zod_1.z.number().min(0).max(100),
        branches: zod_1.z.number().min(0).max(100),
        functions: zod_1.z.number().min(0).max(100),
        statements: zod_1.z.number().min(0).max(100),
    }).optional(),
});
//# sourceMappingURL=phase-artifacts.js.map
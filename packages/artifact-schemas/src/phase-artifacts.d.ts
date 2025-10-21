import { z } from 'zod';
/**
 * Intake Phase: Idea Spec
 * The initial idea submission from the user
 */
export declare const IdeaSpecSchema: any;
export type IdeaSpec = z.infer<typeof IdeaSpecSchema>;
/**
 * PRD Phase: Product Requirements Document
 * Comprehensive product specification
 */
export declare const PRDDocumentSchema: any;
export type PRDDocument = z.infer<typeof PRDDocumentSchema>;
/**
 * Architecture Phase: System Architecture Document
 */
export declare const ArchitectureDocumentSchema: any;
export type ArchitectureDocument = z.infer<typeof ArchitectureDocumentSchema>;
/**
 * QA Phase: Test Results
 */
export declare const TestResultsSchema: any;
export type TestResults = z.infer<typeof TestResultsSchema>;
//# sourceMappingURL=phase-artifacts.d.ts.map
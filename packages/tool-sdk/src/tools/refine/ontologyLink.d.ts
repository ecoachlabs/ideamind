/**
 * refine.ontologyLink
 *
 * Resolves entity mentions to canonical entities and links them.
 *
 * Features:
 * - Entity extraction from questions/answers
 * - Alias resolution ("PM" → "Product Manager")
 * - Entity linking to ontology
 * - Auto-create new entities
 * - Co-reference resolution
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
import { Pool } from 'pg';
export declare class OntologyLinkTool implements Tool {
    readonly metadata: ToolMetadata;
    private db;
    constructor(dbPool: Pool);
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Extract entities from text using LLM
     */
    private extractEntities;
    /**
     * Resolve aliases and link entities
     */
    private resolveAndLinkEntities;
    /**
     * Find entity by canonical name or alias
     */
    private findEntity;
    /**
     * Create new entity
     */
    private createEntity;
    /**
     * Link entity to question or answer
     */
    private linkEntity;
}
export declare function createOntologyLinkTool(dbPool: Pool): Tool;
//# sourceMappingURL=ontologyLink.d.ts.map
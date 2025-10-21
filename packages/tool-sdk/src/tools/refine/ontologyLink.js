"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OntologyLinkTool = void 0;
exports.createOntologyLinkTool = createOntologyLinkTool;
const types_1 = require("../../types");
const llm_1 = require("../../../agent-sdk/src/llm");
// ============================================================================
// ONTOLOGY LINK TOOL
// ============================================================================
class OntologyLinkTool {
    metadata = {
        name: 'refine.ontologyLink',
        description: 'Resolve entity mentions to canonical entities',
        category: types_1.ToolCategory.REFINERY,
        version: '1.0.0',
        inputSchema: {
            type: 'object',
            properties: {
                entityId: {
                    type: 'string',
                    description: 'Question or Answer ID',
                },
                entityType: {
                    type: 'string',
                    enum: ['question', 'answer'],
                    description: 'Type of entity',
                },
                text: {
                    type: 'string',
                    description: 'Text to extract entities from',
                },
                phase: {
                    type: 'string',
                    description: 'Phase context',
                },
            },
            required: ['entityId', 'entityType', 'text', 'phase'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                entities: { type: 'array' },
                newEntities: { type: 'number' },
                resolvedAliases: { type: 'number' },
            },
        },
        costUsd: 0.03, // LLM call for entity extraction
    };
    db;
    constructor(dbPool) {
        this.db = dbPool;
    }
    async execute(input) {
        const startTime = Date.now();
        const { entityId, entityType, text, phase } = input;
        try {
            // Step 1: Extract entities from text using LLM
            const extractedEntities = await this.extractEntities(text, phase);
            // Step 2: Resolve aliases and link to canonical entities
            const resolvedEntities = await this.resolveAndLinkEntities(extractedEntities, entityId, entityType);
            // Step 3: Count new entities created
            const newEntities = resolvedEntities.filter((e) => e.isNew).length;
            const resolvedAliases = resolvedEntities.filter((e) => e.wasAlias).length;
            return {
                result: {
                    entities: resolvedEntities.map((e) => ({
                        entityId: e.entityId,
                        canonical: e.canonical,
                        type: e.type,
                    })),
                    newEntities,
                    resolvedAliases,
                },
                metadata: {
                    toolName: this.metadata.name,
                    toolVersion: this.metadata.version,
                    executionTimeMs: Date.now() - startTime,
                    costUsd: this.metadata.costUsd,
                },
            };
        }
        catch (error) {
            console.error('[OntologyLink] Error:', error);
            throw error;
        }
    }
    /**
     * Extract entities from text using LLM
     */
    async extractEntities(text, phase) {
        const llm = llm_1.LLMFactory.createProvider(phase, 'question-agent');
        const prompt = `Extract domain entities from this text.

**Text**: "${text}"

**Entity Types**:
- **role**: Job titles, roles (e.g., Product Manager, Engineer, QA)
- **tool**: Technologies, frameworks, tools (e.g., React, PostgreSQL, Docker)
- **process**: Methodologies, workflows (e.g., Agile, CI/CD, Code Review)
- **artifact**: Documents, deliverables (e.g., PRD, Architecture Doc, Test Plan)
- **actor**: Systems, services, components (e.g., API Gateway, Database, User)
- **concept**: Abstract concepts (e.g., Performance, Security, Scalability)

**Your Task**:
Extract ALL entities mentioned, including abbreviations and aliases.

**Output Format** (JSON only):
{
  "entities": [
    {
      "mention": "PM",
      "canonical_guess": "Product Manager",
      "type": "role"
    },
    {
      "mention": "API",
      "canonical_guess": "Application Programming Interface",
      "type": "tool"
    }
  ]
}

Respond ONLY with valid JSON. No markdown, no explanation.`;
        try {
            const response = await llm.invoke({
                prompt,
                systemPrompt: 'You are an entity extraction expert. Output only valid JSON.',
                temperature: 0.2,
                maxTokens: 1024,
            });
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return [];
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.entities || [];
        }
        catch (error) {
            console.warn('[OntologyLink] Entity extraction failed:', error);
            return [];
        }
    }
    /**
     * Resolve aliases and link entities
     */
    async resolveAndLinkEntities(extractedEntities, entityId, entityType) {
        const resolved = [];
        for (const extracted of extractedEntities) {
            try {
                // Check if entity exists (by canonical or alias)
                const existing = await this.findEntity(extracted.canonical_guess, extracted.type, extracted.mention);
                let dbEntityId;
                let isNew = false;
                let wasAlias = false;
                if (existing) {
                    dbEntityId = existing.id;
                    wasAlias = extracted.mention !== existing.canonical;
                }
                else {
                    // Create new entity
                    dbEntityId = await this.createEntity(extracted.canonical_guess, extracted.type, extracted.mention);
                    isNew = true;
                }
                // Link entity to question/answer
                await this.linkEntity(entityId, entityType, dbEntityId);
                resolved.push({
                    entityId: dbEntityId,
                    canonical: extracted.canonical_guess,
                    type: extracted.type,
                    isNew,
                    wasAlias,
                });
            }
            catch (error) {
                console.warn(`[OntologyLink] Failed to resolve ${extracted.mention}:`, error);
            }
        }
        return resolved;
    }
    /**
     * Find entity by canonical name or alias
     */
    async findEntity(canonical, type, alias) {
        const query = `
      SELECT id, canonical
      FROM entities
      WHERE type = $1
        AND (canonical ILIKE $2 OR $3 = ANY(aliases))
      LIMIT 1
    `;
        const result = await this.db.query(query, [type, canonical, alias]);
        return result.rows.length > 0 ? result.rows[0] : null;
    }
    /**
     * Create new entity
     */
    async createEntity(canonical, type, alias) {
        // Use the upsert_entity function from the schema
        const query = `SELECT upsert_entity($1, $2, $3) AS entity_id`;
        const result = await this.db.query(query, [canonical, type, alias]);
        return result.rows[0].entity_id;
    }
    /**
     * Link entity to question or answer
     */
    async linkEntity(entityId, entityType, dbEntityId) {
        const table = entityType === 'question' ? 'q_entities' : 'a_entities';
        const column = entityType === 'question' ? 'question_id' : 'answer_id';
        const query = `
      INSERT INTO ${table} (${column}, entity_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `;
        await this.db.query(query, [entityId, dbEntityId]);
    }
}
exports.OntologyLinkTool = OntologyLinkTool;
// ============================================================================
// FACTORY
// ============================================================================
function createOntologyLinkTool(dbPool) {
    return new OntologyLinkTool(dbPool);
}
//# sourceMappingURL=ontologyLink.js.map
/**
 * Knowledge Refinery Configuration Example
 *
 * This file demonstrates how to configure and enable the Knowledge Refinery
 * system in your IdeaMine deployment.
 *
 * Copy this file to your deployment and customize as needed.
 */

import { Pool } from 'pg';
import { PRDCoordinator } from '../packages/orchestrator-core/src/phases/prd-coordinator';
import { ARCHCoordinator } from '../packages/orchestrator-core/src/phases/arch-coordinator';
import { RefineryGate } from '../packages/tool-sdk/src/refinery/refinery-client';

// ============================================================================
// DATABASE SETUP
// ============================================================================

/**
 * Create database connection pool
 * Used by both Knowledge Map and Refinery
 */
const dbPool = new Pool({
  // Required: PostgreSQL connection
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'knowledge_map',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,

  // Connection pool settings
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
dbPool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('Database connection failed:', err);
    process.exit(1);
  }
  console.log('Database connected successfully');
});

// ============================================================================
// REFINERY CONFIGURATION
// ============================================================================

/**
 * Configure Refinery gate thresholds (optional)
 * Default thresholds are production-ready for most use cases
 */
const refineryGate = new RefineryGate({
  fissionCoverage: 0.85,   // 85% coverage required for question decomposition
  fusionConsensus: 0.75,   // 75% consensus required for canonical answers
  acceptanceRate: 0.60,    // 60% of Q/A pairs must pass validation
});

/**
 * Phase-specific Refinery settings
 */
const refinerySettings = {
  // Enable Refinery for specific phases
  enabled: {
    INTAKE: false,       // Skip for intake - just collecting ideas
    IDEATION: true,      // Enable for ideation - helps organize ideas
    CRITIQUE: true,      // Enable for critique - consolidates feedback
    PRD: true,           // Enable for PRD - critical for requirements
    BIZDEV: true,        // Enable for bizdev - consolidates market analysis
    ARCH: true,          // Enable for architecture - critical for design decisions
    BUILD: false,        // Skip for build - mostly code artifacts
    CODING: false,       // Skip for coding - code doesn't need fusion
    QA: true,            // Enable for QA - consolidates test scenarios
    AESTHETIC: false,    // Skip for aesthetic - subjective feedback
    RELEASE: true,       // Enable for release - consolidates deployment info
    BETA: true,          // Enable for beta - consolidates user feedback
  },

  // Custom gate thresholds per phase (optional)
  customThresholds: {
    PRD: {
      fissionCoverage: 0.90,  // Higher threshold for PRD
      fusionConsensus: 0.80,
      acceptanceRate: 0.70,
    },
    ARCH: {
      fissionCoverage: 0.90,  // Higher threshold for ARCH
      fusionConsensus: 0.85,
      acceptanceRate: 0.75,
    },
  },
};

// ============================================================================
// COORDINATOR SETUP
// ============================================================================

/**
 * Example: PRD Phase with Refinery enabled
 */
export function createPRDCoordinator() {
  return new PRDCoordinator({
    // Knowledge Map settings
    enableKnowledgeMap: true,
    knowledgeMapConnectionString: process.env.DATABASE_URL,

    // Refinery settings
    enableRefinery: refinerySettings.enabled.PRD,  // ✅ Enable Refinery
    dbPool,                                         // ✅ Provide DB pool

    // Other coordinator settings
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
  });
}

/**
 * Example: ARCH Phase with Refinery enabled + custom thresholds
 */
export function createARCHCoordinator() {
  return new ARCHCoordinator({
    // Knowledge Map settings
    enableKnowledgeMap: true,
    knowledgeMapConnectionString: process.env.DATABASE_URL,

    // Refinery settings
    enableRefinery: refinerySettings.enabled.ARCH,
    dbPool,

    // Other coordinator settings
    maxGateRetries: 2,
    autoRetryOnGateFail: true,
  });
}

/**
 * Example: Disable Refinery for a specific phase
 */
export function createCODINGCoordinator() {
  return new PRDCoordinator({
    enableKnowledgeMap: true,
    knowledgeMapConnectionString: process.env.DATABASE_URL,

    // Refinery disabled for CODING phase
    enableRefinery: false,  // ❌ Disabled
    // dbPool not required when disabled
  });
}

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Required environment variables:
 *
 * # Database (Required)
 * DATABASE_URL=postgresql://user:pass@localhost:5432/knowledge_map
 * # or
 * DB_HOST=localhost
 * DB_PORT=5432
 * DB_NAME=knowledge_map
 * DB_USER=postgres
 * DB_PASSWORD=your_password
 *
 * # LLM Providers (Required - from LLM_PROVIDER_CONFIGURATION.md)
 * ANTHROPIC_API_KEY=sk-ant-...
 * OPENAI_API_KEY=sk-...
 * GOOGLE_API_KEY=...
 *
 * # Embeddings (Optional - defaults to OpenAI)
 * EMBEDDING_PROVIDER=openai  # or 'cohere'
 * EMBEDDING_MODEL=text-embedding-3-small  # or 'embed-english-v3.0'
 *
 * # Vector DB (Future - not yet implemented)
 * QDRANT_URL=http://localhost:6333
 * WEAVIATE_URL=http://localhost:8080
 */

// ============================================================================
// DEPLOYMENT CHECKLIST
// ============================================================================

/**
 * Before enabling Refinery in production:
 *
 * 1. ✅ Run database migration:
 *    psql $DATABASE_URL -f packages/tool-sdk/src/db/knowledge-map-refinery-extensions.sql
 *
 * 2. ✅ Install pg_trgm extension (for fuzzy deduplication):
 *    psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
 *
 * 3. ✅ Set environment variables (see above)
 *
 * 4. ✅ Test with one phase first:
 *    - Start with IDEATION or CRITIQUE (non-critical)
 *    - Monitor metrics in recorder
 *    - Check refinery_runs table for results
 *
 * 5. ✅ Monitor performance:
 *    - Latency: ~30s overhead per 10 Q/A pairs
 *    - Cost: ~$0.02 per Q/A pair
 *    - Quality: Check fission coverage and fusion consensus
 *
 * 6. ✅ Gradual rollout:
 *    Week 1: IDEATION, CRITIQUE
 *    Week 2: PRD, BIZDEV
 *    Week 3: ARCH, QA
 *    Week 4: RELEASE, BETA
 */

// ============================================================================
// MONITORING QUERIES
// ============================================================================

/**
 * Query Refinery metrics:
 *
 * -- Latest Refinery runs
 * SELECT run_id, phase, input_count, accepted_count,
 *        fission_coverage, fusion_consensus, gate_passed
 * FROM refinery_runs
 * ORDER BY started_at DESC
 * LIMIT 10;
 *
 * -- Fission trees created
 * SELECT id, root_question_id, phase, coverage, atom_count
 * FROM fission_trees
 * WHERE phase = 'PRD'
 * ORDER BY generated_at DESC
 * LIMIT 5;
 *
 * -- Fusion clusters
 * SELECT id, topic, consensus_confidence, cluster_purity,
 *        array_length(contributor_ids, 1) as answer_count
 * FROM fusion_clusters
 * WHERE phase = 'ARCH'
 * ORDER BY generated_at DESC
 * LIMIT 5;
 *
 * -- Entity resolution stats
 * SELECT type, COUNT(*) as count, COUNT(DISTINCT canonical) as unique_canonical
 * FROM entities
 * GROUP BY type
 * ORDER BY count DESC;
 *
 * -- Delta events
 * SELECT event_type, COUNT(*) as count
 * FROM km_delta_events
 * WHERE created_at > NOW() - INTERVAL '1 day'
 * GROUP BY event_type;
 */

// ============================================================================
// COST OPTIMIZATION
// ============================================================================

/**
 * Tips to reduce Refinery costs:
 *
 * 1. Use cheaper embedding models:
 *    - openai-small ($0.02/1M) vs openai-large ($0.13/1M)
 *    - cohere-v3 ($0.10/1M)
 *
 * 2. Adjust LLM providers per phase (see LLM_PROVIDER_CONFIGURATION.md):
 *    - Use gpt-4o-mini for non-critical phases
 *    - Use claude-3-5-haiku for validation
 *
 * 3. Disable Refinery for phases with low ROI:
 *    - BUILD, CODING, AESTHETIC (mostly code/subjective content)
 *
 * 4. Increase gate thresholds to reduce retries:
 *    - Lower fissionCoverage to 0.75 if acceptable
 *    - Lower fusionConsensus to 0.65 if acceptable
 *
 * 5. Batch process large volumes:
 *    - Use BatchEmbedTool for bulk embedding
 *    - Process Q/A in chunks of 100
 */

// ============================================================================
// TROUBLESHOOTING
// ============================================================================

/**
 * Common issues and solutions:
 *
 * Issue: "Pool is not defined"
 * Solution: npm install pg @types/pg
 *
 * Issue: "pg_trgm extension not available"
 * Solution: psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
 *
 * Issue: "Gate failed: fission_coverage_low"
 * Solution:
 *   - Review compound questions (may be too ambiguous)
 *   - Lower threshold: fissionCoverage: 0.75
 *   - Use o1-preview for better decomposition
 *
 * Issue: "Gate failed: fusion_consensus_low"
 * Solution:
 *   - Review answer conflicts (unclear requirements)
 *   - Improve QAA prompts
 *   - Ensure proper evidence citation
 *
 * Issue: "Refinery slow (>60s)"
 * Solution:
 *   - Check embedding API latency
 *   - Reduce Q/A batch size
 *   - Use faster LLM models (gpt-4o-mini)
 *
 * Issue: "High costs"
 * Solution:
 *   - Review LLM provider config (use cheaper models)
 *   - Disable Refinery for non-critical phases
 *   - Use openai-small for embeddings
 */

// ============================================================================
// EXPORTS
// ============================================================================

export {
  dbPool,
  refineryGate,
  refinerySettings,
};

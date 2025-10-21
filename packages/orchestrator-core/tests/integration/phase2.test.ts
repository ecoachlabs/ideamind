/**
 * Phase 2 Integration Tests
 *
 * Tests for Telemetry Logger, Dataset Curator, Docs Portal Agent, Explain Agent,
 * and Design Critic integrated with the Mothership Orchestrator.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { MothershipOrchestrator, MothershipConfig, OrchestrationContext } from '../../src/mothership-orchestrator';
import { TelemetryLogger } from '../../src/learning/telemetry-logger';
import { DatasetCurator } from '../../src/learning/dataset-curator';
import { DocsPortalAgent } from '../../src/agents/docs-portal';
import { ExplainAgent } from '../../src/agents/explain-agent';
import { DesignCriticAgent } from '../../src/agents/design-critic';

describe('Phase 2 Integration Tests', () => {
  let pool: Pool;
  let orchestrator: MothershipOrchestrator;

  beforeAll(async () => {
    // Create database pool
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ideamind_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Run migration 025 if not already applied
    try {
      await pool.query('SELECT 1 FROM telemetry_events LIMIT 1');
      await pool.query('SELECT 1 FROM dataset_artifacts LIMIT 1');
      await pool.query('SELECT 1 FROM documentation_portals LIMIT 1');
      await pool.query('SELECT 1 FROM decisions LIMIT 1');
      await pool.query('SELECT 1 FROM design_reviews LIMIT 1');
    } catch (err) {
      console.log('Migration 025 not applied, skipping schema check');
    }

    // Initialize Mothership Orchestrator with all Phase 2 components enabled
    const config: MothershipConfig = {
      databasePool: pool,
      enableAutonomy: true,
      enableGovernance: false,
      enablePerformance: true,
      enableRAG: false,
      enableSecurity: false,
      enableExperimentation: false,
      enableCompliance: false,
      enableCodeGraph: false,
      enableOps: false,
      // Phase 1 components
      enablePriorityScheduling: false,
      enableQuotaEnforcement: false,
      enableBudgetGuard: false,
      enableDeliberationQuality: false,
      enableHeartbeatMonitoring: false,
      // Phase 2 components
      enableTelemetry: true,
      enableDatasetCuration: true,
      enableDocsGeneration: true,
      enableExplainability: true,
      enableDesignCritique: true,
      // Learning-Ops
      enableLearningOps: false,
      // Memory Vault
      enableMemoryVault: false,
    };

    orchestrator = new MothershipOrchestrator(config);

    // Wait for initialization
    await new Promise<void>((resolve) => {
      orchestrator.once('initialized', () => resolve());
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM telemetry_events WHERE run_id LIKE \'test-%\'');
    await pool.query('DELETE FROM telemetry_metrics_rollup WHERE tenant_id = \'test-tenant\'');
    await pool.query('DELETE FROM dataset_artifacts WHERE run_id LIKE \'test-%\'');
    await pool.query('DELETE FROM dataset_quality_metrics WHERE artifact_id LIKE \'test-%\'');
    await pool.query('DELETE FROM documentation_portals WHERE run_id LIKE \'test-%\'');
    await pool.query('DELETE FROM documentation_sections WHERE portal_id IN (SELECT id FROM documentation_portals WHERE run_id LIKE \'test-%\')');
    await pool.query('DELETE FROM decisions WHERE run_id LIKE \'test-%\'');
    await pool.query('DELETE FROM explanation_cache WHERE decision_id LIKE \'test-%\'');
    await pool.query('DELETE FROM design_reviews WHERE run_id LIKE \'test-%\'');
    await pool.query('DELETE FROM design_issues WHERE review_id IN (SELECT id FROM design_reviews WHERE run_id LIKE \'test-%\')');
  });

  // ============================================================================
  // Telemetry Logger Tests
  // ============================================================================

  describe('Telemetry Logger', () => {
    it('should log events during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-telemetry-1',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that telemetry events were logged
      const eventResult = await pool.query(
        `SELECT * FROM telemetry_events
         WHERE run_id = $1
         ORDER BY recorded_at`,
        [context.runId]
      );

      expect(eventResult.rows.length).toBeGreaterThan(0);

      // Should have at least orchestration.start and orchestration.complete
      const eventTypes = eventResult.rows.map((r) => r.event_type);
      expect(eventTypes).toContain('orchestration.start');
      expect(eventTypes).toContain('orchestration.complete');
    });

    it('should record metrics during orchestration', async () => {
      const telemetry = new TelemetryLogger(pool);

      await telemetry.recordMetric({
        tenantId: 'test-tenant',
        metricName: 'test_metric',
        value: 123.45,
        metricType: 'gauge',
        tags: { phase: 'test' },
      });

      // Flush buffer
      await telemetry['flushMetricBuffer']();

      // Check that metric was recorded in rollup
      const rollupResult = await pool.query(
        `SELECT * FROM telemetry_metrics_rollup
         WHERE tenant_id = 'test-tenant' AND metric_name = 'test_metric'`
      );

      expect(rollupResult.rows.length).toBeGreaterThan(0);
      expect(parseFloat(rollupResult.rows[0].avg)).toBeCloseTo(123.45, 2);
    });

    it('should query time series data', async () => {
      const telemetry = new TelemetryLogger(pool);

      // Record several metrics
      for (let i = 0; i < 5; i++) {
        await telemetry.recordMetric({
          tenantId: 'test-tenant',
          metricName: 'duration_ms',
          value: 100 + i * 10,
          metricType: 'histogram',
        });
      }

      const timeSeries = await telemetry.getMetricTimeSeries('test-tenant', 'duration_ms', 1);

      expect(timeSeries.length).toBeGreaterThan(0);
      expect(timeSeries[0]).toHaveProperty('timestamp');
      expect(timeSeries[0]).toHaveProperty('value');
    });

    it('should calculate aggregated metrics', async () => {
      const telemetry = new TelemetryLogger(pool);

      // Record metrics with varying values
      const values = [10, 20, 30, 40, 50];
      for (const value of values) {
        await telemetry.recordMetric({
          tenantId: 'test-tenant',
          metricName: 'test_agg',
          value,
          metricType: 'histogram',
        });
      }

      const agg = await telemetry.getAggregatedMetrics('test-tenant', ['test_agg'], 1);

      if (agg.length > 0) {
        expect(agg[0].count).toBeGreaterThan(0);
        expect(agg[0].avg).toBeGreaterThan(0);
        expect(agg[0].min).toBeLessThanOrEqual(agg[0].max);
      }
    });

    it('should track tenant event statistics', async () => {
      const telemetry = new TelemetryLogger(pool);

      // Log various events
      await telemetry.logEvent({
        runId: 'test-stats',
        tenantId: 'test-tenant',
        eventType: 'test.event',
        severity: 'info',
      });

      await telemetry.logEvent({
        runId: 'test-stats',
        tenantId: 'test-tenant',
        eventType: 'test.error',
        severity: 'error',
      });

      const stats = await telemetry.getTenantStats('test-tenant', 1);

      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.eventsByType).toHaveProperty('test.event');
      expect(stats.eventsBySeverity).toHaveProperty('info');
    });
  });

  // ============================================================================
  // Dataset Curator Tests
  // ============================================================================

  describe('Dataset Curator', () => {
    it('should ingest and curate artifacts during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-curator-1',
        tenantId: 'test-tenant',
        phase: 'code',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that artifact was ingested
      const artifactResult = await pool.query(
        `SELECT * FROM dataset_artifacts WHERE run_id = $1`,
        [context.runId]
      );

      expect(artifactResult.rows.length).toBeGreaterThan(0);
    });

    it('should detect synthetic content', async () => {
      const curator = new DatasetCurator(pool);

      const syntheticText = `
        As an AI language model, I can help you with that.
        My training data includes information about TypeScript.
        I cannot actually execute code, but I can provide examples.
      `;

      const result = await curator.detectSynthetic(syntheticText);

      expect(result.isSynthetic).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should score artifact quality', async () => {
      const curator = new DatasetCurator(pool);

      const goodCodeArtifact = `
        async function processPayment(amount: number, currency: string) {
          if (amount <= 0) throw new Error('Invalid amount');

          const transaction = await paymentGateway.charge({
            amount,
            currency,
            idempotencyKey: generateIdempotencyKey(),
          });

          return transaction;
        }
      `;

      await curator.ingestArtifact({
        artifactId: 'test-quality-1',
        contentType: 'code',
        content: goodCodeArtifact,
        origin: 'unknown',
        runId: 'test-run',
        tenantId: 'test-tenant',
      });

      const scores = await curator.scoreQuality({
        artifactId: 'test-quality-1',
        contentType: 'code',
        content: goodCodeArtifact,
        origin: 'unknown',
      } as any);

      expect(scores.overall).toBeGreaterThan(0);
      expect(scores.toxicity).toBeLessThan(0.5);
      expect(scores.hasPII).toBe(false);
    });

    it('should detect PII in artifacts', async () => {
      const curator = new DatasetCurator(pool);

      const contentWithPII = `
        User email: john.doe@example.com
        Phone: 555-123-4567
        SSN: 123-45-6789
      `;

      const scores = await curator.scoreQuality({
        artifactId: 'test-pii',
        contentType: 'text',
        content: contentWithPII,
        origin: 'unknown',
      } as any);

      expect(scores.hasPII).toBe(true);
      expect(scores.piiTypes.length).toBeGreaterThan(0);
      expect(scores.piiTypes).toContain('email');
    });

    it('should bulk curate artifacts with criteria', async () => {
      const curator = new DatasetCurator(pool);

      // Ingest multiple artifacts
      for (let i = 0; i < 5; i++) {
        await curator.ingestArtifact({
          artifactId: `test-bulk-${i}`,
          contentType: 'code',
          content: `function test${i}() { return ${i}; }`,
          origin: 'unknown',
          runId: 'test-bulk',
          tenantId: 'test-tenant',
        });
      }

      const result = await curator.bulkCurate(
        {
          minQualityScore: 0.5,
          maxToxicityScore: 0.3,
          allowPII: false,
          allowSynthetic: true,
        },
        'test-curator'
      );

      expect(result.approved + result.rejected + result.flagged).toBeGreaterThan(0);
    });

    it('should get dataset statistics', async () => {
      const curator = new DatasetCurator(pool);

      // Ingest and curate an artifact
      await curator.ingestArtifact({
        artifactId: 'test-stats-1',
        contentType: 'code',
        content: 'function test() { return true; }',
        origin: 'unknown',
        runId: 'test-stats',
        tenantId: 'test-tenant',
      });

      await curator.curateArtifact({
        artifactId: 'test-stats-1',
        decision: 'approve',
        reason: 'Good quality',
        curatedBy: 'test',
      });

      const stats = await curator.getDatasetStats();

      expect(stats.totalArtifacts).toBeGreaterThan(0);
      expect(stats.statusBreakdown.approved).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Docs Portal Agent Tests
  // ============================================================================

  describe('Docs Portal Agent', () => {
    it('should generate documentation portal during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-docs-1',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that docs portal was generated
      const portalResult = await pool.query(
        `SELECT * FROM documentation_portals WHERE run_id = $1`,
        [context.runId]
      );

      expect(portalResult.rows.length).toBeGreaterThan(0);
      const portal = portalResult.rows[0];
      expect(portal.status).toBe('completed');
    });

    it('should generate API reference from OpenAPI spec', async () => {
      const docsPortal = new DocsPortalAgent(pool);

      const mockOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
      };

      const artifacts = [{
        type: 'openapi',
        content: JSON.stringify(mockOpenAPISpec),
        name: 'api-spec',
      }];

      const sections = await docsPortal['generateAPIReference'](artifacts, 'test-portal');

      expect(sections.length).toBeGreaterThan(0);
      expect(sections[0].sectionType).toBe('api');
    });

    it('should generate quickstart guide', async () => {
      const docsPortal = new DocsPortalAgent(pool);

      const quickstart = await docsPortal['generateQuickstart']('test-run', 'test-portal');

      expect(quickstart.sectionType).toBe('guide');
      expect(quickstart.title).toContain('Quickstart');
      expect(quickstart.content.length).toBeGreaterThan(0);
    });

    it('should score documentation completeness', async () => {
      const docsPortal = new DocsPortalAgent(pool);

      const portal = {
        id: 'test-portal',
        runId: 'test-run',
        portalName: 'Test Docs',
        portalVersion: '1.0.0',
        status: 'completed' as const,
        apiDocsCount: 5,
        guideCount: 2,
        exampleCount: 3,
        sdkCount: 1,
      };

      const sections = [
        { sectionType: 'api', content: 'API docs...' },
        { sectionType: 'guide', content: 'Guide content...' },
      ];

      const score = docsPortal['scoreCompleteness'](portal, sections as any);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should score documentation clarity', async () => {
      const docsPortal = new DocsPortalAgent(pool);

      const clearSections = [
        {
          title: 'Getting Started',
          content: 'This guide helps you get started with our API. First, obtain an API key. Then, make your first request using curl.',
        },
        {
          title: 'Authentication',
          content: 'All API requests require authentication via Bearer token in the Authorization header.',
        },
      ];

      const score = docsPortal['scoreClarity'](clearSections as any);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Explain Agent Tests
  // ============================================================================

  describe('Explain Agent', () => {
    it('should record decisions during orchestration', async () => {
      const context: OrchestrationContext = {
        runId: 'test-explain-1',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that decisions were recorded
      const decisionResult = await pool.query(
        `SELECT * FROM decisions WHERE run_id = $1`,
        [context.runId]
      );

      expect(decisionResult.rows.length).toBeGreaterThan(0);

      // Should have design review and model selection decisions
      const decisionTypes = decisionResult.rows.map((r) => r.decision_type);
      expect(decisionTypes.length).toBeGreaterThan(0);
    });

    it('should generate explanations for different audiences', async () => {
      const explainAgent = new ExplainAgent(pool);

      // Record a decision
      await explainAgent.recordDecision({
        decisionId: 'test-decision-1',
        runId: 'test-run',
        tenantId: 'test-tenant',
        decisionType: 'model_selection',
        decisionMaker: 'model-router',
        decisionSummary: 'Selected Claude Sonnet 4',
        rationale: 'Best balance of cost and quality for coding tasks',
        inputContext: { skill: 'coding', budget: 10 },
        alternatives: [
          { option: 'claude-opus-4', score: 0.9, reason: 'Higher quality but more expensive' },
          { option: 'claude-sonnet-4', score: 0.85, reason: 'Best cost/quality balance' },
        ],
        selectedOption: 'claude-sonnet-4',
        outcome: 'success',
      });

      // Generate explanations for different audiences
      const developerExplanation = await explainAgent.explainDecision('test-decision-1', {
        audience: 'developer',
        format: 'technical',
      });

      const executiveExplanation = await explainAgent.explainDecision('test-decision-1', {
        audience: 'executive',
        format: 'summary',
      });

      expect(developerExplanation.rationale).toContain('Input Context');
      expect(executiveExplanation.rationale.length).toBeLessThan(developerExplanation.rationale.length);
    });

    it('should cache explanations', async () => {
      const explainAgent = new ExplainAgent(pool);

      await explainAgent.recordDecision({
        decisionId: 'test-cache-1',
        runId: 'test-run',
        tenantId: 'test-tenant',
        decisionType: 'routing',
        decisionMaker: 'router',
        decisionSummary: 'Routed to service A',
        rationale: 'Service A has lower latency',
        inputContext: {},
        alternatives: [],
        selectedOption: 'service-a',
      });

      // First call - generates and caches
      const explanation1 = await explainAgent.explainDecision('test-cache-1', {
        audience: 'developer',
        format: 'detailed',
      });

      // Second call - should use cache
      const explanation2 = await explainAgent.explainDecision('test-cache-1', {
        audience: 'developer',
        format: 'detailed',
      });

      expect(explanation1).toEqual(explanation2);

      // Check cache entry exists
      const cacheResult = await pool.query(
        `SELECT * FROM explanation_cache WHERE decision_id = 'test-cache-1'`
      );

      expect(cacheResult.rows.length).toBeGreaterThan(0);
    });

    it('should trace decision path', async () => {
      const explainAgent = new ExplainAgent(pool);

      // Create decision chain
      await explainAgent.recordDecision({
        decisionId: 'parent-decision',
        runId: 'test-run',
        decisionType: 'routing',
        decisionMaker: 'router',
        decisionSummary: 'Initial routing decision',
        rationale: 'Routed based on load',
        inputContext: {},
        alternatives: [],
        selectedOption: 'route-a',
      });

      await explainAgent.recordDecision({
        decisionId: 'child-decision',
        runId: 'test-run',
        decisionType: 'model_selection',
        decisionMaker: 'model-router',
        decisionSummary: 'Model selection after routing',
        rationale: 'Selected model for route A',
        inputContext: {},
        alternatives: [],
        selectedOption: 'model-1',
        parentDecisionId: 'parent-decision',
      });

      const path = await explainAgent.traceDecisionPath('child-decision');

      expect(path.length).toBe(2);
      expect(path[0].decisionId).toBe('child-decision');
      expect(path[1].decisionId).toBe('parent-decision');
    });

    it('should get decision statistics', async () => {
      const explainAgent = new ExplainAgent(pool);

      // Record several decisions
      for (let i = 0; i < 3; i++) {
        await explainAgent.recordDecision({
          decisionId: `test-stats-${i}`,
          runId: 'test-stats-run',
          tenantId: 'test-tenant',
          decisionType: 'model_selection',
          decisionMaker: 'router',
          decisionSummary: `Decision ${i}`,
          rationale: 'Test decision',
          inputContext: {},
          alternatives: [],
          selectedOption: 'option-1',
          outcome: i % 2 === 0 ? 'success' : 'failure',
        });
      }

      const stats = await explainAgent.getDecisionStats({
        runId: 'test-stats-run',
        tenantId: 'test-tenant',
      });

      expect(stats.totalDecisions).toBeGreaterThanOrEqual(3);
      expect(stats.byType.model_selection).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================================
  // Design Critic Tests
  // ============================================================================

  describe('Design Critic', () => {
    it('should review PRD during plan phase', async () => {
      const context: OrchestrationContext = {
        runId: 'test-critic-1',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that design review was stored
      const reviewResult = await pool.query(
        `SELECT * FROM design_reviews WHERE run_id = $1`,
        [context.runId]
      );

      expect(reviewResult.rows.length).toBeGreaterThan(0);
      const review = reviewResult.rows[0];
      expect(review.overall_score).toBeGreaterThanOrEqual(0);
      expect(review.overall_score).toBeLessThanOrEqual(100);
    });

    it('should detect critical design issues', async () => {
      const designCritic = new DesignCriticAgent(pool);

      const poorPRD = `
        # Product Requirements

        ## Features
        - User can login
        - Display data
        - Save information
      `;

      const review = await designCritic.reviewPRD(poorPRD, 'test-poor-prd', 'test-run');

      expect(review.counts.critical).toBeGreaterThan(0);
      expect(review.scores.overall).toBeLessThan(70);

      // Should flag missing accessibility, performance, and security requirements
      const issueCategories = review.issues.map((i) => i.category);
      expect(issueCategories).toContain('accessibility');
    });

    it('should score comprehensive PRD highly', async () => {
      const designCritic = new DesignCriticAgent(pool);

      const comprehensivePRD = `
        # Product Requirements Document

        ## User Experience
        - Primary persona: Software developers
        - User flow: Login → Dashboard → Project selection → Code editor
        - Error handling: Clear error messages with recovery suggestions
        - Mobile support: Responsive design for tablets and smartphones

        ## Accessibility
        - WCAG 2.1 AA compliance required
        - Keyboard navigation for all interactions
        - Screen reader support with ARIA labels

        ## Performance
        - Performance budget: Initial load < 2s, interactions < 200ms
        - CDN for static assets, Redis caching for API responses
        - Lazy loading for code editor components

        ## Scalability
        - Scale target: 100,000 concurrent users
        - Horizontal database scaling with read replicas
        - Rate limiting: 100 requests per minute per user

        ## Security
        - OAuth 2.0 authentication with refresh tokens
        - AES-256 encryption for data at rest
        - Input validation and sanitization for all user inputs
      `;

      const review = await designCritic.reviewPRD(comprehensivePRD, 'test-good-prd', 'test-run');

      expect(review.scores.overall).toBeGreaterThan(70);
      expect(review.counts.critical).toBe(0);
    });

    it('should store issues with suggestions', async () => {
      const designCritic = new DesignCriticAgent(pool);

      const prd = `
        # Product Requirements
        - Build a web app
      `;

      const review = await designCritic.reviewPRD(prd, 'test-issues', 'test-run');

      // Check that issues were stored in database
      const issuesResult = await pool.query(
        `SELECT * FROM design_issues WHERE review_id = $1`,
        [review.id]
      );

      expect(issuesResult.rows.length).toBeGreaterThan(0);

      // Each issue should have a suggestion
      for (const issue of issuesResult.rows) {
        expect(issue.suggestion).toBeTruthy();
        expect(issue.suggestion.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // Cross-Component Integration Tests
  // ============================================================================

  describe('Cross-Component Integration', () => {
    it('should record telemetry for design review decisions', async () => {
      const context: OrchestrationContext = {
        runId: 'test-cross-1',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that telemetry was logged
      const telemetryResult = await pool.query(
        `SELECT * FROM telemetry_events
         WHERE run_id = $1 AND event_type = 'orchestration.start'`,
        [context.runId]
      );

      expect(telemetryResult.rows.length).toBeGreaterThan(0);

      // Check that design review decision was recorded
      const decisionResult = await pool.query(
        `SELECT * FROM decisions
         WHERE run_id = $1 AND decision_id LIKE 'design-review-%'`,
        [context.runId]
      );

      expect(decisionResult.rows.length).toBeGreaterThan(0);
    });

    it('should curate artifacts and log metrics', async () => {
      const context: OrchestrationContext = {
        runId: 'test-cross-2',
        tenantId: 'test-tenant',
        phase: 'code',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that artifact was curated
      const artifactResult = await pool.query(
        `SELECT * FROM dataset_artifacts WHERE run_id = $1`,
        [context.runId]
      );

      expect(artifactResult.rows.length).toBeGreaterThan(0);

      // Check that metric was logged
      const metricResult = await pool.query(
        `SELECT * FROM telemetry_metrics_rollup
         WHERE tenant_id = $1 AND metric_name = 'artifacts_approved'`,
        ['test-tenant']
      );

      expect(metricResult.rows.length).toBeGreaterThan(0);
    });

    it('should generate docs and record explanation', async () => {
      const context: OrchestrationContext = {
        runId: 'test-cross-3',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 10, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that docs portal was generated
      const portalResult = await pool.query(
        `SELECT * FROM documentation_portals WHERE run_id = $1`,
        [context.runId]
      );

      expect(portalResult.rows.length).toBeGreaterThan(0);

      // Check that docs generation decision was recorded
      const decisionResult = await pool.query(
        `SELECT * FROM decisions
         WHERE run_id = $1 AND decision_id LIKE 'docs-generation-%'`,
        [context.runId]
      );

      expect(decisionResult.rows.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Full Orchestration Workflow Tests
  // ============================================================================

  describe('Full Orchestration Workflow', () => {
    it('should execute complete workflow with all Phase 2 components', async () => {
      const context: OrchestrationContext = {
        runId: 'test-full-workflow-p2',
        tenantId: 'test-tenant',
        phase: 'build',
        budget: { maxCostUSD: 20, maxDuration: 300000 },
      };

      // Listen for all Phase 2 events
      const events: string[] = [];

      orchestrator.on('artifact-curated', () => events.push('artifact-curated'));
      orchestrator.on('portal-generated', () => events.push('portal-generated'));
      orchestrator.on('design-review-complete', () => events.push('design-review-complete'));

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.costs.totalUSD).toBeGreaterThan(0);

      // Check that all Phase 2 components participated
      const telemetryExists = await pool.query(
        'SELECT 1 FROM telemetry_events WHERE run_id = $1 LIMIT 1',
        [context.runId]
      );
      const artifactExists = await pool.query(
        'SELECT 1 FROM dataset_artifacts WHERE run_id = $1 LIMIT 1',
        [context.runId]
      );
      const docsExists = await pool.query(
        'SELECT 1 FROM documentation_portals WHERE run_id = $1 LIMIT 1',
        [context.runId]
      );
      const decisionExists = await pool.query(
        'SELECT 1 FROM decisions WHERE run_id = $1 LIMIT 1',
        [context.runId]
      );

      expect(telemetryExists.rows.length).toBeGreaterThan(0);
      expect(artifactExists.rows.length).toBeGreaterThan(0);
      expect(docsExists.rows.length).toBeGreaterThan(0);
      expect(decisionExists.rows.length).toBeGreaterThan(0);
    });

    it('should maintain explainability throughout workflow', async () => {
      const context: OrchestrationContext = {
        runId: 'test-explainability-p2',
        tenantId: 'test-tenant',
        phase: 'plan',
        budget: { maxCostUSD: 15, maxDuration: 300000 },
      };

      const result = await orchestrator.orchestrate(context);

      expect(result.status).toBe('success');

      // Check that we can explain all decisions
      const decisions = await pool.query(
        'SELECT decision_id FROM decisions WHERE run_id = $1',
        [context.runId]
      );

      expect(decisions.rows.length).toBeGreaterThan(0);

      const explainAgent = new ExplainAgent(pool);

      for (const row of decisions.rows) {
        const explanation = await explainAgent.explainDecision(row.decision_id, {
          audience: 'developer',
        });

        expect(explanation.decision).toBeTruthy();
        expect(explanation.rationale).toBeTruthy();
      }
    });

    it('should track quality metrics across all phases', async () => {
      const phases = ['plan', 'design', 'code', 'build'];
      const allMetrics: any[] = [];

      for (const phase of phases) {
        const context: OrchestrationContext = {
          runId: `test-quality-${phase}`,
          tenantId: 'test-tenant',
          phase,
          budget: { maxCostUSD: 10, maxDuration: 300000 },
        };

        const result = await orchestrator.orchestrate(context);
        expect(result.status).toBe('success');

        // Collect metrics
        const metrics = await pool.query(
          `SELECT metric_name, avg FROM telemetry_metrics_rollup
           WHERE tenant_id = $1`,
          ['test-tenant']
        );

        allMetrics.push(...metrics.rows);
      }

      // Should have metrics from all phases
      expect(allMetrics.length).toBeGreaterThan(0);
    });
  });
});

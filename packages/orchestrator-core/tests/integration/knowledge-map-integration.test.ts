/**
 * Knowledge Map Integration Tests
 *
 * Tests the full KM pipeline including:
 * - Carry-over logic
 * - Contradiction detection
 * - Management tools (query, supersede, resolve)
 */

import { Pool } from 'pg';
import {
  KMCarryOverManager,
  KMQueryTool,
  KMSupersedeTool,
  KMResolveTool,
} from '../../src/knowledge-map';
import { ContradictionScanTool } from '../../../tool-sdk/src/tools/guard/contradiction-scan';

// Test configuration
const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/ideamine_test';
let dbPool: Pool;

// Test data
const TEST_RUN_ID = `TEST-RUN-${Date.now()}`;
const TEST_PHASE = 'PRD';

describe('Knowledge Map Integration', () => {
  beforeAll(async () => {
    // Initialize database connection
    dbPool = new Pool({
      connectionString: TEST_DB_URL,
    });

    // Verify database connection
    try {
      await dbPool.query('SELECT 1');
      console.log('[Test] Database connection established');
    } catch (error) {
      console.error('[Test] Failed to connect to database:', error);
      throw error;
    }

    // Clean up test data
    await cleanupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();

    // Close database connection
    await dbPool.end();
  });

  /**
   * Test 1: Carry-Over Logic
   */
  describe('Carry-Over Logic', () => {
    it('should load unresolved questions from previous phases', async () => {
      const carryOverManager = new KMCarryOverManager(dbPool);

      // Create test questions in IDEATION phase
      await createTestQuestion({
        id: 'Q-IDEATION-001',
        phase: 'IDEATION',
        text: 'What are the key user personas?',
        status: 'open',
        priority: 0.9,
      });

      await createTestQuestion({
        id: 'Q-IDEATION-002',
        phase: 'IDEATION',
        text: 'What are the main pain points?',
        status: 'partial',
        priority: 0.8,
      });

      // Load carry-over questions for PRD phase
      const carryOverQuestions = await carryOverManager.getCarryOverQuestions({
        currentPhase: 'PRD',
        runId: TEST_RUN_ID,
        maxQuestions: 50,
        minPriority: 0.5,
      });

      expect(carryOverQuestions.length).toBeGreaterThanOrEqual(2);
      expect(carryOverQuestions.some((q) => q.id === 'Q-IDEATION-001')).toBe(true);
      expect(carryOverQuestions.some((q) => q.id === 'Q-IDEATION-002')).toBe(true);
    });

    it('should update question statuses based on answer acceptance', async () => {
      const carryOverManager = new KMCarryOverManager(dbPool);

      // Create test question with accepted answer
      const questionId = 'Q-PRD-001';
      const answerId = 'A-PRD-001';

      await createTestQuestion({
        id: questionId,
        phase: TEST_PHASE,
        text: 'What is the target latency?',
        status: 'open',
        priority: 0.9,
      });

      await createTestAnswer({
        id: answerId,
        question_id: questionId,
        answer: 'Target latency is < 200ms',
      });

      await createTestBinding({
        question_id: questionId,
        answer_id: answerId,
        decision: 'accept',
        score_consistency: 1.0,
      });

      // Update statuses
      const counts = await carryOverManager.updatePhaseQuestionStatuses(TEST_PHASE, TEST_RUN_ID);

      expect(counts.resolved).toBeGreaterThanOrEqual(1);

      // Verify question status
      const result = await dbPool.query('SELECT status FROM questions WHERE id = $1', [questionId]);
      expect(result.rows[0].status).toBe('resolved');
    });

    it('should mark questions as carried over', async () => {
      const carryOverManager = new KMCarryOverManager(dbPool);

      const questionId = 'Q-IDEATION-003';

      await createTestQuestion({
        id: questionId,
        phase: 'IDEATION',
        text: 'What is the value proposition?',
        status: 'open',
        priority: 0.8,
      });

      await carryOverManager.markAsCarriedOver(questionId, 'IDEATION', 'PRD');

      // Verify edge was created
      const edgeResult = await dbPool.query(
        `SELECT * FROM km_edges WHERE edge_type = 'carried_over' AND source_node_id = $1`,
        [questionId]
      );

      expect(edgeResult.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * Test 2: Contradiction Detection
   */
  describe('Contradiction Detection', () => {
    it('should detect numeric value conflicts', async () => {
      const contradictionTool = new ContradictionScanTool(TEST_PHASE);

      // Create existing answer
      const existingQuestionId = 'Q-PRD-010';
      const existingAnswerId = 'A-PRD-010';

      await createTestQuestion({
        id: existingQuestionId,
        phase: TEST_PHASE,
        text: 'What is the maximum response time?',
        status: 'resolved',
        priority: 0.9,
      });

      await createTestAnswer({
        id: existingAnswerId,
        question_id: existingQuestionId,
        answer: 'Maximum response time is 500ms',
      });

      await createTestBinding({
        question_id: existingQuestionId,
        answer_id: existingAnswerId,
        decision: 'accept',
        score_consistency: 1.0,
      });

      // Test new answer with conflicting value
      const result = await contradictionTool.execute({
        question: 'What is the maximum response time?',
        answer: 'Maximum response time is 100ms',
        phase: TEST_PHASE,
        runId: TEST_RUN_ID,
        dbPool,
        useLLM: false, // Use rule-based for faster testing
      });

      expect(result.result.consistencyScore).toBe(0.0);
      expect(result.result.conflictsDetected).toBe(true);
      expect(result.result.conflictCount).toBeGreaterThanOrEqual(1);
    });

    it('should return consistency=1.0 when no conflicts', async () => {
      const contradictionTool = new ContradictionScanTool(TEST_PHASE);

      const result = await contradictionTool.execute({
        question: 'What color is the sky?',
        answer: 'The sky is blue',
        phase: TEST_PHASE,
        runId: TEST_RUN_ID,
        dbPool,
        useLLM: false,
      });

      expect(result.result.consistencyScore).toBe(1.0);
      expect(result.result.conflictsDetected).toBe(false);
    });
  });

  /**
   * Test 3: KM Query Tool
   */
  describe('KM Query Tool', () => {
    it('should query knowledge by text search', async () => {
      const queryTool = new KMQueryTool(dbPool);

      // Create test knowledge node
      const questionId = 'Q-PRD-020';
      const answerId = 'A-PRD-020';
      const nodeId = `KM-${questionId}-${answerId}`;

      await createTestQuestion({
        id: questionId,
        phase: TEST_PHASE,
        text: 'What are the scalability requirements?',
        status: 'resolved',
        priority: 0.9,
        tags: ['scalability', 'performance'],
      });

      await createTestAnswer({
        id: answerId,
        question_id: questionId,
        answer: 'System must support 10,000 concurrent users',
      });

      await createTestBinding({
        question_id: questionId,
        answer_id: answerId,
        decision: 'accept',
        score_grounding: 0.9,
        score_completeness: 0.85,
        score_specificity: 0.9,
        score_consistency: 1.0,
      });

      await createTestKMNode({
        id: nodeId,
        question_id: questionId,
        answer_id: answerId,
      });

      // Query by text
      const results = await queryTool.queryByText({
        searchText: 'scalability',
        phase: TEST_PHASE,
        limit: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.questionId === questionId)).toBe(true);
    });

    it('should get unresolved questions', async () => {
      const queryTool = new KMQueryTool(dbPool);

      // Create unresolved question
      await createTestQuestion({
        id: 'Q-PRD-021',
        phase: TEST_PHASE,
        text: 'What is the deployment strategy?',
        status: 'open',
        priority: 0.7,
      });

      const unresolved = await queryTool.getUnresolvedQuestions(TEST_PHASE);

      expect(unresolved.length).toBeGreaterThanOrEqual(1);
      expect(unresolved.some((q) => q.id === 'Q-PRD-021')).toBe(true);
    });
  });

  /**
   * Test 4: KM Supersede Tool
   */
  describe('KM Supersede Tool', () => {
    it('should supersede old node with new node', async () => {
      const supersedeTool = new KMSupersedeTool(dbPool);

      // Create old and new nodes
      const oldQuestionId = 'Q-PRD-030';
      const oldAnswerId = 'A-PRD-030';
      const oldNodeId = `KM-${oldQuestionId}-${oldAnswerId}`;

      const newAnswerId = 'A-PRD-031';
      const newNodeId = `KM-${oldQuestionId}-${newAnswerId}`;

      await createTestQuestion({
        id: oldQuestionId,
        phase: TEST_PHASE,
        text: 'What is the data retention policy?',
        status: 'resolved',
        priority: 0.8,
      });

      await createTestAnswer({
        id: oldAnswerId,
        question_id: oldQuestionId,
        answer: 'Data retained for 30 days',
      });

      await createTestBinding({
        question_id: oldQuestionId,
        answer_id: oldAnswerId,
        decision: 'accept',
        score_consistency: 1.0,
      });

      await createTestKMNode({
        id: oldNodeId,
        question_id: oldQuestionId,
        answer_id: oldAnswerId,
      });

      // Create new answer
      await createTestAnswer({
        id: newAnswerId,
        question_id: oldQuestionId,
        answer: 'Data retained for 90 days (updated policy)',
      });

      await createTestBinding({
        question_id: oldQuestionId,
        answer_id: newAnswerId,
        decision: 'accept',
        score_consistency: 1.0,
      });

      await createTestKMNode({
        id: newNodeId,
        question_id: oldQuestionId,
        answer_id: newAnswerId,
      });

      // Supersede old with new
      const result = await supersedeTool.supersede({
        oldNodeId,
        newNodeId,
        reason: 'Updated data retention policy',
        supersededBy: 'TestAgent',
      });

      expect(result.success).toBe(true);
      expect(result.oldNodeId).toBe(oldNodeId);
      expect(result.newNodeId).toBe(newNodeId);

      // Verify old node is inactive
      const nodeResult = await dbPool.query('SELECT is_active, superseded_by FROM km_nodes WHERE id = $1', [
        oldNodeId,
      ]);
      expect(nodeResult.rows[0].is_active).toBe(false);
      expect(nodeResult.rows[0].superseded_by).toBe(newNodeId);
    });
  });

  /**
   * Test 5: KM Resolve Tool
   */
  describe('KM Resolve Tool', () => {
    it('should resolve contradiction by choosing answer', async () => {
      const resolveTool = new KMResolveTool(dbPool);

      // Create question with conflicting answers
      const questionId = 'Q-PRD-040';
      const answer1Id = 'A-PRD-040';
      const answer2Id = 'A-PRD-041';

      await createTestQuestion({
        id: questionId,
        phase: TEST_PHASE,
        text: 'What is the max file upload size?',
        status: 'partial',
        priority: 0.8,
      });

      // Both answers initially accepted (conflict!)
      await createTestAnswer({
        id: answer1Id,
        question_id: questionId,
        answer: 'Max upload size is 10MB',
      });

      await createTestBinding({
        question_id: questionId,
        answer_id: answer1Id,
        decision: 'accept',
        score_consistency: 1.0,
      });

      await createTestAnswer({
        id: answer2Id,
        question_id: questionId,
        answer: 'Max upload size is 50MB',
      });

      await createTestBinding({
        question_id: questionId,
        answer_id: answer2Id,
        decision: 'accept',
        score_consistency: 1.0,
      });

      // Resolve by choosing answer2
      const result = await resolveTool.resolveContradiction({
        questionId,
        chosenAnswerId: answer2Id,
        rejectedAnswerIds: [answer1Id],
        reason: 'Updated requirement after infrastructure upgrade',
        resolvedBy: 'ProductManager',
      });

      expect(result.success).toBe(true);
      expect(result.chosenAnswerId).toBe(answer2Id);

      // Verify bindings
      const chosenResult = await dbPool.query('SELECT decision FROM bindings WHERE question_id = $1 AND answer_id = $2', [
        questionId,
        answer2Id,
      ]);
      expect(chosenResult.rows[0].decision).toBe('accept');

      const rejectedResult = await dbPool.query('SELECT decision FROM bindings WHERE question_id = $1 AND answer_id = $2', [
        questionId,
        answer1Id,
      ]);
      expect(rejectedResult.rows[0].decision).toBe('reject');

      // Verify question status
      const questionResult = await dbPool.query('SELECT status FROM questions WHERE id = $1', [questionId]);
      expect(questionResult.rows[0].status).toBe('resolved');
    });

    it('should get all conflicts', async () => {
      const resolveTool = new KMResolveTool(dbPool);

      const conflicts = await resolveTool.getConflicts(TEST_PHASE);

      // Should find conflicts from previous test
      expect(conflicts).toBeDefined();
      expect(Array.isArray(conflicts)).toBe(true);
    });
  });

  /**
   * Helper Functions
   */

  async function cleanupTestData() {
    try {
      await dbPool.query(`DELETE FROM km_edges WHERE id LIKE 'EDGE-%' OR id LIKE '%TEST%'`);
      await dbPool.query(`DELETE FROM km_nodes WHERE id LIKE 'KM-%' OR id LIKE '%TEST%'`);
      await dbPool.query(`DELETE FROM bindings WHERE question_id LIKE '%TEST%' OR question_id LIKE 'Q-IDEATION-%' OR question_id LIKE 'Q-PRD-%'`);
      await dbPool.query(`DELETE FROM answers WHERE question_id LIKE '%TEST%' OR question_id LIKE 'Q-IDEATION-%' OR question_id LIKE 'Q-PRD-%'`);
      await dbPool.query(`DELETE FROM questions WHERE id LIKE '%TEST%' OR id LIKE 'Q-IDEATION-%' OR id LIKE 'Q-PRD-%'`);
      console.log('[Test] Cleaned up test data');
    } catch (error) {
      console.error('[Test] Failed to clean up test data:', error);
    }
  }

  async function createTestQuestion(params: {
    id: string;
    phase: string;
    text: string;
    status: string;
    priority: number;
    tags?: string[];
  }) {
    await dbPool.query(
      `INSERT INTO questions (id, phase, run_id, text, tags, priority, depends_on, status, generated_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        params.id,
        params.phase,
        TEST_RUN_ID,
        params.text,
        params.tags || [],
        params.priority,
        [],
        params.status,
        'TestAgent',
      ]
    );
  }

  async function createTestAnswer(params: {
    id: string;
    question_id: string;
    answer: string;
  }) {
    await dbPool.query(
      `INSERT INTO answers (id, question_id, answer, evidence_ids, assumptions, confidence, generated_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [params.id, params.question_id, params.answer, [], [], 0.9, 'TestAgent']
    );
  }

  async function createTestBinding(params: {
    question_id: string;
    answer_id: string;
    decision: string;
    score_grounding?: number;
    score_completeness?: number;
    score_specificity?: number;
    score_consistency?: number;
  }) {
    await dbPool.query(
      `INSERT INTO bindings (question_id, answer_id, score_grounding, score_completeness, score_specificity, score_consistency, decision, reasons, hints, validated_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (question_id, answer_id) DO UPDATE
       SET decision = EXCLUDED.decision,
           score_grounding = EXCLUDED.score_grounding,
           score_completeness = EXCLUDED.score_completeness,
           score_specificity = EXCLUDED.score_specificity,
           score_consistency = EXCLUDED.score_consistency`,
      [
        params.question_id,
        params.answer_id,
        params.score_grounding || 0.9,
        params.score_completeness || 0.85,
        params.score_specificity || 0.8,
        params.score_consistency || 1.0,
        params.decision,
        [],
        [],
        'TestValidator',
      ]
    );
  }

  async function createTestKMNode(params: {
    id: string;
    question_id: string;
    answer_id: string;
  }) {
    await dbPool.query(
      `INSERT INTO km_nodes (id, question_id, answer_id, is_active, created_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [params.id, params.question_id, params.answer_id]
    );
  }
});

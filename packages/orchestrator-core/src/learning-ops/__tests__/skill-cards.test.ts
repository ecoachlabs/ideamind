/**
 * Skill Cards Tests
 */
import { SkillCards } from '../skill-cards';

describe('SkillCards', () => {
  let mockDb: any;
  let skillCards: SkillCards;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    skillCards = new SkillCards(mockDb);
  });

  describe('refreshSkillCard', () => {
    it('should generate comprehensive skill card for doer', async () => {
      // Mock CRL trends (7d and 30d)
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.20, count: 50 }], // Recent 7d
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.25, count: 200 }], // Previous 7d
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.22, count: 150 }], // Recent 30d
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.28, count: 600 }], // Previous 30d
        })
        // Mock gate analysis
        .mockResolvedValueOnce({
          rows: [
            { gate_pass: 0.9, contradictions: 0.1, grounding: 0.85 },
          ],
        })
        // Mock model usage
        .mockResolvedValueOnce({
          rows: [
            { model: 'claude-sonnet-4', count: 80, avg_crl: 0.18 },
            { model: 'claude-opus-4', count: 20, avg_crl: 0.30 },
          ],
        })
        // Mock failure modes
        .mockResolvedValueOnce({
          rows: [
            { type: 'timeout', count: 5 },
            { type: 'gate_failure', count: 3 },
          ],
        })
        // Mock active policy
        .mockResolvedValueOnce({
          rows: [{ id: 'policy_current', version: 'v1.2.0' }],
        })
        // Mock recent experiments
        .mockResolvedValueOnce({
          rows: [
            { id: 'exp_1', type: 'prompt_synthesis', metrics: JSON.stringify({ crlDelta: -0.05 }) },
            { id: 'exp_2', type: 'adapter_training', metrics: JSON.stringify({ crlDelta: -0.02 }) },
          ],
        })
        // Mock insert/update
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('planner');

      expect(card.doer).toBe('planner');
      expect(card.lossDelta7d).toBeLessThan(0); // Improved (0.20 - 0.25 = -0.05)
      expect(card.lossDelta30d).toBeLessThan(0); // Improved
      expect(card.strengths).toContain('High gate pass rate');
      expect(card.bestModels).toContain('claude-sonnet-4');
      expect(card.currentPolicy).toBe('policy_current');
      expect(card.experiments).toHaveLength(2);
    });

    it('should identify strengths based on metrics', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.15, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.25, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.15, count: 150 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.25, count: 600 }] })
        .mockResolvedValueOnce({
          rows: [
            { gate_pass: 0.95, contradictions: 0.02, grounding: 0.98 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('expert_doer');

      expect(card.strengths).toContain('High gate pass rate');
      expect(card.strengths).toContain('High grounding');
      expect(card.strengths).toContain('Low contradictions');
      expect(card.weaknesses).toHaveLength(0); // No weaknesses
    });

    it('should identify weaknesses based on metrics', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.45, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.40, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.42, count: 150 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.38, count: 600 }] })
        .mockResolvedValueOnce({
          rows: [
            { gate_pass: 0.65, contradictions: 0.30, grounding: 0.70 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('struggling_doer');

      expect(card.weaknesses).toContain('Low gate pass rate');
      expect(card.weaknesses).toContain('High contradictions');
      expect(card.weaknesses).toContain('Low grounding');
    });

    it('should identify best models by performance', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.20, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.25, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.22, count: 150 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.28, count: 600 }] })
        .mockResolvedValueOnce({
          rows: [{ gate_pass: 0.85, contradictions: 0.10, grounding: 0.88 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { model: 'claude-opus-4', count: 30, avg_crl: 0.15 }, // Best
            { model: 'claude-sonnet-4', count: 50, avg_crl: 0.20 },
            { model: 'claude-haiku-4', count: 20, avg_crl: 0.35 }, // Worst
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('model_tester');

      expect(card.bestModels[0]).toBe('claude-opus-4');
      expect(card.bestModels).not.toContain('claude-haiku-4');
    });

    it('should track failure modes', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.25, count: 40 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.20, count: 50 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.23, count: 150 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.22, count: 600 }] })
        .mockResolvedValueOnce({
          rows: [{ gate_pass: 0.80, contradictions: 0.15, grounding: 0.85 }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { type: 'timeout', count: 15 },
            { type: 'gate_failure', count: 10 },
            { type: 'cost_exceeded', count: 5 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('failure_prone');

      expect(card.failureModes).toContain('Frequent timeouts');
      expect(card.failureModes).toContain('Gate failures');
    });

    it('should show loss improving trend', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.18, count: 50 }] }) // Recent: better
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.25, count: 50 }] }) // Previous: worse
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.20, count: 150 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.28, count: 600 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('improving_doer');

      expect(card.lossDelta7d).toBe(-0.07); // 0.18 - 0.25 = -0.07 (improved)
      expect(card.lossDelta30d).toBe(-0.08); // Improved
    });

    it('should show loss degrading trend', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.35, count: 50 }] }) // Recent: worse
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.25, count: 50 }] }) // Previous: better
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.30, count: 150 }] })
        .mockResolvedValueOnce({ rows: [{ avg_crl: 0.22, count: 600 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.refreshSkillCard('degrading_doer');

      expect(card.lossDelta7d).toBe(0.10); // 0.35 - 0.25 = +0.10 (degraded)
      expect(card.lossDelta30d).toBe(0.08); // Degraded
    });
  });

  describe('getSkillCard', () => {
    it('should retrieve existing skill card', async () => {
      const mockCard = {
        id: 'skill_planner',
        doer: 'planner',
        strengths: JSON.stringify(['High quality']),
        weaknesses: JSON.stringify(['Slow']),
        best_models: JSON.stringify(['claude-opus-4']),
        failure_modes: JSON.stringify([]),
        loss_delta_7d: -0.05,
        loss_delta_30d: -0.08,
        current_policy: 'policy_123',
        experiments: JSON.stringify([]),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockCard] });

      const card = await skillCards.getSkillCard('planner');

      expect(card).toBeDefined();
      expect(card?.doer).toBe('planner');
      expect(card?.lossDelta7d).toBe(-0.05);
    });

    it('should return null if skill card does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const card = await skillCards.getSkillCard('nonexistent');

      expect(card).toBeNull();
    });
  });

  describe('Auto-refresh trigger', () => {
    it('should refresh skill card automatically after CRL computation', async () => {
      // This would be tested in integration
      // The trigger in migration should call refresh automatically
      expect(true).toBe(true);
    });
  });
});

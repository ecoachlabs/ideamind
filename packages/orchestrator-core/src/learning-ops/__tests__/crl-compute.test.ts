/**
 * CRL Compute Tests
 */
import { CRLCompute, computeCRL } from '../crl-compute';
import { CRLTerms, DEFAULT_CRL_WEIGHTS } from '../crl-types';

describe('CRL Compute', () => {
  describe('computeCRL function', () => {
    it('should compute perfect score (L=0) for perfect execution', () => {
      const perfectTerms: CRLTerms = {
        gatePass: 1.0,
        contradictions: 0,
        grounding: 1.0,
        costOverBudgetPct: 0,
        latencyP95Norm: 0,
        securityCriticals: 0,
        apiBreakages: 0,
        dbMigrationFail: 0,
        ragCoverage: 1.0,
      };

      const L = computeCRL(perfectTerms, DEFAULT_CRL_WEIGHTS);
      expect(L).toBe(0);
    });

    it('should compute high loss for poor execution', () => {
      const poorTerms: CRLTerms = {
        gatePass: 0,
        contradictions: 1.0,
        grounding: 0,
        costOverBudgetPct: 2.0,
        latencyP95Norm: 1.0,
        securityCriticals: 10,
        apiBreakages: 5,
        dbMigrationFail: 1,
        ragCoverage: 0,
      };

      const L = computeCRL(poorTerms, DEFAULT_CRL_WEIGHTS);
      expect(L).toBeGreaterThan(1.0);
    });

    it('should respect custom weights', () => {
      const terms: CRLTerms = {
        gatePass: 0.5,
        contradictions: 0.5,
        grounding: 0.5,
        costOverBudgetPct: 0.5,
        latencyP95Norm: 0.5,
        securityCriticals: 0,
        apiBreakages: 0,
        dbMigrationFail: 0,
        ragCoverage: 0.5,
      };

      // All weights = 0 except quality
      const customWeights = {
        wq: 1.0,
        wg: 0,
        wr: 0,
        wc: 0,
        wt: 0,
        ws: 0,
        wa: 0,
        wd: 0,
        wrag: 0,
      };

      const L = computeCRL(terms, customWeights);
      expect(L).toBe(0.5); // Only quality term contributes
    });

    it('should normalize security criticals correctly', () => {
      const terms: CRLTerms = {
        gatePass: 1.0,
        contradictions: 0,
        grounding: 1.0,
        costOverBudgetPct: 0,
        latencyP95Norm: 0,
        securityCriticals: 5, // Half of max (10)
        apiBreakages: 0,
        dbMigrationFail: 0,
        ragCoverage: 1.0,
      };

      const L = computeCRL(terms, DEFAULT_CRL_WEIGHTS);
      const expectedSecurityContribution = 0.5 * DEFAULT_CRL_WEIGHTS.ws;
      expect(L).toBeCloseTo(expectedSecurityContribution, 4);
    });

    it('should normalize API breakages correctly', () => {
      const terms: CRLTerms = {
        gatePass: 1.0,
        contradictions: 0,
        grounding: 1.0,
        costOverBudgetPct: 0,
        latencyP95Norm: 0,
        securityCriticals: 0,
        apiBreakages: 2.5, // Half of max (5)
        dbMigrationFail: 0,
        ragCoverage: 1.0,
      };

      const L = computeCRL(terms, DEFAULT_CRL_WEIGHTS);
      const expectedApiContribution = 0.5 * DEFAULT_CRL_WEIGHTS.wa;
      expect(L).toBeCloseTo(expectedApiContribution, 4);
    });
  });

  describe('CRLCompute class', () => {
    let mockDb: any;
    let crlCompute: CRLCompute;

    beforeEach(() => {
      mockDb = {
        query: jest.fn(),
      };
      crlCompute = new CRLCompute(mockDb);
    });

    it('should compute CRL for a run', async () => {
      // Mock database queries
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              gate_pass: 0.8,
              contradictions: 0.1,
              grounding: 0.9,
              cost: 5.0,
              budget: 10.0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // Insert query

      const result = await crlCompute.computeForRun('run_123');

      expect(result.runId).toBe('run_123');
      expect(result.L).toBeGreaterThan(0);
      expect(result.L).toBeLessThan(1);
      expect(result.breakdown).toBeDefined();
    });

    it('should handle missing run data gracefully', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(crlCompute.computeForRun('nonexistent')).rejects.toThrow();
    });

    it('should store CRL result in database', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              gate_pass: 1.0,
              contradictions: 0,
              grounding: 1.0,
              cost: 0,
              budget: 10.0,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      await crlCompute.computeForRun('run_456');

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO crl_results'),
        expect.any(Array)
      );
    });
  });

  describe('CRL Breakdown', () => {
    it('should provide detailed breakdown of loss components', () => {
      const terms: CRLTerms = {
        gatePass: 0.8,
        contradictions: 0.2,
        grounding: 0.7,
        costOverBudgetPct: 0.1,
        latencyP95Norm: 0.3,
        securityCriticals: 2,
        apiBreakages: 1,
        dbMigrationFail: 0,
        ragCoverage: 0.9,
      };

      const L = computeCRL(terms, DEFAULT_CRL_WEIGHTS);

      // Verify total matches sum of components
      const qualityLoss = (1 - 0.8) * DEFAULT_CRL_WEIGHTS.wq;
      const contradictionLoss = 0.2 * DEFAULT_CRL_WEIGHTS.wg;
      const groundingLoss = (1 - 0.7) * DEFAULT_CRL_WEIGHTS.wr;
      const costLoss = 0.1 * DEFAULT_CRL_WEIGHTS.wc;
      const latencyLoss = 0.3 * DEFAULT_CRL_WEIGHTS.wt;
      const securityLoss = (2 / 10) * DEFAULT_CRL_WEIGHTS.ws;
      const apiLoss = (1 / 5) * DEFAULT_CRL_WEIGHTS.wa;
      const dbLoss = 0 * DEFAULT_CRL_WEIGHTS.wd;
      const ragLoss = (1 - 0.9) * DEFAULT_CRL_WEIGHTS.wrag;

      const expectedTotal =
        qualityLoss +
        contradictionLoss +
        groundingLoss +
        costLoss +
        latencyLoss +
        securityLoss +
        apiLoss +
        dbLoss +
        ragLoss;

      expect(L).toBeCloseTo(expectedTotal, 4);
    });
  });
});

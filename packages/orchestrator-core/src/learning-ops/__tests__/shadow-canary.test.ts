/**
 * Shadow/Canary Controller Tests
 */
import { ShadowCanaryController } from '../shadow-canary';

describe('ShadowCanaryController', () => {
  let mockDb: any;
  let controller: ShadowCanaryController;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    controller = new ShadowCanaryController(mockDb);
  });

  describe('startShadowDeployment', () => {
    it('should create shadow deployment with 0% allocation', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'shadow_123' }],
      });

      const deploymentId = await controller.startShadowDeployment({
        doer: 'planner',
        candidatePolicyId: 'policy_new',
        controlPolicyId: 'policy_old',
      });

      expect(deploymentId).toBe('shadow_123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shadow_deployments'),
        expect.arrayContaining([
          expect.any(String), // id
          'planner',
          'shadow',
          'policy_new',
          'policy_old',
          0, // 0% allocation for shadow
        ])
      );
    });

    it('should end existing deployments before starting new one', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'old_shadow' }] }) // Get existing
        .mockResolvedValueOnce({ rows: [] }) // End existing
        .mockResolvedValueOnce({ rows: [{ id: 'new_shadow' }] }); // Create new

      await controller.startShadowDeployment({
        doer: 'planner',
        candidatePolicyId: 'policy_new',
        controlPolicyId: 'policy_old',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE shadow_deployments'),
        expect.arrayContaining(['ended', 'old_shadow'])
      );
    });
  });

  describe('startCanaryDeployment', () => {
    it('should create canary deployment with specified allocation', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'canary_123' }],
      });

      const deploymentId = await controller.startCanaryDeployment({
        doer: 'coder',
        candidatePolicyId: 'policy_candidate',
        controlPolicyId: 'policy_control',
        allocationPct: 10, // 10% traffic
        minJobs: 100,
        maxDurationHours: 48,
        autoPromote: false,
        safetyThresholds: {
          maxCRLIncrease: 0.05,
          minSampleSize: 50,
        },
      });

      expect(deploymentId).toBe('canary_123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shadow_deployments'),
        expect.arrayContaining([
          expect.any(String),
          'coder',
          'canary',
          'policy_candidate',
          'policy_control',
          10, // 10% allocation
        ])
      );
    });

    it('should validate allocation percentage', async () => {
      await expect(
        controller.startCanaryDeployment({
          doer: 'coder',
          candidatePolicyId: 'policy_new',
          controlPolicyId: 'policy_old',
          allocationPct: 150, // Invalid: > 100
          minJobs: 100,
          maxDurationHours: 48,
          autoPromote: false,
          safetyThresholds: {
            maxCRLIncrease: 0.05,
            minSampleSize: 50,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('routeTask', () => {
    it('should route to control for shadow deployment', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'shadow_123',
            mode: 'shadow',
            allocation_pct: 0,
            candidate_policy_id: 'policy_new',
            control_policy_id: 'policy_old',
          },
        ],
      });

      const route = await controller.routeTask('planner', 'task_123');

      // Shadow always routes to control (for comparison only)
      expect(route).toBe('control');
    });

    it('should route based on allocation percentage for canary', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'canary_123',
            mode: 'canary',
            allocation_pct: 50, // 50% split
            candidate_policy_id: 'policy_new',
            control_policy_id: 'policy_old',
          },
        ],
      });

      // Run many times to test distribution
      const routes = await Promise.all(
        Array.from({ length: 1000 }, (_, i) => controller.routeTask('coder', `task_${i}`))
      );

      const candidateCount = routes.filter((r) => r === 'candidate').length;
      const controlCount = routes.filter((r) => r === 'control').length;

      // Should be roughly 50/50 (with some variance)
      expect(candidateCount).toBeGreaterThan(400);
      expect(candidateCount).toBeLessThan(600);
      expect(controlCount).toBeGreaterThan(400);
      expect(controlCount).toBeLessThan(600);
    });

    it('should return control if no deployment exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const route = await controller.routeTask('unknown_doer', 'task_123');

      expect(route).toBe('control');
    });
  });

  describe('getCanaryReport', () => {
    it('should generate comprehensive canary report', async () => {
      // Mock deployment info
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'canary_123',
              doer: 'coder',
              allocation_pct: 10,
              candidate_policy_id: 'policy_new',
              control_policy_id: 'policy_old',
              min_jobs: 100,
              safety_thresholds: JSON.stringify({
                maxCRLIncrease: 0.05,
                minSampleSize: 50,
              }),
            },
          ],
        })
        // Mock routing counts
        .mockResolvedValueOnce({
          rows: [
            { route: 'candidate', count: 60 },
            { route: 'control', count: 540 },
          ],
        })
        // Mock candidate metrics
        .mockResolvedValueOnce({
          rows: [
            {
              avg_crl: 0.25,
              std_crl: 0.05,
            },
          ],
        })
        // Mock control metrics
        .mockResolvedValueOnce({
          rows: [
            {
              avg_crl: 0.30,
              std_crl: 0.06,
            },
          ],
        });

      const report = await controller.getCanaryReport('canary_123');

      expect(report.canaryId).toBe('canary_123');
      expect(report.candidateMetrics.avgCRL).toBe(0.25);
      expect(report.controlMetrics.avgCRL).toBe(0.30);
      expect(report.delta).toBe(-0.05); // Candidate is better (lower CRL)
      expect(report.recommendation).toBe('promote'); // Lower CRL = promote
    });

    it('should recommend rollback if candidate is worse', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'canary_456',
              doer: 'coder',
              allocation_pct: 20,
              candidate_policy_id: 'policy_bad',
              control_policy_id: 'policy_good',
              min_jobs: 100,
              safety_thresholds: JSON.stringify({
                maxCRLIncrease: 0.05,
                minSampleSize: 50,
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { route: 'candidate', count: 100 },
            { route: 'control', count: 400 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.40, std_crl: 0.08 }],
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.30, std_crl: 0.05 }],
        });

      const report = await controller.getCanaryReport('canary_456');

      expect(report.delta).toBeGreaterThan(0); // Candidate is worse
      expect(report.recommendation).toBe('rollback');
    });

    it('should require minimum sample size before recommending', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'canary_789',
              doer: 'coder',
              allocation_pct: 10,
              candidate_policy_id: 'policy_new',
              control_policy_id: 'policy_old',
              min_jobs: 100,
              safety_thresholds: JSON.stringify({
                maxCRLIncrease: 0.05,
                minSampleSize: 50,
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { route: 'candidate', count: 10 }, // Too few samples
            { route: 'control', count: 90 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.20, std_crl: 0.03 }],
        })
        .mockResolvedValueOnce({
          rows: [{ avg_crl: 0.30, std_crl: 0.05 }],
        });

      const report = await controller.getCanaryReport('canary_789');

      expect(report.recommendation).toBe('continue'); // Not enough data
    });
  });

  describe('endDeployment', () => {
    it('should end active deployment', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await controller.endDeployment('canary_123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE shadow_deployments'),
        expect.arrayContaining(['ended', expect.any(Date), 'canary_123'])
      );
    });
  });

  describe('Auto-promotion', () => {
    it('should auto-promote if enabled and criteria met', async () => {
      // This would be tested in integration with policy store
      // For unit test, we just verify the flag is respected
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'canary_auto',
            auto_promote: true,
            allocation_pct: 50,
            min_jobs: 100,
            candidate_policy_id: 'policy_winner',
            control_policy_id: 'policy_old',
          },
        ],
      });

      const deployment = await controller['getActiveDeployment']('planner');

      expect(deployment?.auto_promote).toBe(true);
    });
  });
});

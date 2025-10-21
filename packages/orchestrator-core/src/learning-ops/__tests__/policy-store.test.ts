/**
 * Policy Store Tests
 */
import { PolicyStore, PolicyArtifact } from '../policy-store';

describe('PolicyStore', () => {
  let mockDb: any;
  let policyStore: PolicyStore;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    policyStore = new PolicyStore(mockDb);
  });

  describe('createPolicy', () => {
    it('should create a new policy with provenance', async () => {
      const artifact: PolicyArtifact = {
        doer: 'planner',
        phase: 'plan',
        version: 'v1.0.0',
        prompts: {
          system: 'You are a planning agent',
        },
        hparams: {
          temperature: 0.7,
        },
        routerRules: {},
        toolsAllowlist: ['search', 'analyze'],
        weights: {},
        provenance: {
          parentPolicyId: null,
          experimentId: 'exp_001',
          lineage: [],
          createdBy: 'system',
          createdAt: new Date(),
          signature: '',
        },
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'policy_123' }],
      });

      const policyId = await policyStore.createPolicy(artifact);

      expect(policyId).toBe('policy_123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO policies'),
        expect.arrayContaining([
          expect.stringMatching(/^policy_/),
          'planner',
          'plan',
          'v1.0.0',
          'draft', // Default status
        ])
      );
    });

    it('should generate cryptographic signature', async () => {
      const artifact: PolicyArtifact = {
        doer: 'coder',
        phase: 'code',
        version: 'v2.0.0',
        prompts: {},
        hparams: {},
        routerRules: {},
        toolsAllowlist: [],
        weights: {},
        provenance: {
          parentPolicyId: null,
          experimentId: null,
          lineage: [],
          createdBy: 'user',
          createdAt: new Date(),
          signature: '',
        },
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'policy_456' }],
      });

      await policyStore.createPolicy(artifact);

      // Verify signature was generated
      const insertCall = mockDb.query.mock.calls[0];
      const signature = insertCall[1][insertCall[1].length - 1]; // Last param
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should track lineage from parent policy', async () => {
      const artifact: PolicyArtifact = {
        doer: 'reviewer',
        phase: 'review',
        version: 'v1.1.0',
        prompts: {},
        hparams: {},
        routerRules: {},
        toolsAllowlist: [],
        weights: {},
        provenance: {
          parentPolicyId: 'policy_parent',
          experimentId: 'exp_002',
          lineage: ['policy_grandparent', 'policy_parent'],
          createdBy: 'experiment',
          createdAt: new Date(),
          signature: '',
        },
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'policy_child' }],
      });

      await policyStore.createPolicy(artifact);

      const lineage = mockDb.query.mock.calls[0][1][10]; // lineage param
      expect(JSON.parse(lineage)).toEqual(['policy_grandparent', 'policy_parent', 'policy_child']);
    });
  });

  describe('promotePolicy', () => {
    it('should promote policy from draft to shadow', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ status: 'draft' }] }) // Get current status
        .mockResolvedValueOnce({ rows: [] }) // Update status
        .mockResolvedValueOnce({ rows: [] }); // Insert promotion log

      await policyStore.promotePolicy('policy_123', 'shadow', 'Ready for shadow testing');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE policies'),
        expect.arrayContaining(['shadow', 'policy_123'])
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO policy_promotions'),
        expect.arrayContaining(['policy_123', 'draft', 'shadow', 'Ready for shadow testing'])
      );
    });

    it('should auto-archive old active policies when promoting to active', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ status: 'canary' }] }) // Get current status
        .mockResolvedValueOnce({ rows: [{ id: 'old_policy' }] }) // Get old active policies
        .mockResolvedValueOnce({ rows: [] }) // Archive old policy
        .mockResolvedValueOnce({ rows: [] }) // Update new policy status
        .mockResolvedValueOnce({ rows: [] }); // Insert promotion log

      await policyStore.promotePolicy('policy_new', 'active');

      // Verify old policy was archived
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE policies'),
        expect.arrayContaining(['archived'])
      );

      // Verify new policy was activated
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE policies'),
        expect.arrayContaining(['active', 'policy_new'])
      );
    });

    it('should prevent invalid status transitions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'draft' }] });

      // Cannot promote directly from draft to active (must go through shadow/canary)
      await expect(policyStore.promotePolicy('policy_123', 'active')).rejects.toThrow();
    });
  });

  describe('getActivePolicy', () => {
    it('should return active policy for doer', async () => {
      const mockPolicy = {
        id: 'policy_active',
        doer: 'planner',
        status: 'active',
        prompts: JSON.stringify({ system: 'You are a planner' }),
        hparams: JSON.stringify({ temperature: 0.7 }),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockPolicy] });

      const policy = await policyStore.getActivePolicy('planner');

      expect(policy).toBeDefined();
      expect(policy?.id).toBe('policy_active');
      expect(policy?.doer).toBe('planner');
    });

    it('should return null if no active policy exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const policy = await policyStore.getActivePolicy('unknown_doer');

      expect(policy).toBeNull();
    });
  });

  describe('getPolicyById', () => {
    it('should retrieve policy by ID', async () => {
      const mockPolicy = {
        id: 'policy_123',
        doer: 'coder',
        version: 'v1.0.0',
        status: 'shadow',
        prompts: JSON.stringify({}),
        hparams: JSON.stringify({}),
        router_rules: JSON.stringify({}),
        tools_allowlist: JSON.stringify([]),
        weights: JSON.stringify({}),
        lineage: JSON.stringify([]),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockPolicy] });

      const policy = await policyStore.getPolicyById('policy_123');

      expect(policy).toBeDefined();
      expect(policy?.id).toBe('policy_123');
      expect(policy?.status).toBe('shadow');
    });
  });

  describe('listPolicies', () => {
    it('should list all policies for a doer', async () => {
      const mockPolicies = [
        { id: 'policy_1', status: 'active' },
        { id: 'policy_2', status: 'archived' },
        { id: 'policy_3', status: 'draft' },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockPolicies });

      const policies = await policyStore.listPolicies('planner');

      expect(policies).toHaveLength(3);
      expect(policies.map((p) => p.id)).toEqual(['policy_1', 'policy_2', 'policy_3']);
    });

    it('should filter policies by status', async () => {
      const mockPolicies = [{ id: 'policy_active', status: 'active' }];

      mockDb.query.mockResolvedValueOnce({ rows: mockPolicies });

      const policies = await policyStore.listPolicies('planner', 'active');

      expect(policies).toHaveLength(1);
      expect(policies[0].status).toBe('active');
    });
  });
});

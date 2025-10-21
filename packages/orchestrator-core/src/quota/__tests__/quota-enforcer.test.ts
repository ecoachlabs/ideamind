/**
 * Quota Enforcer Tests
 */
import { QuotaEnforcer } from '../quota-enforcer';

describe('QuotaEnforcer', () => {
  let enforcer: QuotaEnforcer;

  beforeEach(() => {
    enforcer = new QuotaEnforcer({} as any);
  });

  it('should set tenant quotas', async () => {
    await enforcer.setQuotas('tenant-1', {
      maxCPUCores: 20,
      maxMemoryGB: 64,
    });

    const check = await enforcer.checkQuota('tenant-1', 'cpu', 5);
    expect(check.allowed).toBe(true);
  });

  it('should enforce quotas', async () => {
    await enforcer.setQuotas('tenant-1', {
      maxCPUCores: 10,
    });

    const check = await enforcer.checkQuota('tenant-1', 'cpu', 15);
    expect(check.allowed).toBe(false);
  });
});

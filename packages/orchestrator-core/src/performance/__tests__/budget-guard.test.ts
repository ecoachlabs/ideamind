/**
 * Budget Guard Tests
 */
import { BudgetGuard } from '../budget-guard';

describe('BudgetGuard', () => {
  let guard: BudgetGuard;

  beforeEach(() => {
    guard = new BudgetGuard({} as any);
  });

  it('should set budget for run', async () => {
    await guard.setBudget('run-1', 100);
    const remaining = guard.getRemainingBudget('run-1');
    expect(remaining).toBe(100);
  });

  it('should track spending', async () => {
    await guard.setBudget('run-1', 100);
    await guard.recordCost('run-1', 30);
    const remaining = guard.getRemainingBudget('run-1');
    expect(remaining).toBe(70);
  });

  it('should emit alert at threshold', async () => {
    await guard.setBudget('run-1', 100);
    
    const alertPromise = new Promise(resolve => {
      guard.once('budget-alert', resolve);
    });

    await guard.recordCost('run-1', 50);
    const alert = await alertPromise;
    expect(alert).toBeDefined();
  });
});

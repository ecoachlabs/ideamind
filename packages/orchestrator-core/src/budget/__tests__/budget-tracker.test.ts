/**
 * Tests for BudgetTracker
 */

import { BudgetTracker, BudgetExceededError } from '../budget-tracker';

describe('BudgetTracker', () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker();
  });

  describe('setBudget', () => {
    test('sets budget limits for a phase', () => {
      tracker.setBudget('intake', {
        tokens: 700000,
        tools_minutes: 60
      });

      const usage = tracker.getUsage('intake');
      expect(usage.tokens).toBe(0);
      expect(usage.tools_minutes).toBe(0);
    });
  });

  describe('recordTokenUsage', () => {
    beforeEach(() => {
      tracker.setBudget('intake', {
        tokens: 1000,
        tools_minutes: 60
      });
    });

    test('records token usage', () => {
      tracker.recordTokenUsage('intake', 500);

      const usage = tracker.getUsage('intake');
      expect(usage.tokens).toBe(500);
    });

    test('throws BudgetExceededError when limit exceeded', () => {
      expect(() => {
        tracker.recordTokenUsage('intake', 1500);
      }).toThrow(BudgetExceededError);
    });

    test('throws error when budget not set', () => {
      expect(() => {
        tracker.recordTokenUsage('unknown-phase', 100);
      }).toThrow('No budget set for phase: unknown-phase');
    });
  });

  describe('getBudgetUtilization', () => {
    beforeEach(() => {
      tracker.setBudget('intake', {
        tokens: 1000,
        tools_minutes: 100
      });
    });

    test('calculates utilization percentages', () => {
      tracker.recordTokenUsage('intake', 500);
      tracker.recordToolUsage('intake', 80);

      const utilization = tracker.getBudgetUtilization('intake');

      expect(utilization.tokens_pct).toBe(50);
      expect(utilization.tools_minutes_pct).toBe(80);
      expect(utilization.overall_pct).toBe(80); // Max of all
    });
  });

  describe('shouldThrottle', () => {
    beforeEach(() => {
      tracker.setBudget('intake', {
        tokens: 1000,
        tools_minutes: 100
      });
    });

    test('returns false when under 80% utilization', () => {
      tracker.recordTokenUsage('intake', 700);
      expect(tracker.shouldThrottle('intake')).toBe(false);
    });

    test('returns true when at or above 80% utilization', () => {
      tracker.recordTokenUsage('intake', 850);
      expect(tracker.shouldThrottle('intake')).toBe(true);
    });
  });

  describe('getRemainingBudget', () => {
    beforeEach(() => {
      tracker.setBudget('intake', {
        tokens: 1000,
        tools_minutes: 60
      });
    });

    test('returns remaining budget', () => {
      tracker.recordTokenUsage('intake', 300);
      tracker.recordToolUsage('intake', 20);

      const remaining = tracker.getRemainingBudget('intake');

      expect(remaining.tokens).toBe(700);
      expect(remaining.tools_minutes).toBe(40);
    });
  });

  describe('calculateCost', () => {
    beforeEach(() => {
      tracker.setBudget('intake', {
        tokens: 1000000,
        tools_minutes: 120,
        gpu_hours: 2
      });
    });

    test('calculates total cost in USD', () => {
      tracker.recordTokenUsage('intake', 500000); // 500K tokens = $5
      tracker.recordToolUsage('intake', 60);      // 60 min = $30
      tracker.recordGPUUsage('intake', 1);        // 1 GPU hour = $2

      const cost = tracker.calculateCost('intake');

      // $5 (tokens) + $30 (tools) + $2 (GPU) = $37
      expect(cost).toBe(37);
    });
  });

  describe('event emission', () => {
    test('emits tokens.used event', (done) => {
      tracker.setBudget('intake', {
        tokens: 1000,
        tools_minutes: 60
      });

      tracker.on('tokens.used', (event) => {
        expect(event.phase).toBe('intake');
        expect(event.tokens).toBe(500);
        expect(event.total).toBe(500);
        expect(event.utilization).toBe(50);
        done();
      });

      tracker.recordTokenUsage('intake', 500);
    });

    test('emits budget.throttle event at 80% utilization', (done) => {
      tracker.setBudget('intake', {
        tokens: 1000,
        tools_minutes: 60
      });

      tracker.on('budget.throttle', (event) => {
        expect(event.phase).toBe('intake');
        expect(event.utilization.overall_pct).toBeGreaterThanOrEqual(80);
        done();
      });

      tracker.recordTokenUsage('intake', 850);
    });
  });
});

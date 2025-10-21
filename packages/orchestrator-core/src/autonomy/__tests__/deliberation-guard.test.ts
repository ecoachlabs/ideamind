/**
 * Deliberation Guard Tests
 */
import { DeliberationGuard } from '../deliberation-guard';

describe('DeliberationGuard', () => {
  let guard: DeliberationGuard;

  beforeEach(() => {
    guard = new DeliberationGuard({} as any, 2000);
  });

  it('should score reasoning', async () => {
    const reasoning = 'This is a well-thought-out approach because...';
    const score = await guard.scoreReasoning(reasoning, {});
    
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThanOrEqual(1);
    expect(score.recommendation).toMatch(/pass|review|fallback/);
  });

  it('should recommend fallback for excessive tokens', async () => {
    const reasoning = 'x'.repeat(10000); // Very long
    const score = await guard.scoreReasoning(reasoning, {});
    
    expect(score.recommendation).toBe('fallback');
  });
});

/**
 * Accessibility Guard (WCAG AAA)
 */
export interface A11yViolation {
  severity: 'critical' | 'high' | 'medium' | 'low';
  wcagLevel: 'A' | 'AA' | 'AAA';
  description: string;
  element?: string;
  rule: string;
}

export class A11yGuard {
  async audit(html: string): Promise<A11yViolation[]> {
    // Stub: would run actual WCAG AAA checks
    return [];
  }
}

// Keep backward compatibility
export type A11yIssue = A11yViolation;

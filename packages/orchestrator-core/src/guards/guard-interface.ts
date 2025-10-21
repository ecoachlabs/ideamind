/**
 * Guard result
 */
export interface GuardResult {
  type: string;
  pass: boolean;
  score: number;
  reasons?: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  recommendations?: string[];
  metadata?: Record<string, any>;
  timestamp: string;
}

/**
 * Guard interface
 *
 * Guards perform quality checks on artifacts before gate evaluation
 * Spec: phase.txt:51-65
 */
export interface Guard {
  /**
   * Guard type identifier
   */
  readonly type: string;

  /**
   * Execute guard check
   *
   * @param artifacts - Artifacts to check
   * @param context - Execution context
   * @returns Guard result
   */
  execute(
    artifacts: Array<{ id: string; type: string; content?: any }>,
    context: Record<string, any>
  ): Promise<GuardResult>;
}

/**
 * Learning Loop Types
 */
export interface TaskOutcome {
  taskId: string;
  taskType: string;
  success: boolean;
  duration: number;
  modelUsed: string;
  origin: 'human' | 'ai-generated' | 'hybrid';
}

export interface DatasetSample {
  inputHash: string;
  outputHash: string;
  labeledOrigin: string;
  syntheticConfidence: number;
}

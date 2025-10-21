/**
 * Priority & Preemption System Types
 *
 * Implements P0-P3 priority classes with resource-based preemption
 * to handle resource contention under load.
 */

/**
 * Priority Classes
 * - P0: Critical - never preempt, always allocate
 * - P1: High - preempt P2/P3 when resources constrained
 * - P2: Normal - default priority
 * - P3: Low - first to preempt when resources needed
 */
export enum PriorityClass {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

/**
 * Preemption reasons
 */
export enum PreemptionReason {
  RESOURCE_CONSTRAINT = 'resource_constraint',
  BUDGET_EXCEEDED = 'budget_exceeded',
  QUOTA_EXCEEDED = 'quota_exceeded',
  HIGH_PRIORITY_TASK = 'high_priority_task',
  MANUAL = 'manual',
}

/**
 * Resource types that can trigger preemption
 */
export type ResourceType =
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'storage'
  | 'tokens'
  | 'cost'
  | 'duration';

/**
 * Resource utilization metrics
 */
export interface ResourceUtilization {
  cpu: {
    used: number;
    total: number;
    percent: number;
  };
  memory: {
    usedMB: number;
    totalMB: number;
    percent: number;
  };
  gpu: {
    used: number;
    total: number;
    percent: number;
  };
}

/**
 * Preemption configuration
 */
export interface PreemptionConfig {
  enablePreemption: boolean;

  // Resource thresholds (percentage 0-100)
  thresholds: {
    cpu: {
      preemptP3: number; // 80% - start preempting P3
      preemptP2: number; // 85% - preempt P2 as well
    };
    memory: {
      preemptP3: number; // 80%
      preemptP2: number; // 90%
    };
    gpu: {
      preemptP3: number; // 75%
      preemptP2: number; // 85%
    };
    budget: {
      preemptP3: number; // 80%
      preemptP2: number; // 90%
    };
  };

  // Preemption behavior
  gracePeriod: number; // Time to allow task to checkpoint before kill (ms)
  retryDelay: number; // Time before retrying preempted task (ms)
  maxPreemptions: number; // Max times a task can be preempted before failing
}

/**
 * Task priority metadata
 */
export interface TaskPriority {
  taskId: string;
  priorityClass: PriorityClass;
  assignedAt: Date;
  assignedReason: string;
  preemptible: boolean; // P0 tasks are not preemptible
}

/**
 * Preemption event
 */
export interface PreemptionEvent {
  taskId: string;
  priorityClass: PriorityClass;
  reason: PreemptionReason;
  resource: ResourceType;
  resourceUtilization: number; // Percentage
  preemptedAt: Date;
  checkpointId?: string;
  resumeAfter?: Date;
}

/**
 * Preemption candidate
 */
export interface PreemptionCandidate {
  taskId: string;
  priorityClass: PriorityClass;
  startedAt: Date;
  duration: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    gpu: number;
  };
  score: number; // Higher score = better candidate for preemption
}

/**
 * Priority assignment request
 */
export interface PriorityAssignment {
  taskId: string;
  priorityClass: PriorityClass;
  reason: string;
  overridable: boolean; // Can this assignment be overridden?
}

/**
 * Preemption policy
 */
export interface PreemptionPolicy {
  name: string;
  description: string;
  rules: PreemptionRule[];
}

/**
 * Preemption rule
 */
export interface PreemptionRule {
  id: string;
  condition: {
    resource: ResourceType;
    threshold: number;
  };
  action: {
    preempt: PriorityClass[];
    count: number; // How many tasks to preempt
    selection: 'longest-running' | 'newest' | 'highest-resource' | 'lowest-priority';
  };
  priority: number; // Rule evaluation order
}

/**
 * Priority scheduler statistics
 */
export interface PriorityStats {
  totalTasks: number;
  byPriority: {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
  };
  preemptions: {
    total: number;
    byReason: Record<PreemptionReason, number>;
    byPriority: {
      P0: number;
      P1: number;
      P2: number;
      P3: number;
    };
  };
  resourceUtilization: ResourceUtilization;
  averageWaitTime: {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
  };
}

/**
 * Default preemption configuration
 */
export const DEFAULT_PREEMPTION_CONFIG: PreemptionConfig = {
  enablePreemption: true,
  thresholds: {
    cpu: {
      preemptP3: 80,
      preemptP2: 85,
    },
    memory: {
      preemptP3: 80,
      preemptP2: 90,
    },
    gpu: {
      preemptP3: 75,
      preemptP2: 85,
    },
    budget: {
      preemptP3: 80,
      preemptP2: 90,
    },
  },
  gracePeriod: 30000, // 30 seconds
  retryDelay: 60000, // 1 minute
  maxPreemptions: 3, // Fail after 3 preemptions
};

/**
 * Default preemption policy
 */
export const DEFAULT_PREEMPTION_POLICY: PreemptionPolicy = {
  name: 'default',
  description: 'Default resource-based preemption policy',
  rules: [
    {
      id: 'cpu-p3',
      condition: {
        resource: 'cpu',
        threshold: 80,
      },
      action: {
        preempt: [PriorityClass.P3],
        count: 1,
        selection: 'longest-running',
      },
      priority: 100,
    },
    {
      id: 'cpu-p2',
      condition: {
        resource: 'cpu',
        threshold: 85,
      },
      action: {
        preempt: [PriorityClass.P2, PriorityClass.P3],
        count: 2,
        selection: 'longest-running',
      },
      priority: 90,
    },
    {
      id: 'memory-p3',
      condition: {
        resource: 'memory',
        threshold: 80,
      },
      action: {
        preempt: [PriorityClass.P3],
        count: 1,
        selection: 'highest-resource',
      },
      priority: 95,
    },
    {
      id: 'budget-p3',
      condition: {
        resource: 'cost',
        threshold: 80,
      },
      action: {
        preempt: [PriorityClass.P3],
        count: 1,
        selection: 'longest-running',
      },
      priority: 85,
    },
  ],
};

/**
 * Helper function to get numeric priority value
 */
export function getPriorityValue(priorityClass: PriorityClass): number {
  switch (priorityClass) {
    case PriorityClass.P0:
      return 0;
    case PriorityClass.P1:
      return 1;
    case PriorityClass.P2:
      return 2;
    case PriorityClass.P3:
      return 3;
    default:
      return 2; // Default to P2
  }
}

/**
 * Helper function to check if a task can be preempted
 */
export function isPreemptible(priorityClass: PriorityClass): boolean {
  return priorityClass !== PriorityClass.P0;
}

/**
 * Helper function to compare priorities
 */
export function hasHigherPriority(a: PriorityClass, b: PriorityClass): boolean {
  return getPriorityValue(a) < getPriorityValue(b);
}

/**
 * Quota Types
 *
 * Types and interfaces for multi-tenant resource quotas and enforcement.
 */

export interface TenantQuotas {
  tenantId: string;
  maxCPUCores: number;
  maxMemoryGB: number;
  maxStorageGB: number;
  maxTokensPerDay: number;
  maxCostPerDayUSD: number;
  maxGPUs: number;
  maxConcurrentRuns: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourceUsage {
  tenantId: string;
  cpu: {
    used: number;
    quota: number;
    percent: number;
  };
  memory: {
    usedGB: number;
    quotaGB: number;
    percent: number;
  };
  storage: {
    usedGB: number;
    quotaGB: number;
    percent: number;
  };
  tokens: {
    usedToday: number;
    quotaPerDay: number;
    percent: number;
  };
  cost: {
    spentTodayUSD: number;
    quotaPerDayUSD: number;
    percent: number;
  };
  gpus: {
    used: number;
    quota: number;
    percent: number;
  };
  concurrentRuns: {
    active: number;
    quota: number;
    percent: number;
  };
}

export interface QuotaViolation {
  id: string;
  tenantId: string;
  resourceType: ResourceType;
  quotaValue: number;
  actualValue: number;
  violationTime: Date;
  actionTaken: QuotaAction;
}

export type ResourceType =
  | 'cpu'
  | 'memory'
  | 'storage'
  | 'tokens'
  | 'cost'
  | 'gpu'
  | 'concurrent_runs';

export type QuotaAction = 'throttle' | 'pause' | 'alert' | 'reject';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  quota: number;
  percentUsed: number;
}

export interface ThrottleConfig {
  enabled: boolean;
  windowMs: number; // Throttle window
  maxRequests: number; // Max requests per window
  penaltyMs: number; // Penalty delay for over-quota
}

export const DEFAULT_TENANT_QUOTAS: Omit<TenantQuotas, 'tenantId' | 'createdAt' | 'updatedAt'> = {
  maxCPUCores: 10,
  maxMemoryGB: 32,
  maxStorageGB: 100,
  maxTokensPerDay: 1000000,
  maxCostPerDayUSD: 100.00,
  maxGPUs: 2,
  maxConcurrentRuns: 5,
};

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  enabled: true,
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  penaltyMs: 5000, // 5 second delay
};

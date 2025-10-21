/**
 * Quota Enforcer - Multi-tenant resource quota enforcement
 *
 * Enforces resource quotas (CPU, memory, storage, tokens, cost, GPU, concurrent runs)
 * with noisy neighbor protection and tenant isolation.
 */
import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';
import {
  TenantQuotas,
  ResourceUsage,
  ResourceType,
  QuotaCheckResult,
  QuotaViolation,
  DEFAULT_TENANT_QUOTAS,
} from './quota-types';

const logger = pino({ name: 'quota-enforcer' });

export class QuotaEnforcer extends EventEmitter {
  private quotas: Map<string, TenantQuotas> = new Map();
  private throttledTenants: Map<string, Date> = new Map(); // Tenant -> throttled until

  constructor(private pool: Pool) {
    super();
    this.loadQuotasFromDatabase().catch((err) => {
      logger.error({ err }, 'Failed to load quotas from database');
    });
  }

  /**
   * Load quotas from database
   */
  private async loadQuotasFromDatabase(): Promise<void> {
    try {
      const result = await this.pool.query('SELECT * FROM tenant_quotas');

      for (const row of result.rows) {
        const quotas: TenantQuotas = {
          tenantId: row.tenant_id,
          maxCPUCores: row.max_cpu_cores,
          maxMemoryGB: row.max_memory_gb,
          maxStorageGB: row.max_storage_gb,
          maxTokensPerDay: row.max_tokens_per_day,
          maxCostPerDayUSD: row.max_cost_per_day_usd,
          maxGPUs: row.max_gpus,
          maxConcurrentRuns: row.max_concurrent_runs,
          burstCPUCores: row.burst_cpu_cores || 0,
          burstMemoryGB: row.burst_memory_gb || 0,
          burstDurationMinutes: row.burst_duration_minutes || 60,
          throttleEnabled: row.throttle_enabled,
          throttleThreshold: parseFloat(row.throttle_threshold),
          tier: row.tier,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        this.quotas.set(quotas.tenantId, quotas);
      }

      logger.info({ count: this.quotas.size }, 'Loaded tenant quotas from database');
    } catch (err) {
      logger.error({ err }, 'Failed to load quotas from database');
    }
  }

  /**
   * Set quotas for a tenant
   */
  async setQuotas(tenantId: string, quotas: Partial<TenantQuotas>): Promise<void> {
    const fullQuotas: TenantQuotas = {
      ...DEFAULT_TENANT_QUOTAS,
      ...quotas,
      tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.quotas.set(tenantId, fullQuotas);

    // Upsert to database
    await this.pool.query(
      `INSERT INTO tenant_quotas
       (tenant_id, max_cpu_cores, max_memory_gb, max_storage_gb, max_tokens_per_day,
        max_cost_per_day_usd, max_gpus, max_concurrent_runs, burst_cpu_cores, burst_memory_gb,
        burst_duration_minutes, throttle_enabled, throttle_threshold, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (tenant_id) DO UPDATE
       SET max_cpu_cores = EXCLUDED.max_cpu_cores,
           max_memory_gb = EXCLUDED.max_memory_gb,
           max_storage_gb = EXCLUDED.max_storage_gb,
           max_tokens_per_day = EXCLUDED.max_tokens_per_day,
           max_cost_per_day_usd = EXCLUDED.max_cost_per_day_usd,
           max_gpus = EXCLUDED.max_gpus,
           max_concurrent_runs = EXCLUDED.max_concurrent_runs,
           burst_cpu_cores = EXCLUDED.burst_cpu_cores,
           burst_memory_gb = EXCLUDED.burst_memory_gb,
           burst_duration_minutes = EXCLUDED.burst_duration_minutes,
           throttle_enabled = EXCLUDED.throttle_enabled,
           throttle_threshold = EXCLUDED.throttle_threshold,
           tier = EXCLUDED.tier,
           updated_at = NOW()`,
      [
        tenantId,
        fullQuotas.maxCPUCores,
        fullQuotas.maxMemoryGB,
        fullQuotas.maxStorageGB,
        fullQuotas.maxTokensPerDay,
        fullQuotas.maxCostPerDayUSD,
        fullQuotas.maxGPUs,
        fullQuotas.maxConcurrentRuns,
        fullQuotas.burstCPUCores,
        fullQuotas.burstMemoryGB,
        fullQuotas.burstDurationMinutes,
        fullQuotas.throttleEnabled,
        fullQuotas.throttleThreshold,
        fullQuotas.tier,
      ]
    );

    logger.info({ tenantId, tier: fullQuotas.tier }, 'Quotas set for tenant');
  }

  /**
   * Check if resource usage is within quota
   */
  async checkQuota(
    tenantId: string,
    resource: ResourceType,
    amount: number
  ): Promise<QuotaCheckResult> {
    const quotas = this.quotas.get(tenantId) || {
      ...DEFAULT_TENANT_QUOTAS,
      tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Get current usage
    const usage = await this.getTenantUsage(tenantId);
    let currentUsage = 0;
    let quota = 0;

    switch (resource) {
      case 'cpu':
        currentUsage = usage.cpu.used;
        quota = quotas.maxCPUCores;
        break;
      case 'memory':
        currentUsage = usage.memory.usedGB;
        quota = quotas.maxMemoryGB;
        break;
      case 'storage':
        currentUsage = usage.storage.usedGB;
        quota = quotas.maxStorageGB;
        break;
      case 'tokens':
        currentUsage = usage.tokens.usedToday;
        quota = quotas.maxTokensPerDay;
        break;
      case 'cost':
        currentUsage = usage.cost.spentTodayUSD;
        quota = quotas.maxCostPerDayUSD;
        break;
      case 'gpu':
        currentUsage = usage.gpus.used;
        quota = quotas.maxGPUs;
        break;
      case 'concurrent_runs':
        currentUsage = usage.concurrentRuns.active;
        quota = quotas.maxConcurrentRuns;
        break;
    }

    const newUsage = currentUsage + amount;
    const percentUsed = quota > 0 ? (newUsage / quota) * 100 : 0;
    const allowed = newUsage <= quota;

    // Check for burst allowance if quota exceeded
    let burstAllowed = false;
    if (!allowed && (resource === 'cpu' || resource === 'memory')) {
      const burstQuota =
        resource === 'cpu'
          ? quota + quotas.burstCPUCores
          : quota + quotas.burstMemoryGB;
      burstAllowed = newUsage <= burstQuota;

      if (burstAllowed) {
        logger.info(
          { tenantId, resource, amount, burstQuota },
          'Using burst allowance'
        );
      }
    }

    const result: QuotaCheckResult = {
      allowed: allowed || burstAllowed,
      currentUsage,
      quota,
      percentUsed: Math.round(percentUsed * 100) / 100,
      burstAllowed,
    };

    // Log violation if quota exceeded
    if (!result.allowed) {
      await this.recordViolation(
        tenantId,
        resource,
        quota,
        newUsage,
        'reject'
      );
    }

    return result;
  }

  /**
   * Record resource usage
   */
  async recordUsage(
    tenantId: string,
    resource: ResourceType,
    amount: number,
    context?: {
      runId?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const unit = this.getResourceUnit(resource);

    try {
      await this.pool.query(
        `INSERT INTO tenant_usage
         (tenant_id, resource_type, amount, unit, run_id, task_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          resource,
          amount,
          unit,
          context?.runId || null,
          context?.taskId || null,
          JSON.stringify(context?.metadata || {}),
        ]
      );

      logger.debug(
        { tenantId, resource, amount, unit },
        'Recorded resource usage'
      );
    } catch (err) {
      logger.error({ err, tenantId, resource }, 'Failed to record usage');
      throw err;
    }
  }

  /**
   * Enforce quota (check and record)
   */
  async enforceQuota(
    tenantId: string,
    resource: ResourceType,
    amount: number,
    context?: {
      runId?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<QuotaCheckResult> {
    // Check quota
    const result = await this.checkQuota(tenantId, resource, amount);

    // If allowed, record usage
    if (result.allowed) {
      await this.recordUsage(tenantId, resource, amount, context);

      // Check if approaching threshold for throttling
      const quotas = this.quotas.get(tenantId);
      if (quotas?.throttleEnabled && result.percentUsed >= quotas.throttleThreshold * 100) {
        await this.throttleTenant(
          tenantId,
          `${resource} usage at ${result.percentUsed.toFixed(1)}%`
        );
      }
    }

    return result;
  }

  /**
   * Get tenant resource usage
   */
  async getTenantUsage(tenantId: string): Promise<ResourceUsage> {
    // Query aggregated usage from v_tenant_usage_current view
    const result = await this.pool.query(
      `SELECT * FROM v_tenant_usage_current WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      // No usage yet, return zeros
      const quotas = this.quotas.get(tenantId) || DEFAULT_TENANT_QUOTAS;
      return {
        tenantId,
        cpu: { used: 0, quota: quotas.maxCPUCores, percent: 0 },
        memory: { usedGB: 0, quotaGB: quotas.maxMemoryGB, percent: 0 },
        storage: { usedGB: 0, quotaGB: quotas.maxStorageGB, percent: 0 },
        tokens: { usedToday: 0, quotaPerDay: quotas.maxTokensPerDay, percent: 0 },
        cost: { spentTodayUSD: 0, quotaPerDayUSD: quotas.maxCostPerDayUSD, percent: 0 },
        gpus: { used: 0, quota: quotas.maxGPUs, percent: 0 },
        concurrentRuns: { active: 0, quota: quotas.maxConcurrentRuns, percent: 0 },
      };
    }

    const row = result.rows[0];

    return {
      tenantId,
      cpu: {
        used: parseFloat(row.cpu_used) || 0,
        quota: parseInt(row.cpu_quota) || 0,
        percent: parseFloat(row.cpu_percent) || 0,
      },
      memory: {
        usedGB: parseFloat(row.memory_used_gb) || 0,
        quotaGB: parseInt(row.memory_quota_gb) || 0,
        percent: parseFloat(row.memory_percent) || 0,
      },
      storage: {
        usedGB: parseFloat(row.storage_used_gb) || 0,
        quotaGB: parseInt(row.storage_quota_gb) || 0,
        percent: parseFloat(row.storage_percent) || 0,
      },
      tokens: {
        usedToday: parseFloat(row.tokens_used_today) || 0,
        quotaPerDay: parseInt(row.tokens_quota_per_day) || 0,
        percent: parseFloat(row.tokens_percent) || 0,
      },
      cost: {
        spentTodayUSD: parseFloat(row.cost_spent_today_usd) || 0,
        quotaPerDayUSD: parseFloat(row.cost_quota_per_day_usd) || 0,
        percent: parseFloat(row.cost_percent) || 0,
      },
      gpus: {
        used: parseFloat(row.gpus_used) || 0,
        quota: parseInt(row.gpus_quota) || 0,
        percent: parseFloat(row.gpu_percent) || 0,
      },
      concurrentRuns: {
        active: parseFloat(row.concurrent_runs_active) || 0,
        quota: parseInt(row.concurrent_runs_quota) || 0,
        percent: parseFloat(row.concurrent_runs_percent) || 0,
      },
    };
  }

  /**
   * Throttle tenant (noisy neighbor protection)
   */
  async throttleTenant(tenantId: string, reason: string): Promise<void> {
    const quotas = this.quotas.get(tenantId);
    if (!quotas?.throttleEnabled) {
      return;
    }

    // Throttle for 5 minutes
    const throttleUntil = new Date(Date.now() + 5 * 60 * 1000);
    this.throttledTenants.set(tenantId, throttleUntil);

    // Record violation
    const usage = await this.getTenantUsage(tenantId);
    const highestPercent = Math.max(
      usage.cpu.percent,
      usage.memory.percent,
      usage.cost.percent
    );

    await this.recordViolation(
      tenantId,
      'cpu', // Placeholder, could be any resource
      quotas.throttleThreshold,
      highestPercent / 100,
      'throttle'
    );

    this.emit('tenant-throttled', { tenantId, reason, throttleUntil });

    logger.warn({ tenantId, reason, throttleUntil }, 'Tenant throttled');
  }

  /**
   * Check if tenant is currently throttled
   */
  isThrottled(tenantId: string): boolean {
    const throttleUntil = this.throttledTenants.get(tenantId);
    if (!throttleUntil) {
      return false;
    }

    if (new Date() > throttleUntil) {
      // Throttle expired
      this.throttledTenants.delete(tenantId);
      logger.info({ tenantId }, 'Throttle expired for tenant');
      return false;
    }

    return true;
  }

  /**
   * Record quota violation
   */
  private async recordViolation(
    tenantId: string,
    resourceType: ResourceType,
    quotaValue: number,
    actualValue: number,
    actionTaken: 'throttle' | 'pause' | 'alert' | 'reject' | 'burst_allowed'
  ): Promise<void> {
    const overageAmount = actualValue - quotaValue;
    const overagePercent = quotaValue > 0 ? (overageAmount / quotaValue) * 100 : 0;

    // Determine severity
    let severity: 'low' | 'medium' | 'high' | 'critical';
    if (overagePercent < 10) {
      severity = 'low';
    } else if (overagePercent < 25) {
      severity = 'medium';
    } else if (overagePercent < 50) {
      severity = 'high';
    } else {
      severity = 'critical';
    }

    try {
      await this.pool.query(
        `INSERT INTO quota_violations
         (tenant_id, resource_type, quota_value, actual_value, overage_amount,
          overage_percent, action_taken, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          resourceType,
          quotaValue,
          actualValue,
          overageAmount,
          overagePercent,
          actionTaken,
          severity,
        ]
      );

      this.emit('quota-violation', {
        tenantId,
        resourceType,
        quotaValue,
        actualValue,
        overagePercent,
        severity,
        actionTaken,
      });

      logger.warn(
        { tenantId, resourceType, overagePercent, severity, actionTaken },
        'Quota violation recorded'
      );
    } catch (err) {
      logger.error({ err, tenantId }, 'Failed to record quota violation');
    }
  }

  /**
   * Get quota violations for a tenant
   */
  async getViolations(
    tenantId: string,
    limit: number = 10
  ): Promise<QuotaViolation[]> {
    const result = await this.pool.query(
      `SELECT *
       FROM quota_violations
       WHERE tenant_id = $1
       ORDER BY violation_time DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      resourceType: row.resource_type,
      quotaValue: parseFloat(row.quota_value),
      actualValue: parseFloat(row.actual_value),
      overageAmount: parseFloat(row.overage_amount),
      overagePercent: parseFloat(row.overage_percent),
      actionTaken: row.action_taken,
      severity: row.severity,
      violationTime: row.violation_time,
      resolvedAt: row.resolved_at,
      runId: row.run_id,
      taskId: row.task_id,
    }));
  }

  /**
   * Resolve quota violation
   */
  async resolveViolation(violationId: string): Promise<void> {
    await this.pool.query(
      `UPDATE quota_violations
       SET resolved_at = NOW()
       WHERE id = $1`,
      [violationId]
    );

    logger.info({ violationId }, 'Quota violation resolved');
  }

  /**
   * Get resource unit
   */
  private getResourceUnit(resource: ResourceType): string {
    switch (resource) {
      case 'cpu':
        return 'cores';
      case 'memory':
        return 'GB';
      case 'storage':
        return 'GB';
      case 'tokens':
        return 'tokens';
      case 'cost':
        return 'USD';
      case 'gpu':
        return 'count';
      case 'concurrent_runs':
        return 'count';
      default:
        return 'units';
    }
  }

  /**
   * Get tenant quotas
   */
  getQuotas(tenantId: string): TenantQuotas | undefined {
    return this.quotas.get(tenantId);
  }

  /**
   * Get all tenant IDs
   */
  getAllTenantIds(): string[] {
    return Array.from(this.quotas.keys());
  }
}

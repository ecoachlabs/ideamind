/**
 * GPU Scheduler
 *
 * Roadmap: M9 - Ops & DR
 *
 * Tool: gpu.scheduler
 *
 * Manages GPU resource allocation, queueing, and fair scheduling
 * for LLM inference workloads.
 *
 * Acceptance:
 * - Fair share enforced
 * - Queue wait <30s at 80% utilization
 * - GPU utilization >85%
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';

const logger = pino({ name: 'gpu-scheduler' });

// ============================================================================
// Types
// ============================================================================

export interface GPUResource {
  id: string;
  name: string;
  model: string;
  memoryGB: number;
  computeCapability: string;
  available: boolean;
  currentUtilization: number;
  temperature: number;
  powerUsageW: number;
}

export interface GPUJob {
  id: string;
  tenantId: string;
  modelId: string;
  priority: number;
  requestedMemoryGB: number;
  estimatedDuration: number;
  submittedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  gpuId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface SchedulerConfig {
  fairShareEnabled: boolean;
  maxWaitTimeMs: number;
  targetUtilization: number;
  preemptionEnabled: boolean;
  quotas: Map<string, TenantQuota>;
}

export interface TenantQuota {
  tenantId: string;
  maxGPUs: number;
  maxMemoryGB: number;
  maxJobsPerHour: number;
  priority: number;
}

export interface SchedulingDecision {
  jobId: string;
  gpuId: string;
  estimatedStartTime: Date;
  estimatedCompletionTime: Date;
  queuePosition: number;
}

export interface GPUMetrics {
  totalGPUs: number;
  availableGPUs: number;
  avgUtilization: number;
  queueLength: number;
  avgWaitTimeMs: number;
  throughput: number;
}

// ============================================================================
// GPU Scheduler
// ============================================================================

export class GPUScheduler extends EventEmitter {
  private gpus: Map<string, GPUResource> = new Map();
  private queue: GPUJob[] = [];
  private runningJobs: Map<string, GPUJob> = new Map();
  private config: SchedulerConfig;

  constructor(private db: Pool) {
    super();

    this.config = {
      fairShareEnabled: true,
      maxWaitTimeMs: 30000, // 30 seconds
      targetUtilization: 0.85, // 85%
      preemptionEnabled: false,
      quotas: new Map(),
    };

    // Start scheduling loop
    this.startSchedulingLoop();
  }

  /**
   * Register GPU resource
   */
  async registerGPU(gpu: GPUResource): Promise<void> {
    this.gpus.set(gpu.id, gpu);

    await this.db.query(
      `
      INSERT INTO gpu_resources (
        gpu_id, name, model, memory_gb, compute_capability, available
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (gpu_id) DO UPDATE SET
        name = $2, model = $3, memory_gb = $4, compute_capability = $5, available = $6
    `,
      [gpu.id, gpu.name, gpu.model, gpu.memoryGB, gpu.computeCapability, gpu.available]
    );

    logger.info({ gpuId: gpu.id, model: gpu.model }, 'GPU registered');
    this.emit('gpu-registered', gpu);
  }

  /**
   * Submit job to queue
   */
  async submitJob(job: Omit<GPUJob, 'id' | 'submittedAt' | 'status'>): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const gpuJob: GPUJob = {
      id: jobId,
      ...job,
      submittedAt: new Date(),
      status: 'queued',
    };

    // Check quota
    const quota = this.config.quotas.get(job.tenantId);
    if (quota) {
      const currentUsage = this.getTenantUsage(job.tenantId);
      if (currentUsage.gpuCount >= quota.maxGPUs) {
        throw new Error(`Tenant ${job.tenantId} exceeded GPU quota`);
      }
      if (currentUsage.memoryGB + job.requestedMemoryGB > quota.maxMemoryGB) {
        throw new Error(`Tenant ${job.tenantId} exceeded memory quota`);
      }
    }

    // Add to queue
    this.queue.push(gpuJob);

    // Store in database
    await this.db.query(
      `
      INSERT INTO gpu_jobs (
        job_id, tenant_id, model_id, priority, requested_memory_gb, estimated_duration, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        jobId,
        job.tenantId,
        job.modelId,
        job.priority,
        job.requestedMemoryGB,
        job.estimatedDuration,
        'queued',
      ]
    );

    logger.info({ jobId, tenantId: job.tenantId }, 'Job submitted');
    this.emit('job-submitted', gpuJob);

    // Trigger scheduling
    await this.schedule();

    return jobId;
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    // Check if running
    const runningJob = this.runningJobs.get(jobId);
    if (runningJob) {
      runningJob.status = 'cancelled';
      runningJob.completedAt = new Date();
      this.runningJobs.delete(jobId);

      // Free GPU
      if (runningJob.gpuId) {
        const gpu = this.gpus.get(runningJob.gpuId);
        if (gpu) {
          gpu.available = true;
          gpu.currentUtilization = 0;
        }
      }

      await this.updateJobStatus(jobId, 'cancelled');
      this.emit('job-cancelled', runningJob);
      return true;
    }

    // Check if in queue
    const queueIndex = this.queue.findIndex((j) => j.id === jobId);
    if (queueIndex !== -1) {
      const job = this.queue[queueIndex];
      job.status = 'cancelled';
      this.queue.splice(queueIndex, 1);

      await this.updateJobStatus(jobId, 'cancelled');
      this.emit('job-cancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Schedule jobs to GPUs
   */
  private async schedule(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    // Sort queue by priority and submit time
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.submittedAt.getTime() - b.submittedAt.getTime(); // FIFO
    });

    // Apply fair share if enabled
    if (this.config.fairShareEnabled) {
      this.applyFairShare();
    }

    // Try to assign jobs to available GPUs
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const job = this.queue[i];

      // Find suitable GPU
      const gpu = this.findSuitableGPU(job);

      if (gpu) {
        // Assign job to GPU
        await this.assignJobToGPU(job, gpu);

        // Remove from queue
        this.queue.splice(i, 1);
      }
    }

    // Check queue wait times
    await this.checkQueueWaitTimes();
  }

  /**
   * Find suitable GPU for job
   */
  private findSuitableGPU(job: GPUJob): GPUResource | null {
    for (const gpu of this.gpus.values()) {
      if (
        gpu.available &&
        gpu.memoryGB >= job.requestedMemoryGB &&
        gpu.temperature < 85 // Safety threshold
      ) {
        return gpu;
      }
    }

    return null;
  }

  /**
   * Assign job to GPU
   */
  private async assignJobToGPU(job: GPUJob, gpu: GPUResource): Promise<void> {
    job.gpuId = gpu.id;
    job.status = 'running';
    job.startedAt = new Date();

    gpu.available = false;
    gpu.currentUtilization = 0.9; // Assume 90% utilization

    this.runningJobs.set(job.id, job);

    await this.db.query(
      `UPDATE gpu_jobs SET status = 'running', gpu_id = $1, started_at = NOW() WHERE job_id = $2`,
      [gpu.id, job.id]
    );

    logger.info({ jobId: job.id, gpuId: gpu.id }, 'Job assigned to GPU');
    this.emit('job-started', job);

    // Simulate job completion
    setTimeout(() => this.completeJob(job.id), job.estimatedDuration);
  }

  /**
   * Complete job
   */
  private async completeJob(jobId: string): Promise<void> {
    const job = this.runningJobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.completedAt = new Date();

    // Free GPU
    if (job.gpuId) {
      const gpu = this.gpus.get(job.gpuId);
      if (gpu) {
        gpu.available = true;
        gpu.currentUtilization = 0;
      }
    }

    this.runningJobs.delete(jobId);

    await this.updateJobStatus(jobId, 'completed');

    logger.info({ jobId, duration: job.estimatedDuration }, 'Job completed');
    this.emit('job-completed', job);

    // Trigger next scheduling
    await this.schedule();
  }

  /**
   * Apply fair share scheduling
   */
  private applyFairShare(): void {
    // Group jobs by tenant
    const tenantJobs = new Map<string, GPUJob[]>();

    for (const job of this.queue) {
      if (!tenantJobs.has(job.tenantId)) {
        tenantJobs.set(job.tenantId, []);
      }
      tenantJobs.get(job.tenantId)!.push(job);
    }

    // Calculate fair share priority
    for (const [tenantId, jobs] of tenantJobs) {
      const currentUsage = this.getTenantUsage(tenantId);
      const fairShareBoost = this.calculateFairShareBoost(currentUsage.gpuCount);

      for (const job of jobs) {
        job.priority += fairShareBoost;
      }
    }
  }

  /**
   * Calculate fair share priority boost
   */
  private calculateFairShareBoost(currentGPUs: number): number {
    // Tenants with fewer GPUs get higher priority
    const totalGPUs = this.gpus.size;
    const fairShare = totalGPUs / this.config.quotas.size;

    if (currentGPUs < fairShare) {
      return 10; // Boost priority
    } else if (currentGPUs > fairShare * 2) {
      return -10; // Reduce priority
    }

    return 0;
  }

  /**
   * Get tenant usage
   */
  private getTenantUsage(tenantId: string): { gpuCount: number; memoryGB: number } {
    let gpuCount = 0;
    let memoryGB = 0;

    for (const job of this.runningJobs.values()) {
      if (job.tenantId === tenantId) {
        gpuCount++;
        memoryGB += job.requestedMemoryGB;
      }
    }

    return { gpuCount, memoryGB };
  }

  /**
   * Check queue wait times
   */
  private async checkQueueWaitTimes(): Promise<void> {
    const now = new Date();

    for (const job of this.queue) {
      const waitTime = now.getTime() - job.submittedAt.getTime();

      if (waitTime > this.config.maxWaitTimeMs) {
        logger.warn(
          { jobId: job.id, waitTime },
          'Job exceeds max wait time'
        );
        this.emit('job-wait-exceeded', { job, waitTime });

        // Boost priority
        job.priority += 20;
      }
    }
  }

  /**
   * Get metrics
   */
  async getMetrics(): Promise<GPUMetrics> {
    const totalGPUs = this.gpus.size;
    const availableGPUs = Array.from(this.gpus.values()).filter((g) => g.available).length;

    let totalUtilization = 0;
    for (const gpu of this.gpus.values()) {
      totalUtilization += gpu.currentUtilization;
    }
    const avgUtilization = totalGPUs > 0 ? totalUtilization / totalGPUs : 0;

    // Calculate average wait time
    const now = new Date();
    let totalWaitTime = 0;
    for (const job of this.queue) {
      totalWaitTime += now.getTime() - job.submittedAt.getTime();
    }
    const avgWaitTimeMs = this.queue.length > 0 ? totalWaitTime / this.queue.length : 0;

    // Calculate throughput (jobs per hour)
    const oneHourAgo = new Date(Date.now() - 3600000);
    const result = await this.db.query(
      `SELECT COUNT(*) FROM gpu_jobs WHERE completed_at > $1`,
      [oneHourAgo]
    );
    const throughput = parseInt(result.rows[0].count);

    return {
      totalGPUs,
      availableGPUs,
      avgUtilization,
      queueLength: this.queue.length,
      avgWaitTimeMs,
      throughput,
    };
  }

  /**
   * Set tenant quota
   */
  async setTenantQuota(quota: TenantQuota): Promise<void> {
    this.config.quotas.set(quota.tenantId, quota);

    await this.db.query(
      `
      INSERT INTO gpu_quotas (tenant_id, max_gpus, max_memory_gb, max_jobs_per_hour, priority)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id) DO UPDATE SET
        max_gpus = $2, max_memory_gb = $3, max_jobs_per_hour = $4, priority = $5
    `,
      [
        quota.tenantId,
        quota.maxGPUs,
        quota.maxMemoryGB,
        quota.maxJobsPerHour,
        quota.priority,
      ]
    );

    logger.info({ tenantId: quota.tenantId, maxGPUs: quota.maxGPUs }, 'Quota set');
  }

  /**
   * Start scheduling loop
   */
  private startSchedulingLoop(): void {
    setInterval(async () => {
      await this.schedule();
    }, 5000); // Every 5 seconds
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string,
    status: GPUJob['status']
  ): Promise<void> {
    await this.db.query(
      `UPDATE gpu_jobs SET status = $1, completed_at = NOW() WHERE job_id = $2`,
      [status, jobId]
    );
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const GPU_SCHEDULER_MIGRATION = `
-- GPU resources table
CREATE TABLE IF NOT EXISTS gpu_resources (
  gpu_id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  model VARCHAR(100) NOT NULL,
  memory_gb INTEGER NOT NULL,
  compute_capability VARCHAR(20) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  current_utilization NUMERIC(3,2) DEFAULT 0.0,
  temperature NUMERIC(5,2),
  power_usage_w NUMERIC(6,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gpu_available ON gpu_resources(available);

COMMENT ON TABLE gpu_resources IS 'GPU resource inventory';

-- GPU jobs table
CREATE TABLE IF NOT EXISTS gpu_jobs (
  job_id VARCHAR(100) PRIMARY KEY,
  tenant_id VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  requested_memory_gb INTEGER NOT NULL,
  estimated_duration INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL,
  gpu_id VARCHAR(100),
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON gpu_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON gpu_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_gpu ON gpu_jobs(gpu_id);
CREATE INDEX IF NOT EXISTS idx_jobs_submitted ON gpu_jobs(submitted_at);

COMMENT ON TABLE gpu_jobs IS 'GPU job queue and history';

-- GPU quotas table
CREATE TABLE IF NOT EXISTS gpu_quotas (
  tenant_id VARCHAR(100) PRIMARY KEY,
  max_gpus INTEGER NOT NULL,
  max_memory_gb INTEGER NOT NULL,
  max_jobs_per_hour INTEGER NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gpu_quotas IS 'Tenant GPU resource quotas';
`;

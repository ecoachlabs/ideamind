/**
 * Waiver Manager - Gate Violation Waiver System
 *
 * Spec: orchestrator.txt:183, phase.txt:97
 * "Waivers (for rare exceptions) require owner, expiry, compensating control"
 *
 * **Purpose:**
 * Manage gate violation waivers with expiration tracking and compensating controls.
 * Waivers allow certain gate violations to be bypassed temporarily under controlled
 * conditions with proper accountability.
 *
 * **Use Cases:**
 * - Security gate CVE waivers (with mitigation plan)
 * - QA gate test waivers (with manual verification)
 * - Release gate compliance waivers (with legal approval)
 *
 * **Waiver Lifecycle:**
 * 1. Request: Submitted with justification and compensating control
 * 2. Active: Approved and not expired
 * 3. Expired: Past expiration date, violation resurfaces
 * 4. Revoked: Manually canceled before expiration
 */

import pino from 'pino';
import { EventEmitter } from 'events';
import { Pool } from 'pg';

const logger = pino({ name: 'waiver-manager' });

/**
 * Waiver for a gate violation
 */
export interface Waiver {
  id: string;
  runId: string;
  phase: string;
  violationType: string; // e.g., "CVE-2024-1234", "test_coverage_low", "security_scan_failed"
  violationDetails: string;
  owner: string; // Person responsible for this waiver
  justification: string;
  compensatingControl: string; // What mitigates the risk (e.g., "manual review", "network isolation")
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  metadata?: Record<string, any>;
}

/**
 * Waiver request
 */
export interface WaiverRequest {
  runId: string;
  phase: string;
  violationType: string;
  violationDetails: string;
  owner: string;
  justification: string;
  compensatingControl: string;
  expirationDays?: number; // Defaults to 30 days
  requiresApproval?: boolean;
}

/**
 * Waiver check result
 */
export interface WaiverCheckResult {
  hasActiveWaiver: boolean;
  waiver?: Waiver;
  reason?: string;
}

/**
 * Waiver Manager
 *
 * Manages gate violation waivers with expiration and compensating controls.
 */
export class WaiverManager extends EventEmitter {
  private waivers: Map<string, Waiver> = new Map(); // waiverId -> Waiver

  constructor(private db: Pool) {
    super();
    this.loadWaiversFromDatabase();
    this.startExpirationMonitor();
  }

  /**
   * Request a waiver for a gate violation
   */
  async requestWaiver(request: WaiverRequest): Promise<Waiver> {
    const waiverId = `waiver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const expirationDays = request.expirationDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const waiver: Waiver = {
      id: waiverId,
      runId: request.runId,
      phase: request.phase,
      violationType: request.violationType,
      violationDetails: request.violationDetails,
      owner: request.owner,
      justification: request.justification,
      compensatingControl: request.compensatingControl,
      createdAt: new Date(),
      expiresAt,
      status: request.requiresApproval ? 'pending' : 'active',
    };

    logger.info(
      {
        waiverId,
        runId: request.runId,
        phase: request.phase,
        violationType: request.violationType,
        expiresAt,
      },
      'Waiver requested'
    );

    // Store in memory
    this.waivers.set(waiverId, waiver);

    // Persist to database
    await this.db.query(
      `
      INSERT INTO waivers (
        id, run_id, phase, violation_type, violation_details,
        owner, justification, compensating_control,
        created_at, expires_at, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
        waiver.id,
        waiver.runId,
        waiver.phase,
        waiver.violationType,
        waiver.violationDetails,
        waiver.owner,
        waiver.justification,
        waiver.compensatingControl,
        waiver.createdAt,
        waiver.expiresAt,
        waiver.status,
        JSON.stringify(waiver.metadata || {}),
      ]
    );

    this.emit('waiver.requested', {
      waiverId,
      runId: request.runId,
      phase: request.phase,
      violationType: request.violationType,
    });

    logger.info({ waiverId }, 'Waiver created');

    return waiver;
  }

  /**
   * Approve a pending waiver
   */
  async approveWaiver(waiverId: string, approvedBy: string): Promise<Waiver> {
    const waiver = this.waivers.get(waiverId);
    if (!waiver) {
      throw new Error(`Waiver not found: ${waiverId}`);
    }

    if (waiver.status !== 'pending') {
      throw new Error(`Waiver ${waiverId} is not pending approval (status: ${waiver.status})`);
    }

    logger.info({ waiverId, approvedBy }, 'Approving waiver');

    waiver.status = 'active';
    waiver.approvedBy = approvedBy;
    waiver.approvedAt = new Date();

    await this.db.query(
      `
      UPDATE waivers SET
        status = $1,
        approved_by = $2,
        approved_at = $3,
        updated_at = NOW()
      WHERE id = $4
    `,
      [waiver.status, waiver.approvedBy, waiver.approvedAt, waiverId]
    );

    this.emit('waiver.approved', {
      waiverId,
      runId: waiver.runId,
      phase: waiver.phase,
      approvedBy,
    });

    logger.info({ waiverId }, 'Waiver approved');

    return waiver;
  }

  /**
   * Revoke an active waiver
   */
  async revokeWaiver(waiverId: string, reason?: string): Promise<Waiver> {
    const waiver = this.waivers.get(waiverId);
    if (!waiver) {
      throw new Error(`Waiver not found: ${waiverId}`);
    }

    if (waiver.status !== 'active') {
      throw new Error(`Waiver ${waiverId} is not active (status: ${waiver.status})`);
    }

    logger.info({ waiverId, reason }, 'Revoking waiver');

    waiver.status = 'revoked';
    waiver.revokedAt = new Date();
    if (reason) {
      waiver.metadata = { ...waiver.metadata, revocationReason: reason };
    }

    await this.db.query(
      `
      UPDATE waivers SET
        status = $1,
        revoked_at = $2,
        metadata = $3,
        updated_at = NOW()
      WHERE id = $4
    `,
      [waiver.status, waiver.revokedAt, JSON.stringify(waiver.metadata || {}), waiverId]
    );

    this.emit('waiver.revoked', {
      waiverId,
      runId: waiver.runId,
      phase: waiver.phase,
      reason,
    });

    logger.info({ waiverId }, 'Waiver revoked');

    return waiver;
  }

  /**
   * Check if there's an active waiver for a specific violation
   */
  async checkWaiver(
    runId: string,
    phase: string,
    violationType: string
  ): Promise<WaiverCheckResult> {
    // Find active waiver for this run/phase/violation
    const waiver = Array.from(this.waivers.values()).find(
      (w) =>
        w.runId === runId &&
        w.phase === phase &&
        w.violationType === violationType &&
        w.status === 'active' &&
        w.expiresAt > new Date()
    );

    if (waiver) {
      logger.debug(
        {
          waiverId: waiver.id,
          runId,
          phase,
          violationType,
        },
        'Active waiver found'
      );

      return {
        hasActiveWaiver: true,
        waiver,
      };
    }

    return {
      hasActiveWaiver: false,
      reason: 'No active waiver found for this violation',
    };
  }

  /**
   * Get all waivers for a run
   */
  async getWaiversForRun(runId: string): Promise<Waiver[]> {
    return Array.from(this.waivers.values()).filter((w) => w.runId === runId);
  }

  /**
   * Get all waivers for a phase
   */
  async getWaiversForPhase(runId: string, phase: string): Promise<Waiver[]> {
    return Array.from(this.waivers.values()).filter(
      (w) => w.runId === runId && w.phase === phase
    );
  }

  /**
   * Get all active waivers
   */
  async getActiveWaivers(): Promise<Waiver[]> {
    return Array.from(this.waivers.values()).filter(
      (w) => w.status === 'active' && w.expiresAt > new Date()
    );
  }

  /**
   * Get all expired waivers
   */
  async getExpiredWaivers(): Promise<Waiver[]> {
    return Array.from(this.waivers.values()).filter(
      (w) => w.status === 'active' && w.expiresAt <= new Date()
    );
  }

  /**
   * Get waiver by ID
   */
  getWaiver(waiverId: string): Waiver | undefined {
    return this.waivers.get(waiverId);
  }

  /**
   * Expire old waivers
   */
  async expireWaivers(): Promise<number> {
    const now = new Date();
    const expiredWaivers = Array.from(this.waivers.values()).filter(
      (w) => w.status === 'active' && w.expiresAt <= now
    );

    let expiredCount = 0;

    for (const waiver of expiredWaivers) {
      logger.info({ waiverId: waiver.id }, 'Expiring waiver');

      waiver.status = 'expired';

      await this.db.query(
        `UPDATE waivers SET status = $1, updated_at = NOW() WHERE id = $2`,
        [waiver.status, waiver.id]
      );

      this.emit('waiver.expired', {
        waiverId: waiver.id,
        runId: waiver.runId,
        phase: waiver.phase,
        violationType: waiver.violationType,
      });

      expiredCount++;
    }

    if (expiredCount > 0) {
      logger.info({ expiredCount }, 'Waivers expired');
    }

    return expiredCount;
  }

  /**
   * Get waiver statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    expired: number;
    revoked: number;
    expiring_soon: number; // Expiring within 7 days
  }> {
    const waivers = Array.from(this.waivers.values());
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      total: waivers.length,
      active: waivers.filter((w) => w.status === 'active' && w.expiresAt > now).length,
      pending: waivers.filter((w) => w.status === 'pending').length,
      expired: waivers.filter((w) => w.status === 'expired').length,
      revoked: waivers.filter((w) => w.status === 'revoked').length,
      expiring_soon: waivers.filter(
        (w) => w.status === 'active' && w.expiresAt > now && w.expiresAt <= sevenDaysFromNow
      ).length,
    };
  }

  /**
   * Load waivers from database
   */
  private async loadWaiversFromDatabase(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT * FROM waivers WHERE status IN ('active', 'pending') AND expires_at > NOW()`
      );

      for (const row of result.rows) {
        const waiver: Waiver = {
          id: row.id,
          runId: row.run_id,
          phase: row.phase,
          violationType: row.violation_type,
          violationDetails: row.violation_details,
          owner: row.owner,
          justification: row.justification,
          compensatingControl: row.compensating_control,
          approvedBy: row.approved_by,
          approvedAt: row.approved_at,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at,
          status: row.status,
          metadata: row.metadata,
        };

        this.waivers.set(waiver.id, waiver);
      }

      logger.info({ count: this.waivers.size }, 'Waivers loaded from database');
    } catch (error: any) {
      logger.warn({ error }, 'Failed to load waivers from database');
    }
  }

  /**
   * Start expiration monitor
   * Checks for expired waivers every hour
   */
  private startExpirationMonitor(): void {
    const interval = 60 * 60 * 1000; // 1 hour

    setInterval(async () => {
      try {
        await this.expireWaivers();
      } catch (error: any) {
        logger.error({ error }, 'Expiration monitor error');
      }
    }, interval);

    logger.info({ intervalMs: interval }, 'Expiration monitor started');
  }
}

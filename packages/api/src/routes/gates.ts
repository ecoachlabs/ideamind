/**
 * Internal API - Gates
 *
 * Spec: orchestrator.txt:102-106, phase.txt:137-141
 * Endpoint: POST /gates/{phase}/evaluate {evidencePack}
 *
 * Purpose: Evaluate gate for a phase
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

export function createGatesRouter(dbPool: Pool): Router {
  const router = Router();

  /**
   * POST /gates/:phase/evaluate
   * Evaluate gate for a phase
   *
   * Body: EvidencePack {
   *   run_id: string,
   *   phase: string,
   *   artifacts: string[],
   *   guard_reports: any[],
   *   qav_summary: any,
   *   kmap_refs: string[],
   *   metrics: any
   * }
   */
  router.post('/:phase/evaluate', async (req: Request, res: Response) => {
    try {
      const { phase } = req.params;
      const evidencePack = req.body;

      console.log(`[GatesAPI] Evaluating gate for phase ${phase}`);

      // Validate required fields
      if (!evidencePack.run_id || !evidencePack.phase) {
        return res.status(400).json({
          error: 'Missing required fields: run_id, phase',
        });
      }

      if (evidencePack.phase !== phase) {
        return res.status(400).json({
          error: `Phase mismatch: ${evidencePack.phase} != ${phase}`,
        });
      }

      // Load gate evaluator for phase
      const { PhaseGateFactory } = await import(
        '@ideamine/orchestrator-core/gatekeeper/gates'
      );
      const gate = PhaseGateFactory.createGate(phase);

      if (!gate) {
        return res.status(404).json({
          error: `No gate defined for phase: ${phase}`,
        });
      }

      // Evaluate gate
      const gateResult = await gate.evaluate({
        runId: evidencePack.run_id,
        phase: evidencePack.phase,
        artifacts: evidencePack.artifacts || [],
        guardReports: evidencePack.guard_reports || [],
        qavSummary: evidencePack.qav_summary,
        kmapRefs: evidencePack.kmap_refs || [],
        metrics: evidencePack.metrics || {},
      });

      // Persist gate result
      await dbPool.query(
        `
        INSERT INTO gate_evaluations (
          id, run_id, phase, status, score, threshold,
          decision_reasons, blocking_violations, created_at,
          evidence_pack_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10)
      `,
        [
          `gate-${evidencePack.run_id}-${phase}-${Date.now()}`,
          evidencePack.run_id,
          phase,
          gateResult.status,
          gateResult.overallScore,
          gate.getThreshold?.() || 70,
          JSON.stringify(gateResult.decision?.reasons || []),
          JSON.stringify(gateResult.blockingViolations || []),
          evidencePack.id || null,
          JSON.stringify(gateResult.metadata || {}),
        ]
      );

      console.log(
        `[GatesAPI] Gate evaluation complete: ${gateResult.status} (score: ${gateResult.overallScore})`
      );

      res.json({
        result: {
          status: gateResult.status,
          overall_score: gateResult.overallScore,
          threshold: gate.getThreshold?.() || 70,
          decision: gateResult.decision,
          blocking_violations: gateResult.blockingViolations || [],
          metadata: gateResult.metadata || {},
        },
      });
    } catch (error: any) {
      console.error('[GatesAPI] Gate evaluation failed:', error);
      res.status(500).json({
        error: 'Gate evaluation failed',
        message: error.message,
      });
    }
  });

  /**
   * GET /gates/:phase/threshold
   * Get gate threshold for a phase
   */
  router.get('/:phase/threshold', async (req: Request, res: Response) => {
    try {
      const { phase } = req.params;

      const { PhaseGateFactory } = await import(
        '@ideamine/orchestrator-core/gatekeeper/gates'
      );
      const gate = PhaseGateFactory.createGate(phase);

      if (!gate) {
        return res.status(404).json({
          error: `No gate defined for phase: ${phase}`,
        });
      }

      res.json({
        phase,
        threshold: gate.getThreshold?.() || 70,
      });
    } catch (error: any) {
      console.error('[GatesAPI] Failed to get threshold:', error);
      res.status(500).json({
        error: 'Failed to get threshold',
        message: error.message,
      });
    }
  });

  return router;
}

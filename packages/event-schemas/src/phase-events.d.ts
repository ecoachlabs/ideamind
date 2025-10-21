/**
 * Phase Lifecycle Events (7 types)
 * Spec: phase.txt:129-144, UNIFIED_IMPLEMENTATION_SPEC.md Section 1.3
 *
 * These structured events are emitted by Phase Coordinators to track
 * phase execution lifecycle. All events follow a consistent structure
 * with type, keys (run_id, phase), and typed payload.
 */
/**
 * Phase Event Types
 */
export declare enum PhaseEventType {
    PHASE_STARTED = "phase.started",
    PHASE_PROGRESS = "phase.progress",
    PHASE_STALLED = "phase.stalled",
    PHASE_READY = "phase.ready",
    PHASE_GATE_PASSED = "phase.gate.passed",
    PHASE_GATE_FAILED = "phase.gate.failed",
    PHASE_ERROR = "phase.error"
}
/**
 * phase.started - Emitted when phase execution begins
 */
export interface PhaseStartedEvent {
    type: PhaseEventType.PHASE_STARTED;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        phase_run_id: string;
        started_at: string;
        config_hash?: string;
    };
}
/**
 * phase.progress - Emitted periodically during phase execution
 */
export interface PhaseProgressEvent {
    type: PhaseEventType.PHASE_PROGRESS;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        task_id: string;
        pct: number;
        eta: string;
        metrics: {
            tasks_completed: number;
            tasks_total: number;
            tokens_used: number;
            tools_minutes_used: number;
        };
    };
}
/**
 * phase.stalled - Emitted when phase execution stalls (no heartbeat)
 */
export interface PhaseStalledEvent {
    type: PhaseEventType.PHASE_STALLED;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        task_id: string;
        reason: string;
        last_heartbeat_at: string;
        stalled_duration_ms: number;
    };
}
/**
 * phase.ready - Emitted after artifacts created, before gate evaluation
 */
export interface PhaseReadyEvent {
    type: PhaseEventType.PHASE_READY;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        phase: string;
        artifacts: string[];
        completed_at: string;
    };
}
/**
 * phase.gate.passed - Emitted when gate evaluation passes
 */
export interface PhaseGatePassedEvent {
    type: PhaseEventType.PHASE_GATE_PASSED;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        phase: string;
        evidence_pack_id: string;
        passed_at: string;
        score: number;
        rubrics_met: string[];
    };
}
/**
 * phase.gate.failed - Emitted when gate evaluation fails
 */
export interface PhaseGateFailedEvent {
    type: PhaseEventType.PHASE_GATE_FAILED;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        phase: string;
        reasons: string[];
        evidence_pack_id: string;
        score: number;
        required_actions: string[];
        can_waive: boolean;
    };
}
/**
 * phase.error - Emitted when phase encounters unrecoverable error
 */
export interface PhaseErrorEvent {
    type: PhaseEventType.PHASE_ERROR;
    keys: {
        run_id: string;
        phase: string;
    };
    payload: {
        phase: string;
        error: string;
        retryable: boolean;
        retry_count?: number;
        stack?: string;
        task_id?: string;
    };
}
/**
 * Union type of all phase events
 */
export type PhaseEvent = PhaseStartedEvent | PhaseProgressEvent | PhaseStalledEvent | PhaseReadyEvent | PhaseGatePassedEvent | PhaseGateFailedEvent | PhaseErrorEvent;
/**
 * Type guard for phase events
 */
export declare function isPhaseEvent(event: any): event is PhaseEvent;
/**
 * Extract phase event type
 */
export declare function getPhaseEventType(event: PhaseEvent): PhaseEventType;
/**
 * Check if event is a gate event (passed or failed)
 */
export declare function isGateEvent(event: PhaseEvent): event is PhaseGatePassedEvent | PhaseGateFailedEvent;
//# sourceMappingURL=phase-events.d.ts.map
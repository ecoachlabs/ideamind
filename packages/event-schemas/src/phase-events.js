"use strict";
/**
 * Phase Lifecycle Events (7 types)
 * Spec: phase.txt:129-144, UNIFIED_IMPLEMENTATION_SPEC.md Section 1.3
 *
 * These structured events are emitted by Phase Coordinators to track
 * phase execution lifecycle. All events follow a consistent structure
 * with type, keys (run_id, phase), and typed payload.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhaseEventType = void 0;
exports.isPhaseEvent = isPhaseEvent;
exports.getPhaseEventType = getPhaseEventType;
exports.isGateEvent = isGateEvent;
/**
 * Phase Event Types
 */
var PhaseEventType;
(function (PhaseEventType) {
    PhaseEventType["PHASE_STARTED"] = "phase.started";
    PhaseEventType["PHASE_PROGRESS"] = "phase.progress";
    PhaseEventType["PHASE_STALLED"] = "phase.stalled";
    PhaseEventType["PHASE_READY"] = "phase.ready";
    PhaseEventType["PHASE_GATE_PASSED"] = "phase.gate.passed";
    PhaseEventType["PHASE_GATE_FAILED"] = "phase.gate.failed";
    PhaseEventType["PHASE_ERROR"] = "phase.error";
})(PhaseEventType || (exports.PhaseEventType = PhaseEventType = {}));
/**
 * Type guard for phase events
 */
function isPhaseEvent(event) {
    return (event &&
        typeof event === 'object' &&
        'type' in event &&
        Object.values(PhaseEventType).includes(event.type));
}
/**
 * Extract phase event type
 */
function getPhaseEventType(event) {
    return event.type;
}
/**
 * Check if event is a gate event (passed or failed)
 */
function isGateEvent(event) {
    return (event.type === PhaseEventType.PHASE_GATE_PASSED ||
        event.type === PhaseEventType.PHASE_GATE_FAILED);
}
//# sourceMappingURL=phase-events.js.map
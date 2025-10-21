import { z } from 'zod';
/**
 * Workflow Created Event
 * Published when a new workflow run is initiated from an idea submission
 */
export declare const WorkflowCreatedEventSchema: any;
export type WorkflowCreatedEvent = z.infer<typeof WorkflowCreatedEventSchema>;
/**
 * Workflow State Changed Event
 * Published when workflow transitions between phases
 */
export declare const WorkflowStateChangedEventSchema: any;
export type WorkflowStateChangedEvent = z.infer<typeof WorkflowStateChangedEventSchema>;
/**
 * Workflow Paused Event
 * Published when workflow is paused (manual intervention or gate block)
 */
export declare const WorkflowPausedEventSchema: any;
export type WorkflowPausedEvent = z.infer<typeof WorkflowPausedEventSchema>;
/**
 * Workflow Resumed Event
 * Published when paused workflow is resumed
 */
export declare const WorkflowResumedEventSchema: any;
export type WorkflowResumedEvent = z.infer<typeof WorkflowResumedEventSchema>;
/**
 * Workflow Failed Event
 * Published when workflow encounters unrecoverable error
 */
export declare const WorkflowFailedEventSchema: any;
export type WorkflowFailedEvent = z.infer<typeof WorkflowFailedEventSchema>;
/**
 * Workflow Completed Event
 * Published when workflow reaches GA state successfully
 */
export declare const WorkflowCompletedEventSchema: any;
export type WorkflowCompletedEvent = z.infer<typeof WorkflowCompletedEventSchema>;
/**
 * Union type of all workflow events
 */
export type WorkflowEvent = WorkflowCreatedEvent | WorkflowStateChangedEvent | WorkflowPausedEvent | WorkflowResumedEvent | WorkflowFailedEvent | WorkflowCompletedEvent;
//# sourceMappingURL=workflow-events.d.ts.map
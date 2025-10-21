import { z } from 'zod';
/**
 * Tool Execution Started Event
 * Published when executor begins running a tool
 */
export declare const ToolExecutionStartedEventSchema: any;
export type ToolExecutionStartedEvent = z.infer<typeof ToolExecutionStartedEventSchema>;
/**
 * Tool Execution Completed Event
 * Published when tool execution finishes successfully
 */
export declare const ToolExecutionCompletedEventSchema: any;
export type ToolExecutionCompletedEvent = z.infer<typeof ToolExecutionCompletedEventSchema>;
/**
 * Tool Execution Failed Event
 * Published when tool execution fails
 */
export declare const ToolExecutionFailedEventSchema: any;
export type ToolExecutionFailedEvent = z.infer<typeof ToolExecutionFailedEventSchema>;
/**
 * Union type of all tool events
 */
export type ToolEvent = ToolExecutionStartedEvent | ToolExecutionCompletedEvent | ToolExecutionFailedEvent;
//# sourceMappingURL=tool-events.d.ts.map
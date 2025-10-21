import { z } from 'zod';
/**
 * Agent Started Event
 * Published when an agent begins execution
 */
export declare const AgentStartedEventSchema: any;
export type AgentStartedEvent = z.infer<typeof AgentStartedEventSchema>;
/**
 * Agent Completed Event
 * Published when agent successfully completes execution
 */
export declare const AgentCompletedEventSchema: any;
export type AgentCompletedEvent = z.infer<typeof AgentCompletedEventSchema>;
/**
 * Agent Failed Event
 * Published when agent encounters an error
 */
export declare const AgentFailedEventSchema: any;
export type AgentFailedEvent = z.infer<typeof AgentFailedEventSchema>;
/**
 * Agent Tool Requested Event
 * Published when agent decides to invoke a tool (Analyzer decision)
 */
export declare const AgentToolRequestedEventSchema: any;
export type AgentToolRequestedEvent = z.infer<typeof AgentToolRequestedEventSchema>;
/**
 * Union type of all agent events
 */
export type AgentEvent = AgentStartedEvent | AgentCompletedEvent | AgentFailedEvent | AgentToolRequestedEvent;
//# sourceMappingURL=agent-events.d.ts.map
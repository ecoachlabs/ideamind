import { ToolInvocationContext, ToolInvocationResult } from './types';
import { ToolClientConfig } from '../../../tool-sdk/src/ts/client';
/**
 * ToolExecutor: Invokes tools via Tool Gateway
 *
 * Handles:
 * - Tool invocation via HTTP to Tool Gateway
 * - Timeout management
 * - Error handling and retries
 * - Cost tracking
 */
export declare class ToolExecutor {
    private toolClient;
    constructor(config?: Partial<ToolClientConfig>);
    /**
     * Invoke a tool via Tool Gateway
     */
    invoke(context: ToolInvocationContext): Promise<ToolInvocationResult>;
}
//# sourceMappingURL=executor.d.ts.map
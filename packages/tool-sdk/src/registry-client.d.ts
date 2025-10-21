import { ToolMetadata, ToolCategory } from './tool-metadata';
/**
 * Tool Registry Client
 *
 * Provides methods for:
 * - Registering new tools
 * - Querying available tools
 * - Fetching tool metadata
 * - Managing tool approvals
 */
export declare class ToolRegistryClient {
    private baseUrl;
    constructor(baseUrl?: string);
    /**
     * Register a new tool
     */
    registerTool(metadata: ToolMetadata): Promise<{
        toolId: string;
        version: string;
    }>;
    /**
     * Get tool metadata
     */
    getTool(toolId: string, version?: string): Promise<ToolMetadata>;
    /**
     * List tools by category
     */
    listToolsByCategory(category: ToolCategory): Promise<ToolMetadata[]>;
    /**
     * List approved tools
     */
    listApprovedTools(): Promise<ToolMetadata[]>;
    /**
     * Search tools by tag
     */
    searchTools(tags: string[]): Promise<ToolMetadata[]>;
    /**
     * Approve a tool
     */
    approveTool(toolId: string, version: string, approvedBy: string): Promise<void>;
    /**
     * Reject a tool
     */
    rejectTool(toolId: string, version: string, reason: string): Promise<void>;
    /**
     * Deprecate a tool
     */
    deprecateTool(toolId: string, version: string): Promise<void>;
}
//# sourceMappingURL=registry-client.d.ts.map
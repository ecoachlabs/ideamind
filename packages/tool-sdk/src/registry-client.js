"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistryClient = void 0;
/**
 * Tool Registry Client
 *
 * Provides methods for:
 * - Registering new tools
 * - Querying available tools
 * - Fetching tool metadata
 * - Managing tool approvals
 */
class ToolRegistryClient {
    baseUrl;
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }
    /**
     * Register a new tool
     */
    async registerTool(metadata) {
        const response = await fetch(`${this.baseUrl}/tools`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(metadata),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to register tool: ${response.status} - ${error}`);
        }
        return await response.json();
    }
    /**
     * Get tool metadata
     */
    async getTool(toolId, version = 'latest') {
        const response = await fetch(`${this.baseUrl}/tools/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}`);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to get tool: ${response.status} - ${error}`);
        }
        return await response.json();
    }
    /**
     * List tools by category
     */
    async listToolsByCategory(category) {
        const params = new URLSearchParams({ category });
        const response = await fetch(`${this.baseUrl}/tools?${params}`);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to list tools by category: ${response.status} - ${error}`);
        }
        return await response.json();
    }
    /**
     * List approved tools
     */
    async listApprovedTools() {
        const params = new URLSearchParams({ status: 'approved' });
        const response = await fetch(`${this.baseUrl}/tools?${params}`);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to list approved tools: ${response.status} - ${error}`);
        }
        return await response.json();
    }
    /**
     * Search tools by tag
     */
    async searchTools(tags) {
        const params = new URLSearchParams();
        tags.forEach(tag => params.append('tags', tag));
        const response = await fetch(`${this.baseUrl}/tools?${params}`);
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to search tools: ${response.status} - ${error}`);
        }
        return await response.json();
    }
    /**
     * Approve a tool
     */
    async approveTool(toolId, version, approvedBy) {
        const response = await fetch(`${this.baseUrl}/tools/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ approvedBy }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to approve tool: ${response.status} - ${error}`);
        }
    }
    /**
     * Reject a tool
     */
    async rejectTool(toolId, version, reason) {
        const response = await fetch(`${this.baseUrl}/tools/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason }),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to reject tool: ${response.status} - ${error}`);
        }
    }
    /**
     * Deprecate a tool
     */
    async deprecateTool(toolId, version) {
        const response = await fetch(`${this.baseUrl}/tools/${encodeURIComponent(toolId)}/${encodeURIComponent(version)}/deprecate`, {
            method: 'POST',
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to deprecate tool: ${response.status} - ${error}`);
        }
    }
}
exports.ToolRegistryClient = ToolRegistryClient;
//# sourceMappingURL=registry-client.js.map
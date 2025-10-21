"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Analyzer = void 0;
const tool_sdk_1 = require("@ideamine/tool-sdk");
/**
 * Analyzer: Decides if invoking a tool would improve the result
 *
 * Uses Value-of-Information (VoI) scoring to determine if tool invocation
 * is worth the cost. VoI considers:
 * - Current confidence level
 * - Estimated improvement from tool
 * - Cost of tool invocation
 * - Remaining budget
 */
class Analyzer {
    config;
    registryClient;
    constructor(config) {
        this.config = config;
        const registryUrl = process.env.TOOL_REGISTRY_URL || 'http://localhost:3000';
        this.registryClient = new tool_sdk_1.ToolRegistryClient(registryUrl);
    }
    /**
     * Analyze current result and decide if tool should be invoked
     */
    async analyze(plan, currentResult, input) {
        // If result is high confidence and doesn't need improvement, skip tools
        if (currentResult.confidence > 0.85 && !currentResult.needsImprovement) {
            return {
                useTool: false,
                reasoning: `Current result has high confidence (${currentResult.confidence}) and doesn't need improvement`,
            };
        }
        // Find the best tool for improvement
        const candidateTools = await this.identifyCandidateTools(plan, currentResult, input);
        if (candidateTools.length === 0) {
            return {
                useTool: false,
                reasoning: 'No suitable tools available for this task',
            };
        }
        // Calculate VoI for each candidate tool
        const toolsWithVoI = candidateTools.map(tool => ({
            ...tool,
            voiScore: this.calculateVoI(tool, currentResult, input),
        }));
        // Sort by VoI descending
        toolsWithVoI.sort((a, b) => b.voiScore - a.voiScore);
        const bestTool = toolsWithVoI[0];
        // Check if best tool meets VoI threshold
        if (bestTool.voiScore < this.config.toolPolicy.voiThreshold) {
            return {
                useTool: false,
                voiScore: bestTool.voiScore,
                reasoning: `Best tool VoI (${bestTool.voiScore.toFixed(3)}) below threshold (${this.config.toolPolicy.voiThreshold})`,
            };
        }
        // Check if tool is allowed by policy
        if (!this.isToolAllowed(bestTool.toolId)) {
            return {
                useTool: false,
                reasoning: `Tool ${bestTool.toolId} not allowed by policy`,
            };
        }
        return {
            useTool: true,
            toolId: bestTool.toolId,
            toolVersion: bestTool.version,
            voiScore: bestTool.voiScore,
            reasoning: bestTool.reasoning,
            estimatedImprovement: bestTool.estimatedImprovement,
            estimatedCostUsd: bestTool.estimatedCostUsd,
            input: bestTool.input,
        };
    }
    /**
     * Identify candidate tools that could improve the result
     *
     * Queries tool registry for tools matching the phase and task,
     * filters by agent's tool policy, and estimates improvement potential.
     */
    async identifyCandidateTools(plan, currentResult, input) {
        try {
            // Get approved tools from registry
            const approvedTools = await this.registryClient.listApprovedTools();
            // Filter tools relevant to current phase/task
            const relevantTools = approvedTools.filter(tool => {
                // Check if tool category matches task needs
                const isRelevant = this.isToolRelevantForTask(tool.category, plan.phaseId, currentResult.needsImprovement);
                // Check if tool is allowed by policy
                const isAllowed = this.isToolAllowed(tool.id);
                // Check if tool fits within budget
                const fitsbudget = tool.costEstimate <= (input.budget.maxCostUsd - input.budget.currentCostUsd);
                return isRelevant && isAllowed && fitsbudget;
            });
            // Map to candidate format with estimates
            const candidates = relevantTools.map(tool => {
                // Estimate improvement based on current confidence gap
                const confidenceGap = 1.0 - currentResult.confidence;
                const estimatedImprovement = this.estimateToolImprovement(tool.category, confidenceGap);
                // Build tool input from current context
                const toolInput = this.buildToolInput(tool, input, currentResult);
                return {
                    toolId: tool.id,
                    version: tool.version,
                    reasoning: `${tool.name} can improve ${tool.category} aspects (estimated +${(estimatedImprovement * 100).toFixed(0)}%)`,
                    estimatedImprovement,
                    estimatedCostUsd: tool.costEstimate,
                    input: toolInput,
                };
            });
            console.log(`[Analyzer] Found ${candidates.length} candidate tools for phase ${plan.phaseId}`);
            return candidates;
        }
        catch (error) {
            console.warn('[Analyzer] Failed to query tool registry, returning empty candidates:', error);
            return [];
        }
    }
    /**
     * Check if tool category is relevant for current task
     */
    isToolRelevantForTask(category, phase, needsImprovement) {
        // Map phases to relevant tool categories
        const phaseCategories = {
            'INTAKE': ['research', 'analysis', 'validation'],
            'PRD': ['research', 'analysis', 'generation'],
            'ARCHITECTURE': ['analysis', 'generation', 'validation'],
            'IMPLEMENTATION': ['generation', 'execution', 'validation'],
            'TEST': ['validation', 'execution'],
            'REFINERY': ['analysis', 'validation'],
        };
        const relevantCategories = phaseCategories[phase] || [];
        return relevantCategories.includes(category) && needsImprovement;
    }
    /**
     * Estimate improvement potential of tool
     */
    estimateToolImprovement(category, confidenceGap) {
        // Different categories have different improvement potential
        const categoryMultipliers = {
            'research': 0.7, // High improvement for research tasks
            'analysis': 0.6, // Good improvement for analysis
            'validation': 0.5, // Moderate improvement for validation
            'generation': 0.6, // Good improvement for generation
            'execution': 0.4, // Lower improvement for execution
        };
        const multiplier = categoryMultipliers[category] || 0.5;
        // Improvement is proportional to confidence gap and category multiplier
        return Math.min(confidenceGap * multiplier, 0.8); // Cap at 80% improvement
    }
    /**
     * Build tool input from current context
     */
    buildToolInput(tool, input, currentResult) {
        // Generic tool input structure
        return {
            workflowRunId: input.workflowRunId,
            phaseId: input.phaseId,
            context: input.metadata,
            currentResult: {
                content: currentResult.content,
                confidence: currentResult.confidence,
            },
            // Add tool-specific parameters if needed
        };
    }
    /**
     * Calculate Value-of-Information (VoI) score
     *
     * VoI = (EstimatedImprovement * RemainingBudget) / EstimatedCost
     *
     * Where:
     * - EstimatedImprovement: How much the tool is expected to improve quality (0-1)
     * - RemainingBudget: How much budget is left (normalized 0-1)
     * - EstimatedCost: Cost of tool invocation
     */
    calculateVoI(tool, currentResult, input) {
        const remainingBudgetRatio = (input.budget.maxCostUsd - input.budget.currentCostUsd) / input.budget.maxCostUsd;
        // VoI formula: improvement potential weighted by budget availability, divided by cost
        const voi = (tool.estimatedImprovement * remainingBudgetRatio) / (tool.estimatedCostUsd + 0.01);
        // Normalize to 0-1 range (assuming max VoI of 10)
        return Math.min(voi / 10, 1.0);
    }
    /**
     * Check if tool is allowed by agent policy
     */
    isToolAllowed(toolId) {
        const policy = this.config.toolPolicy;
        // Check denied list
        if (policy.deniedTools && policy.deniedTools.includes(toolId)) {
            return false;
        }
        // Check allowed list (if specified, only these are allowed)
        if (policy.allowedTools && policy.allowedTools.length > 0) {
            return policy.allowedTools.includes(toolId);
        }
        return true;
    }
}
exports.Analyzer = Analyzer;
//# sourceMappingURL=analyzer.js.map
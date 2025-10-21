/**
 * Tool Registry - Central registry for all tools with capability classes
 *
 * Manages tool registration, lookup, and versioning
 */

import { CapabilityClass, Tool } from './analyzer';

/**
 * Tool Registry
 */
export class ToolRegistry {
  private tools: Map<CapabilityClass, Tool[]> = new Map();
  private toolsById: Map<string, Tool> = new Map();

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    // Add to capability index
    if (!this.tools.has(tool.capability)) {
      this.tools.set(tool.capability, []);
    }
    this.tools.get(tool.capability)!.push(tool);

    // Add to ID index
    this.toolsById.set(tool.id, tool);
  }

  /**
   * Register multiple tools
   */
  registerMany(tools: Tool[]): void {
    tools.forEach((tool) => this.register(tool));
  }

  /**
   * Get tools by capability
   */
  getByCapability(capability: CapabilityClass): Tool[] {
    return this.tools.get(capability) || [];
  }

  /**
   * Get tool by ID
   */
  getById(id: string): Tool | undefined {
    return this.toolsById.get(id);
  }

  /**
   * Get all tools
   */
  getAll(): Tool[] {
    return Array.from(this.toolsById.values());
  }

  /**
   * Get all capability classes with tools
   */
  getCapabilities(): CapabilityClass[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Unregister a tool
   */
  unregister(toolId: string): boolean {
    const tool = this.toolsById.get(toolId);
    if (!tool) return false;

    // Remove from capability index
    const capabilityTools = this.tools.get(tool.capability);
    if (capabilityTools) {
      const index = capabilityTools.findIndex((t) => t.id === toolId);
      if (index > -1) {
        capabilityTools.splice(index, 1);
      }
    }

    // Remove from ID index
    this.toolsById.delete(toolId);

    return true;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.toolsById.clear();
  }

  /**
   * Get registry stats
   */
  getStats(): {
    totalTools: number;
    toolsByCapability: Record<string, number>;
  } {
    const toolsByCapability: Record<string, number> = {};

    this.tools.forEach((tools, capability) => {
      toolsByCapability[capability] = tools.length;
    });

    return {
      totalTools: this.toolsById.size,
      toolsByCapability,
    };
  }
}

/**
 * Create a default tool registry with mock tools
 * In production, these would be replaced with real tool implementations
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Mock tool factory
  const createMockTool = (
    id: string,
    name: string,
    capability: CapabilityClass,
    description: string
  ): Tool => ({
    id,
    name,
    capability,
    description,
    version: '1.0.0',
    execute: async (input: any) => ({
      success: true,
      output: { result: `Mock output from ${name}`, input },
      confidence: 0.95,
      metadata: {
        cost: { usd: 0.01, tokens: 100 },
        latency_ms: 1000,
        toolVersion: '1.0.0',
      },
    }),
    estimateCost: (input: any) => ({ usd: 0.01, tokens: 100 }),
    estimateLatency: (input: any) => 1000,
  });

  // Register Intake tools
  registry.register(
    createMockTool(
      'tool.intake.normalizer',
      'Idea Normalizer',
      CapabilityClass.NORMALIZER,
      'Normalizes and structures raw idea text'
    )
  );
  registry.register(
    createMockTool(
      'tool.intake.ontology',
      'Domain Ontology Mapper',
      CapabilityClass.ONTOLOGY,
      'Maps idea to domain ontology'
    )
  );
  registry.register(
    createMockTool(
      'tool.intake.complianceSweep',
      'Compliance Sweep',
      CapabilityClass.COMPLIANCE_SWEEP,
      'Scans for regulatory compliance issues'
    )
  );
  registry.register(
    createMockTool(
      'tool.intake.feasibility',
      'Feasibility Estimator',
      CapabilityClass.FEASIBILITY,
      'Estimates time/cost/complexity'
    )
  );

  // Register Ideation tools
  registry.register(
    createMockTool(
      'tool.ideation.usecases',
      'Use Case Generator',
      CapabilityClass.USECASES,
      'Generates comprehensive use cases'
    )
  );
  registry.register(
    createMockTool(
      'tool.ideation.personas',
      'Persona Builder',
      CapabilityClass.PERSONAS,
      'Creates user personas and JTBD'
    )
  );
  registry.register(
    createMockTool(
      'tool.ideation.kpiDesigner',
      'KPI Designer',
      CapabilityClass.KPI_DESIGNER,
      'Designs key performance indicators'
    )
  );

  // Register Critique tools
  registry.register(
    createMockTool(
      'tool.critique.socratic',
      'Socratic Analyzer',
      CapabilityClass.SOCRATIC,
      'Performs Socratic questioning'
    )
  );
  registry.register(
    createMockTool(
      'tool.critique.counterfactuals',
      'Counterfactual Explorer',
      CapabilityClass.COUNTERFACTUALS,
      'Explores alternative scenarios'
    )
  );
  registry.register(
    createMockTool(
      'tool.critique.premortem',
      'Pre-Mortem Analyzer',
      CapabilityClass.PREMORTEM,
      'Identifies failure modes'
    )
  );

  // Register PRD tools
  registry.register(
    createMockTool(
      'tool.prd.storyCutter',
      'Story Cutter',
      CapabilityClass.STORY_CUTTER,
      'Decomposes features into user stories'
    )
  );
  registry.register(
    createMockTool(
      'tool.prd.uxFlow',
      'UX Flow Designer',
      CapabilityClass.UX_FLOW,
      'Creates UX flow diagrams'
    )
  );
  registry.register(
    createMockTool(
      'tool.prd.nfrPack',
      'NFR Pack Generator',
      CapabilityClass.NFR_PACK,
      'Generates non-functional requirements'
    )
  );
  registry.register(
    createMockTool(
      'tool.prd.traceMatrix',
      'Requirements Traceability Matrix',
      CapabilityClass.TRACE_MATRIX,
      'Creates RTM linking requirements'
    )
  );

  // Register BizDev tools
  registry.register(
    createMockTool(
      'tool.biz.icpSegmentation',
      'ICP Segmentation',
      CapabilityClass.ICP_SEGMENTATION,
      'Identifies ideal customer profile'
    )
  );
  registry.register(
    createMockTool(
      'tool.biz.ltvCacModel',
      'LTV:CAC Modeler',
      CapabilityClass.LTV_CAC_MODEL,
      'Models lifetime value and CAC'
    )
  );
  registry.register(
    createMockTool(
      'tool.biz.gtmPlanner',
      'GTM Planner',
      CapabilityClass.GTM_PLANNER,
      'Plans go-to-market strategy'
    )
  );

  // Register Architecture tools
  registry.register(
    createMockTool(
      'tool.arch.c4Generator',
      'C4 Diagram Generator',
      CapabilityClass.C4_GENERATOR,
      'Generates C4 architecture diagrams'
    )
  );
  registry.register(
    createMockTool(
      'tool.arch.apiSpec',
      'API Spec Writer',
      CapabilityClass.API_SPEC,
      'Generates OpenAPI specifications'
    )
  );
  registry.register(
    createMockTool(
      'tool.arch.dataModeler',
      'Data Modeler',
      CapabilityClass.DATA_MODELER,
      'Creates data models and ERDs'
    )
  );
  registry.register(
    createMockTool(
      'tool.arch.threatModeler',
      'Threat Modeler',
      CapabilityClass.THREAT_MODELER,
      'Performs threat modeling'
    )
  );

  // Register QA tools
  registry.register(
    createMockTool(
      'tool.qa.e2e',
      'E2E Test Runner',
      CapabilityClass.E2E,
      'Runs end-to-end tests'
    )
  );
  registry.register(
    createMockTool(
      'tool.qa.visualDiff',
      'Visual Diff',
      CapabilityClass.VISUAL_DIFF,
      'Compares visual snapshots'
    )
  );
  registry.register(
    createMockTool('tool.qa.load', 'Load Tester', CapabilityClass.LOAD, 'Performs load testing')
  );
  registry.register(
    createMockTool('tool.qa.dast', 'DAST Scanner', CapabilityClass.DAST, 'Dynamic security scanning')
  );

  return registry;
}

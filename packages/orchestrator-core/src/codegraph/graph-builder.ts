/**
 * Code Graph Builder
 *
 * Roadmap: M8 - Code Graph & Diff-Aware Gen
 *
 * Tool: tool.codegraph.build
 *
 * Builds semantic code graph for dependency analysis, impact assessment,
 * and intelligent code navigation.
 *
 * Acceptance:
 * - Call chains resolved transitively
 * - Dead code identified
 * - Impact analysis for changes
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import crypto from 'crypto';

const logger = pino({ name: 'code-graph' });

// ============================================================================
// Types
// ============================================================================

export interface CodeGraph {
  nodes: Map<string, CodeNode>;
  edges: Map<string, CodeEdge[]>;
  metadata: GraphMetadata;
}

export interface CodeNode {
  id: string;
  type: NodeType;
  name: string;
  file: string;
  line: number;
  endLine: number;
  signature?: string;
  documentation?: string;
  complexity?: number;
  hash: string;
}

export type NodeType =
  | 'file'
  | 'module'
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'variable'
  | 'constant'
  | 'type'
  | 'import';

export interface CodeEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  metadata?: Record<string, any>;
}

export type EdgeType =
  | 'calls'
  | 'imports'
  | 'extends'
  | 'implements'
  | 'uses'
  | 'exports'
  | 'contains'
  | 'references';

export interface GraphMetadata {
  totalNodes: number;
  totalEdges: number;
  fileCount: number;
  functionCount: number;
  classCount: number;
  buildTime: Date;
  language: 'typescript' | 'javascript' | 'python' | 'java' | 'go';
}

export interface CallChain {
  path: string[];
  depth: number;
  cyclic: boolean;
}

export interface ImpactAnalysis {
  changeNode: string;
  directImpact: string[];
  transitiveImpact: string[];
  testFiles: string[];
  riskScore: number;
}

export interface DeadCodeReport {
  deadFunctions: string[];
  deadClasses: string[];
  deadFiles: string[];
  totalDeadNodes: number;
  potentialSavings: number;
}

export interface DependencyAnalysis {
  circularDependencies: string[][];
  heavyDependencies: { node: string; dependencyCount: number }[];
  isolatedNodes: string[];
  criticalNodes: string[];
}

// ============================================================================
// Code Graph Builder
// ============================================================================

export class CodeGraphBuilder extends EventEmitter {
  private graph: CodeGraph;

  constructor(private db: Pool) {
    super();
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      metadata: {
        totalNodes: 0,
        totalEdges: 0,
        fileCount: 0,
        functionCount: 0,
        classCount: 0,
        buildTime: new Date(),
        language: 'typescript',
      },
    };
  }

  /**
   * Build code graph from source files
   */
  async build(
    files: string[],
    language: GraphMetadata['language'] = 'typescript'
  ): Promise<CodeGraph> {
    logger.info({ fileCount: files.length, language }, 'Building code graph');

    this.graph.metadata.language = language;
    this.graph.metadata.buildTime = new Date();

    for (const file of files) {
      await this.parseFile(file, language);
    }

    // Build edges (dependencies)
    await this.buildEdges();

    // Update metadata
    this.graph.metadata.totalNodes = this.graph.nodes.size;
    this.graph.metadata.totalEdges = Array.from(this.graph.edges.values()).reduce(
      (sum, edges) => sum + edges.length,
      0
    );
    this.graph.metadata.fileCount = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'file'
    ).length;
    this.graph.metadata.functionCount = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'function' || n.type === 'method'
    ).length;
    this.graph.metadata.classCount = Array.from(this.graph.nodes.values()).filter(
      (n) => n.type === 'class'
    ).length;

    // Store in database
    await this.storeGraph();

    this.emit('graph-built', this.graph);

    return this.graph;
  }

  /**
   * Parse source file
   */
  private async parseFile(filePath: string, language: GraphMetadata['language']): Promise<void> {
    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(filePath, 'utf-8');

      // Create file node
      const fileNode: CodeNode = {
        id: this.generateNodeId('file', filePath),
        type: 'file',
        name: filePath,
        file: filePath,
        line: 1,
        endLine: content.split('\n').length,
        hash: crypto.createHash('sha256').update(content).digest('hex'),
      };

      this.addNode(fileNode);

      // Parse based on language
      if (language === 'typescript' || language === 'javascript') {
        await this.parseTypeScript(content, filePath);
      } else if (language === 'python') {
        await this.parsePython(content, filePath);
      }

      logger.debug({ file: filePath }, 'File parsed');
    } catch (err) {
      logger.error({ err, file: filePath }, 'Failed to parse file');
    }
  }

  /**
   * Parse TypeScript/JavaScript
   */
  private async parseTypeScript(content: string, filePath: string): Promise<void> {
    const lines = content.split('\n');

    // Extract imports
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Import statements
      const importMatch = line.match(/import\s+.*?\s+from\s+['"](.+?)['"]/);
      if (importMatch) {
        const importPath = importMatch[1];
        const importNode: CodeNode = {
          id: this.generateNodeId('import', `${filePath}:${importPath}`),
          type: 'import',
          name: importPath,
          file: filePath,
          line: i + 1,
          endLine: i + 1,
          hash: crypto.createHash('sha256').update(importPath).digest('hex'),
        };
        this.addNode(importNode);
      }

      // Function declarations
      const funcMatch = line.match(
        /(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/
      );
      if (funcMatch) {
        const funcName = funcMatch[3];
        const params = funcMatch[4];
        const funcNode: CodeNode = {
          id: this.generateNodeId('function', `${filePath}:${funcName}`),
          type: 'function',
          name: funcName,
          file: filePath,
          line: i + 1,
          endLine: this.findBlockEnd(lines, i),
          signature: `function ${funcName}(${params})`,
          complexity: this.calculateComplexity(
            lines.slice(i, this.findBlockEnd(lines, i)).join('\n')
          ),
          hash: crypto
            .createHash('sha256')
            .update(lines.slice(i, this.findBlockEnd(lines, i)).join('\n'))
            .digest('hex'),
        };
        this.addNode(funcNode);
      }

      // Class declarations
      const classMatch = line.match(/(export\s+)?class\s+(\w+)/);
      if (classMatch) {
        const className = classMatch[2];
        const classNode: CodeNode = {
          id: this.generateNodeId('class', `${filePath}:${className}`),
          type: 'class',
          name: className,
          file: filePath,
          line: i + 1,
          endLine: this.findBlockEnd(lines, i),
          hash: crypto
            .createHash('sha256')
            .update(lines.slice(i, this.findBlockEnd(lines, i)).join('\n'))
            .digest('hex'),
        };
        this.addNode(classNode);
      }

      // Interface declarations
      const interfaceMatch = line.match(/(export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        const interfaceName = interfaceMatch[2];
        const interfaceNode: CodeNode = {
          id: this.generateNodeId('interface', `${filePath}:${interfaceName}`),
          type: 'interface',
          name: interfaceName,
          file: filePath,
          line: i + 1,
          endLine: this.findBlockEnd(lines, i),
          hash: crypto
            .createHash('sha256')
            .update(lines.slice(i, this.findBlockEnd(lines, i)).join('\n'))
            .digest('hex'),
        };
        this.addNode(interfaceNode);
      }
    }
  }

  /**
   * Parse Python
   */
  private async parsePython(content: string, filePath: string): Promise<void> {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Import statements
      const importMatch = line.match(/^(from\s+(\S+)\s+)?import\s+(.+)/);
      if (importMatch) {
        const importPath = importMatch[2] || importMatch[3];
        const importNode: CodeNode = {
          id: this.generateNodeId('import', `${filePath}:${importPath}`),
          type: 'import',
          name: importPath,
          file: filePath,
          line: i + 1,
          endLine: i + 1,
          hash: crypto.createHash('sha256').update(importPath).digest('hex'),
        };
        this.addNode(importNode);
      }

      // Function definitions
      const funcMatch = line.match(/^def\s+(\w+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const params = funcMatch[2];
        const funcNode: CodeNode = {
          id: this.generateNodeId('function', `${filePath}:${funcName}`),
          type: 'function',
          name: funcName,
          file: filePath,
          line: i + 1,
          endLine: this.findPythonBlockEnd(lines, i),
          signature: `def ${funcName}(${params})`,
          complexity: this.calculateComplexity(
            lines.slice(i, this.findPythonBlockEnd(lines, i)).join('\n')
          ),
          hash: crypto
            .createHash('sha256')
            .update(lines.slice(i, this.findPythonBlockEnd(lines, i)).join('\n'))
            .digest('hex'),
        };
        this.addNode(funcNode);
      }

      // Class definitions
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        const className = classMatch[1];
        const classNode: CodeNode = {
          id: this.generateNodeId('class', `${filePath}:${className}`),
          type: 'class',
          name: className,
          file: filePath,
          line: i + 1,
          endLine: this.findPythonBlockEnd(lines, i),
          hash: crypto
            .createHash('sha256')
            .update(lines.slice(i, this.findPythonBlockEnd(lines, i)).join('\n'))
            .digest('hex'),
        };
        this.addNode(classNode);
      }
    }
  }

  /**
   * Build dependency edges
   */
  private async buildEdges(): Promise<void> {
    for (const node of this.graph.nodes.values()) {
      if (node.type === 'import') {
        // Create import edge from file to imported module
        const fileNode = Array.from(this.graph.nodes.values()).find(
          (n) => n.type === 'file' && n.file === node.file
        );
        if (fileNode) {
          this.addEdge({
            id: this.generateEdgeId(fileNode.id, node.id),
            source: fileNode.id,
            target: node.id,
            type: 'imports',
            weight: 1,
          });
        }
      }

      // TODO: Build call graph by analyzing function bodies
      // TODO: Build inheritance graph for classes
      // TODO: Build reference graph for variables
    }
  }

  /**
   * Find call chain between two nodes
   */
  async findCallChain(sourceId: string, targetId: string): Promise<CallChain | null> {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: string, target: string, depth: number): boolean => {
      if (current === target) {
        path.push(current);
        return true;
      }

      if (visited.has(current) || depth > 50) {
        return false;
      }

      visited.add(current);
      path.push(current);

      const edges = this.graph.edges.get(current) || [];
      for (const edge of edges) {
        if (edge.type === 'calls') {
          if (dfs(edge.target, target, depth + 1)) {
            return true;
          }
        }
      }

      path.pop();
      return false;
    };

    const found = dfs(sourceId, targetId, 0);

    if (found) {
      const cyclic = new Set(path).size !== path.length;
      return {
        path,
        depth: path.length - 1,
        cyclic,
      };
    }

    return null;
  }

  /**
   * Analyze impact of changing a node
   */
  async analyzeImpact(nodeId: string): Promise<ImpactAnalysis> {
    const directImpact: string[] = [];
    const transitiveImpact = new Set<string>();
    const testFiles = new Set<string>();

    // Find direct dependents
    for (const [source, edges] of this.graph.edges) {
      for (const edge of edges) {
        if (edge.target === nodeId) {
          directImpact.push(source);
        }
      }
    }

    // Find transitive dependents (BFS)
    const queue = [...directImpact];
    const visited = new Set<string>([nodeId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      transitiveImpact.add(current);

      // Check if test file
      const node = this.graph.nodes.get(current);
      if (node && (node.file.includes('.test.') || node.file.includes('.spec.'))) {
        testFiles.add(node.file);
      }

      // Add dependents to queue
      for (const [source, edges] of this.graph.edges) {
        for (const edge of edges) {
          if (edge.target === current) {
            queue.push(source);
          }
        }
      }
    }

    // Calculate risk score
    const riskScore = Math.min(
      100,
      directImpact.length * 10 + transitiveImpact.size * 2
    );

    return {
      changeNode: nodeId,
      directImpact,
      transitiveImpact: Array.from(transitiveImpact),
      testFiles: Array.from(testFiles),
      riskScore,
    };
  }

  /**
   * Detect dead code
   */
  async detectDeadCode(): Promise<DeadCodeReport> {
    const deadFunctions: string[] = [];
    const deadClasses: string[] = [];
    const deadFiles: string[] = [];

    // Find nodes with no incoming edges
    const nodesWithIncoming = new Set<string>();
    for (const edges of this.graph.edges.values()) {
      for (const edge of edges) {
        nodesWithIncoming.add(edge.target);
      }
    }

    for (const node of this.graph.nodes.values()) {
      // Skip entry points and exports
      if (
        node.name.includes('main') ||
        node.name.includes('index') ||
        node.signature?.includes('export')
      ) {
        continue;
      }

      if (!nodesWithIncoming.has(node.id)) {
        if (node.type === 'function' || node.type === 'method') {
          deadFunctions.push(node.id);
        } else if (node.type === 'class') {
          deadClasses.push(node.id);
        } else if (node.type === 'file') {
          deadFiles.push(node.id);
        }
      }
    }

    const totalDeadNodes = deadFunctions.length + deadClasses.length + deadFiles.length;

    // Estimate savings (100 lines per function, 200 per class, 500 per file)
    const potentialSavings =
      deadFunctions.length * 100 + deadClasses.length * 200 + deadFiles.length * 500;

    return {
      deadFunctions,
      deadClasses,
      deadFiles,
      totalDeadNodes,
      potentialSavings,
    };
  }

  /**
   * Analyze dependencies
   */
  async analyzeDependencies(): Promise<DependencyAnalysis> {
    const circularDependencies = this.findCircularDependencies();
    const heavyDependencies = this.findHeavyDependencies();
    const isolatedNodes = this.findIsolatedNodes();
    const criticalNodes = this.findCriticalNodes();

    return {
      circularDependencies,
      heavyDependencies,
      isolatedNodes,
      criticalNodes,
    };
  }

  /**
   * Find circular dependencies
   */
  private findCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (stack.has(node)) {
        // Found cycle
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart));
        return;
      }

      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      path.push(node);

      const edges = this.graph.edges.get(node) || [];
      for (const edge of edges) {
        dfs(edge.target);
      }

      stack.delete(node);
      path.pop();
    };

    for (const node of this.graph.nodes.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Find nodes with heavy dependencies
   */
  private findHeavyDependencies(): { node: string; dependencyCount: number }[] {
    const dependencies: { node: string; dependencyCount: number }[] = [];

    for (const [node, edges] of this.graph.edges) {
      if (edges.length > 10) {
        dependencies.push({ node, dependencyCount: edges.length });
      }
    }

    return dependencies.sort((a, b) => b.dependencyCount - a.dependencyCount);
  }

  /**
   * Find isolated nodes
   */
  private findIsolatedNodes(): string[] {
    const isolated: string[] = [];

    for (const node of this.graph.nodes.keys()) {
      const outgoing = this.graph.edges.get(node)?.length || 0;
      let incoming = 0;

      for (const edges of this.graph.edges.values()) {
        for (const edge of edges) {
          if (edge.target === node) incoming++;
        }
      }

      if (outgoing === 0 && incoming === 0) {
        isolated.push(node);
      }
    }

    return isolated;
  }

  /**
   * Find critical nodes (high fanout)
   */
  private findCriticalNodes(): string[] {
    const critical: string[] = [];

    for (const node of this.graph.nodes.keys()) {
      let incoming = 0;

      for (const edges of this.graph.edges.values()) {
        for (const edge of edges) {
          if (edge.target === node) incoming++;
        }
      }

      if (incoming > 20) {
        critical.push(node);
      }
    }

    return critical;
  }

  /**
   * Add node to graph
   */
  private addNode(node: CodeNode): void {
    this.graph.nodes.set(node.id, node);
  }

  /**
   * Add edge to graph
   */
  private addEdge(edge: CodeEdge): void {
    if (!this.graph.edges.has(edge.source)) {
      this.graph.edges.set(edge.source, []);
    }
    this.graph.edges.get(edge.source)!.push(edge);
  }

  /**
   * Generate node ID
   */
  private generateNodeId(type: string, identifier: string): string {
    return `${type}:${crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16)}`;
  }

  /**
   * Generate edge ID
   */
  private generateEdgeId(source: string, target: string): string {
    return `edge:${source}:${target}`;
  }

  /**
   * Find block end (TypeScript/JavaScript)
   */
  private findBlockEnd(lines: string[], start: number): number {
    let braceCount = 0;
    let inBlock = false;

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inBlock = true;
        } else if (char === '}') {
          braceCount--;
          if (inBlock && braceCount === 0) {
            return i + 1;
          }
        }
      }
    }

    return start + 1;
  }

  /**
   * Find block end (Python)
   */
  private findPythonBlockEnd(lines: string[], start: number): number {
    const baseIndent = lines[start].match(/^\s*/)?.[0].length || 0;

    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;

      const indent = lines[i].match(/^\s*/)?.[0].length || 0;
      if (indent <= baseIndent) {
        return i;
      }
    }

    return lines.length;
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateComplexity(code: string): number {
    let complexity = 1; // Base complexity

    // Count decision points
    const patterns = [/\bif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /\b\|\|/g, /\b&&/g];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Store graph in database
   */
  private async storeGraph(): Promise<void> {
    try {
      // Store nodes
      for (const node of this.graph.nodes.values()) {
        await this.db.query(
          `
          INSERT INTO code_graph_nodes (
            node_id, node_type, name, file, line, end_line, signature, complexity, hash
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (node_id) DO UPDATE SET
            node_type = $2, name = $3, file = $4, line = $5, end_line = $6,
            signature = $7, complexity = $8, hash = $9, updated_at = NOW()
        `,
          [
            node.id,
            node.type,
            node.name,
            node.file,
            node.line,
            node.endLine,
            node.signature,
            node.complexity,
            node.hash,
          ]
        );
      }

      // Store edges
      for (const edges of this.graph.edges.values()) {
        for (const edge of edges) {
          await this.db.query(
            `
            INSERT INTO code_graph_edges (
              edge_id, source, target, edge_type, weight
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (edge_id) DO UPDATE SET
              source = $2, target = $3, edge_type = $4, weight = $5, updated_at = NOW()
          `,
            [edge.id, edge.source, edge.target, edge.type, edge.weight]
          );
        }
      }

      logger.info({ nodes: this.graph.nodes.size }, 'Graph stored in database');
    } catch (err) {
      logger.error({ err }, 'Failed to store graph');
    }
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const CODE_GRAPH_MIGRATION = `
-- Code graph nodes table
CREATE TABLE IF NOT EXISTS code_graph_nodes (
  node_id VARCHAR(100) PRIMARY KEY,
  node_type VARCHAR(50) NOT NULL,
  name TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  signature TEXT,
  complexity INTEGER,
  hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON code_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_file ON code_graph_nodes(file);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_hash ON code_graph_nodes(hash);

COMMENT ON TABLE code_graph_nodes IS 'Code graph nodes (functions, classes, imports)';

-- Code graph edges table
CREATE TABLE IF NOT EXISTS code_graph_edges (
  edge_id VARCHAR(200) PRIMARY KEY,
  source VARCHAR(100) NOT NULL,
  target VARCHAR(100) NOT NULL,
  edge_type VARCHAR(50) NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON code_graph_edges(source);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON code_graph_edges(target);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON code_graph_edges(edge_type);

COMMENT ON TABLE code_graph_edges IS 'Code graph edges (calls, imports, dependencies)';
`;

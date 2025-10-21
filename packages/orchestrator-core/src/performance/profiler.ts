/**
 * Performance Profiler Agent
 *
 * Roadmap: M3 - Perf & Cost Optimizer
 *
 * Agent: agent.profiler
 * Tool: tool.perf.flamegraph
 *
 * Generates flamegraphs; proposes caching/indices/GC tweaks.
 *
 * Acceptance:
 * - At least one suggestion → measurable p95 improvement on demo app
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import * as path from 'path';

const logger = pino({ name: 'profiler' });

// ============================================================================
// Types
// ============================================================================

export interface ProfileSession {
  id: string;
  runId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  samples: ProfileSample[];
}

export interface ProfileSample {
  timestamp: Date;
  stackTrace: string[];
  duration: number;
  cpuUsage: number;
  memoryUsage: number;
  metadata?: Record<string, any>;
}

export interface FlameGraphNode {
  name: string;
  value: number; // Total time in ms
  children: FlameGraphNode[];
}

export interface PerformanceBottleneck {
  type: 'hot_path' | 'slow_query' | 'memory_leak' | 'gc_pressure' | 'io_wait';
  severity: 'critical' | 'major' | 'minor';
  location: string;
  impact: string;
  metrics: {
    timeMs?: number;
    percentage?: number;
    frequency?: number;
  };
}

export interface OptimizationSuggestion {
  type: 'caching' | 'indexing' | 'gc_tuning' | 'query_optimization' | 'async_batching';
  priority: 'high' | 'medium' | 'low';
  description: string;
  expectedImprovementPct: number;
  implementation: {
    steps: string[];
    code?: string;
    config?: Record<string, any>;
  };
  estimatedEffort: 'low' | 'medium' | 'high';
}

export interface ProfileReport {
  sessionId: string;
  summary: {
    totalDuration: number;
    p50: number;
    p95: number;
    p99: number;
    avgCPU: number;
    avgMemoryMB: number;
    peakMemoryMB: number;
  };
  bottlenecks: PerformanceBottleneck[];
  suggestions: OptimizationSuggestion[];
  flamegraph: FlameGraphNode;
}

// ============================================================================
// Performance Profiler Agent
// ============================================================================

export class PerformanceProfilerAgent extends EventEmitter {
  private activeSessions: Map<string, ProfileSession> = new Map();

  constructor(private db: Pool) {
    super();
  }

  /**
   * Start profiling session
   */
  async startProfiling(runId: string): Promise<string> {
    const sessionId = `prof-${Date.now()}`;

    const session: ProfileSession = {
      id: sessionId,
      runId,
      startTime: new Date(),
      samples: [],
    };

    this.activeSessions.set(sessionId, session);

    // Start periodic sampling (every 100ms)
    const samplingInterval = setInterval(() => {
      this.collectSample(sessionId);
    }, 100);

    // Store interval for cleanup
    (session as any).samplingInterval = samplingInterval;

    logger.info({ sessionId, runId }, 'Profiling started');

    return sessionId;
  }

  /**
   * Stop profiling and generate report
   */
  async stopProfiling(sessionId: string): Promise<ProfileReport> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Profiling session ${sessionId} not found`);
    }

    // Stop sampling
    const interval = (session as any).samplingInterval;
    if (interval) {
      clearInterval(interval);
    }

    session.endTime = new Date();
    session.duration = session.endTime.getTime() - session.startTime.getTime();

    logger.info(
      { sessionId, samples: session.samples.length, duration: session.duration },
      'Profiling stopped'
    );

    // Analyze and generate report
    const report = await this.generateReport(session);

    // Clean up
    this.activeSessions.delete(sessionId);

    // Store report
    await this.storeReport(report);

    return report;
  }

  /**
   * Collect performance sample
   */
  private async collectSample(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      // Get current stack trace (simplified - in real impl would use v8-profiler)
      const stackTrace = this.captureStackTrace();

      // Get resource usage
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const sample: ProfileSample = {
        timestamp: new Date(),
        stackTrace,
        duration: 100, // Sample interval
        cpuUsage: cpuUsage.user + cpuUsage.system,
        memoryUsage: memUsage.heapUsed,
      };

      session.samples.push(sample);
    } catch (err) {
      logger.warn({ sessionId, err }, 'Failed to collect sample');
    }
  }

  /**
   * Capture stack trace
   */
  private captureStackTrace(): string[] {
    const stack = new Error().stack || '';
    const lines = stack.split('\n').slice(2); // Skip Error and captureStackTrace

    return lines.map((line) => {
      const match = line.match(/at\s+(.+)\s+\((.+)\)/);
      if (match) {
        return `${match[1]} (${match[2]})`;
      }
      return line.trim();
    });
  }

  /**
   * Generate performance report
   */
  private async generateReport(session: ProfileSession): Promise<ProfileReport> {
    logger.info({ sessionId: session.id }, 'Generating profile report');

    // Calculate summary metrics
    const durations = session.samples.map((s) => s.duration);
    const cpuUsages = session.samples.map((s) => s.cpuUsage);
    const memUsages = session.samples.map((s) => s.memoryUsage / 1024 / 1024); // MB

    const summary = {
      totalDuration: session.duration || 0,
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
      avgCPU: this.avg(cpuUsages),
      avgMemoryMB: this.avg(memUsages),
      peakMemoryMB: Math.max(...memUsages),
    };

    // Build flamegraph
    const flamegraph = this.buildFlameGraph(session.samples);

    // Detect bottlenecks
    const bottlenecks = this.detectBottlenecks(session, summary);

    // Generate suggestions
    const suggestions = this.generateSuggestions(bottlenecks, summary);

    return {
      sessionId: session.id,
      summary,
      bottlenecks,
      suggestions,
      flamegraph,
    };
  }

  /**
   * Build flamegraph from samples
   */
  private buildFlameGraph(samples: ProfileSample[]): FlameGraphNode {
    const root: FlameGraphNode = {
      name: 'root',
      value: 0,
      children: [],
    };

    // Group samples by stack trace
    for (const sample of samples) {
      let current = root;
      root.value += sample.duration;

      for (const frame of sample.stackTrace.reverse()) {
        let child = current.children.find((c) => c.name === frame);

        if (!child) {
          child = {
            name: frame,
            value: 0,
            children: [],
          };
          current.children.push(child);
        }

        child.value += sample.duration;
        current = child;
      }
    }

    return root;
  }

  /**
   * Detect performance bottlenecks
   */
  private detectBottlenecks(
    session: ProfileSession,
    summary: ProfileReport['summary']
  ): PerformanceBottleneck[] {
    const bottlenecks: PerformanceBottleneck[] = [];

    // Detect hot paths (functions taking >10% of total time)
    const functionTimes = new Map<string, number>();

    for (const sample of session.samples) {
      for (const frame of sample.stackTrace) {
        const current = functionTimes.get(frame) || 0;
        functionTimes.set(frame, current + sample.duration);
      }
    }

    for (const [func, time] of functionTimes.entries()) {
      const percentage = (time / summary.totalDuration) * 100;

      if (percentage > 10) {
        bottlenecks.push({
          type: 'hot_path',
          severity: percentage > 30 ? 'critical' : percentage > 20 ? 'major' : 'minor',
          location: func,
          impact: `Function consuming ${percentage.toFixed(1)}% of total time`,
          metrics: {
            timeMs: time,
            percentage,
          },
        });
      }
    }

    // Detect memory leaks (steadily increasing memory)
    const memSamples = session.samples.map((s) => s.memoryUsage);
    if (memSamples.length > 10) {
      const firstQuarter = memSamples.slice(0, Math.floor(memSamples.length / 4));
      const lastQuarter = memSamples.slice(-Math.floor(memSamples.length / 4));

      const avgFirst = this.avg(firstQuarter);
      const avgLast = this.avg(lastQuarter);

      if (avgLast > avgFirst * 1.5) {
        bottlenecks.push({
          type: 'memory_leak',
          severity: 'major',
          location: 'overall',
          impact: `Memory increased ${((avgLast / avgFirst - 1) * 100).toFixed(1)}% during profiling`,
          metrics: {
            percentage: (avgLast / avgFirst - 1) * 100,
          },
        });
      }
    }

    // Detect GC pressure (high memory churn)
    if (summary.peakMemoryMB > summary.avgMemoryMB * 2) {
      bottlenecks.push({
        type: 'gc_pressure',
        severity: 'major',
        location: 'heap',
        impact: `Peak memory ${summary.peakMemoryMB.toFixed(0)}MB is ${(summary.peakMemoryMB / summary.avgMemoryMB).toFixed(1)}x average`,
        metrics: {
          percentage: (summary.peakMemoryMB / summary.avgMemoryMB - 1) * 100,
        },
      });
    }

    return bottlenecks;
  }

  /**
   * Generate optimization suggestions
   */
  private generateSuggestions(
    bottlenecks: PerformanceBottleneck[],
    summary: ProfileReport['summary']
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    for (const bottleneck of bottlenecks) {
      switch (bottleneck.type) {
        case 'hot_path':
          suggestions.push({
            type: 'caching',
            priority: 'high',
            description: `Cache results of ${bottleneck.location} to reduce computation`,
            expectedImprovementPct: bottleneck.metrics.percentage! * 0.8,
            implementation: {
              steps: [
                'Identify cacheable inputs/outputs',
                'Implement LRU cache with TTL',
                'Add cache key generation',
                'Monitor cache hit rate',
              ],
              code: `
// Example caching implementation
const cache = new LRUCache({ max: 1000, ttl: 60000 });

async function cachedFunction(input) {
  const key = JSON.stringify(input);
  if (cache.has(key)) {
    return cache.get(key);
  }
  const result = await originalFunction(input);
  cache.set(key, result);
  return result;
}
              `.trim(),
            },
            estimatedEffort: 'low',
          });
          break;

        case 'slow_query':
          suggestions.push({
            type: 'indexing',
            priority: 'high',
            description: `Add database index for ${bottleneck.location}`,
            expectedImprovementPct: 70,
            implementation: {
              steps: [
                'Analyze query execution plan',
                'Identify missing indices',
                'Create composite indices if needed',
                'Monitor query performance',
              ],
              code: `CREATE INDEX idx_${bottleneck.location} ON table_name(column_name);`,
            },
            estimatedEffort: 'low',
          });
          break;

        case 'memory_leak':
          suggestions.push({
            type: 'gc_tuning',
            priority: 'high',
            description: 'Investigate and fix memory leak',
            expectedImprovementPct: 50,
            implementation: {
              steps: [
                'Take heap snapshots at intervals',
                'Identify objects not being released',
                'Fix event listener leaks',
                'Clear references in cleanup',
              ],
            },
            estimatedEffort: 'high',
          });
          break;

        case 'gc_pressure':
          suggestions.push({
            type: 'gc_tuning',
            priority: 'medium',
            description: 'Tune V8 garbage collector settings',
            expectedImprovementPct: 20,
            implementation: {
              steps: [
                'Increase heap size if needed',
                'Tune --max-old-space-size',
                'Consider object pooling',
                'Reduce allocations in hot paths',
              ],
              config: {
                'max-old-space-size': 4096,
                'max-semi-space-size': 128,
              },
            },
            estimatedEffort: 'medium',
          });
          break;
      }
    }

    return suggestions;
  }

  /**
   * Store report in database
   */
  private async storeReport(report: ProfileReport): Promise<void> {
    await this.db.query(
      `
      INSERT INTO performance_reports (
        session_id, summary, bottlenecks, suggestions, flamegraph, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `,
      [
        report.sessionId,
        JSON.stringify(report.summary),
        JSON.stringify(report.bottlenecks),
        JSON.stringify(report.suggestions),
        JSON.stringify(report.flamegraph),
      ]
    );

    logger.info({ sessionId: report.sessionId }, 'Report stored');
  }

  /**
   * Get report by session ID
   */
  async getReport(sessionId: string): Promise<ProfileReport | null> {
    const result = await this.db.query(
      `SELECT * FROM performance_reports WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      sessionId: row.session_id,
      summary: row.summary,
      bottlenecks: row.bottlenecks,
      suggestions: row.suggestions,
      flamegraph: row.flamegraph,
    };
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}

// ============================================================================
// Flamegraph Tool
// ============================================================================

export class FlamegraphTool {
  /**
   * Export flamegraph to SVG format
   */
  async exportSVG(flamegraph: FlameGraphNode, outputPath: string): Promise<void> {
    // TODO: Implement SVG generation
    // This would use a library like d3-flame-graph or generate SVG manually

    logger.info({ outputPath }, 'Flamegraph exported (stub)');

    // Stub implementation
    const svg = this.generateSVGStub(flamegraph);
    await fs.writeFile(outputPath, svg, 'utf-8');
  }

  /**
   * Generate stub SVG
   */
  private generateSVGStub(node: FlameGraphNode): string {
    return `
      <svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="30" font-size="20">Flamegraph: ${node.name}</text>
        <text x="10" y="60" font-size="14">Total time: ${node.value}ms</text>
        <text x="10" y="90" font-size="12">Children: ${node.children.length}</text>
        <!-- Full implementation would render interactive flamegraph -->
      </svg>
    `.trim();
  }

  /**
   * Export flamegraph to JSON
   */
  async exportJSON(flamegraph: FlameGraphNode, outputPath: string): Promise<void> {
    const json = JSON.stringify(flamegraph, null, 2);
    await fs.writeFile(outputPath, json, 'utf-8');

    logger.info({ outputPath }, 'Flamegraph exported as JSON');
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const PROFILER_MIGRATION = `
-- Performance reports table
CREATE TABLE IF NOT EXISTS performance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(100) NOT NULL UNIQUE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  summary JSONB NOT NULL,
  bottlenecks JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  flamegraph JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_perf_reports_session ON performance_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_perf_reports_run ON performance_reports(run_id);
CREATE INDEX IF NOT EXISTS idx_perf_reports_created ON performance_reports(created_at);

COMMENT ON TABLE performance_reports IS 'Performance profiling reports with bottlenecks and suggestions';
`;

/**
 * Memory Gate
 *
 * Quality gate that blocks phases if required knowledge themes are missing or stale
 */

import { Pool } from 'pg';
import pino from 'pino';
import { KnowledgeFrameManager } from './knowledge-frame';
import { MemoryScope } from './types';

const logger = pino({ name: 'memory-gate' });

export interface MemoryGateConfig {
  requiredThemes: string[]; // e.g., ["API.design", "PRD.v1"]
  minFreshness?: number; // 0-1
  minFramesPerTheme?: number;
  scope?: MemoryScope | MemoryScope[];
}

export interface MemoryGateResult {
  passed: boolean;
  missingThemes: string[];
  staleThemes: string[];
  reason?: string;
  suggestions?: string[];
}

export class MemoryGate {
  private frameManager: KnowledgeFrameManager;

  constructor(private db: Pool) {
    this.frameManager = new KnowledgeFrameManager(db);
  }

  /**
   * Check if memory gate passes
   */
  async check(config: MemoryGateConfig): Promise<MemoryGateResult> {
    logger.info({ config }, 'Checking memory gate');

    const missingThemes: string[] = [];
    const staleThemes: string[] = [];

    for (const theme of config.requiredThemes) {
      const frames = await this.frameManager.queryFrames(theme, config.scope, {
        limit: config.minFramesPerTheme || 1,
      });

      // Check if theme has any frames
      if (frames.length === 0) {
        missingThemes.push(theme);
        logger.warn({ theme }, 'Required theme missing');
        continue;
      }

      // Check if theme has minimum number of frames
      if (config.minFramesPerTheme && frames.length < config.minFramesPerTheme) {
        missingThemes.push(theme);
        logger.warn(
          { theme, found: frames.length, required: config.minFramesPerTheme },
          'Insufficient frames for theme'
        );
        continue;
      }

      // Check freshness if required
      if (config.minFreshness !== undefined) {
        const avgFreshness =
          frames.reduce((sum, f) => sum + this.frameManager.calculateFreshness(f), 0) / frames.length;

        if (avgFreshness < config.minFreshness) {
          staleThemes.push(theme);
          logger.warn(
            { theme, avgFreshness: avgFreshness.toFixed(3), required: config.minFreshness },
            'Theme frames are stale'
          );
        }
      }
    }

    const passed = missingThemes.length === 0 && staleThemes.length === 0;

    const result: MemoryGateResult = {
      passed,
      missingThemes,
      staleThemes,
    };

    if (!passed) {
      result.reason = this.buildFailureReason(missingThemes, staleThemes);
      result.suggestions = this.buildSuggestions(missingThemes, staleThemes);
    }

    logger.info(
      {
        passed,
        missingThemes: missingThemes.length,
        staleThemes: staleThemes.length,
      },
      'Memory gate check complete'
    );

    return result;
  }

  /**
   * Build failure reason message
   */
  private buildFailureReason(missingThemes: string[], staleThemes: string[]): string {
    const reasons: string[] = [];

    if (missingThemes.length > 0) {
      reasons.push(`Missing required themes: ${missingThemes.join(', ')}`);
    }

    if (staleThemes.length > 0) {
      reasons.push(`Stale themes: ${staleThemes.join(', ')}`);
    }

    return reasons.join('; ');
  }

  /**
   * Build suggestions for remediation
   */
  private buildSuggestions(missingThemes: string[], staleThemes: string[]): string[] {
    const suggestions: string[] = [];

    if (missingThemes.length > 0) {
      suggestions.push(
        `Create knowledge frames for missing themes: ${missingThemes.join(', ')}`
      );
      suggestions.push('Run preparatory phases (e.g., PRD, Design) to generate required knowledge');
    }

    if (staleThemes.length > 0) {
      suggestions.push(`Refresh stale themes using tool.rag.refresh: ${staleThemes.join(', ')}`);
      suggestions.push('Re-run phases that produce these themes to update knowledge');
    }

    return suggestions;
  }

  /**
   * Predefined gate configs for common phases
   */
  static getPredefinedGateConfig(phase: string): MemoryGateConfig | null {
    const configs: Record<string, MemoryGateConfig> = {
      story_loop: {
        requiredThemes: ['PRD', 'API.design'],
        minFreshness: 0.7,
        minFramesPerTheme: 1,
        scope: ['tenant', 'run'],
      },
      build: {
        requiredThemes: ['CODE.architecture', 'API.design', 'SECURITY.threats'],
        minFreshness: 0.8,
        minFramesPerTheme: 1,
        scope: ['tenant', 'run'],
      },
      test: {
        requiredThemes: ['CODE.architecture', 'TEST.plan'],
        minFreshness: 0.9,
        minFramesPerTheme: 1,
        scope: ['run'],
      },
      deploy: {
        requiredThemes: ['SECURITY.sbom', 'SECURITY.dpia', 'DR.plan'],
        minFreshness: 0.95,
        minFramesPerTheme: 1,
        scope: ['run'],
      },
    };

    return configs[phase] || null;
  }
}

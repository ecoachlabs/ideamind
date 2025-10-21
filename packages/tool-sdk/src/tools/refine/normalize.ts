/**
 * refine.normalize
 *
 * Canonicalizes text for idempotent Knowledge Map processing.
 *
 * Features:
 * - Text normalization (lowercase, trim, whitespace)
 * - Unit standardization (KB → bytes, ms → milliseconds)
 * - Alias resolution ("PM" → "Product Manager")
 * - Content hashing (SHA-256)
 */

import { createHash } from 'crypto';
import {
  Tool,
  ToolInput,
  ToolOutput,
  ToolMetadata,
  ToolCategory,
} from '../../types';

// ============================================================================
// NORMALIZE TOOL
// ============================================================================

export class NormalizeTool implements Tool {
  readonly metadata: ToolMetadata = {
    name: 'refine.normalize',
    description: 'Canonicalize text for idempotent Knowledge Map processing',
    category: ToolCategory.REFINERY,
    version: '1.0.0',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to normalize',
        },
        normalizeUnits: {
          type: 'boolean',
          description: 'Standardize units (KB → 1024, ms → milliseconds)',
          default: true,
        },
        resolveAliases: {
          type: 'boolean',
          description: 'Resolve aliases using entity mapping',
          default: true,
        },
        generateHash: {
          type: 'boolean',
          description: 'Generate SHA-256 content hash',
          default: true,
        },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        normalized: { type: 'string' },
        contentHash: { type: 'string' },
        changes: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    costUsd: 0.001, // Very cheap - pure string processing
  };

  async execute(input: ToolInput): Promise<ToolOutput> {
    const {
      text,
      normalizeUnits = true,
      resolveAliases = true,
      generateHash = true,
    } = input as NormalizeInput;

    const changes: string[] = [];
    let normalized = text;

    // Step 1: Basic text normalization
    const basicNormalized = this.normalizeBasicText(normalized);
    if (basicNormalized !== normalized) {
      changes.push('basic_text_normalization');
      normalized = basicNormalized;
    }

    // Step 2: Unit standardization
    if (normalizeUnits) {
      const unitNormalized = this.normalizeUnits(normalized);
      if (unitNormalized !== normalized) {
        changes.push('unit_standardization');
        normalized = unitNormalized;
      }
    }

    // Step 3: Alias resolution
    if (resolveAliases) {
      const aliasResolved = this.resolveAliases(normalized);
      if (aliasResolved !== normalized) {
        changes.push('alias_resolution');
        normalized = aliasResolved;
      }
    }

    // Step 4: Generate content hash
    const contentHash = generateHash
      ? this.generateContentHash(normalized)
      : undefined;

    return {
      result: {
        normalized,
        contentHash,
        changes,
      },
      metadata: {
        toolName: this.metadata.name,
        toolVersion: this.metadata.version,
        executionTimeMs: 0, // Synchronous operation
        costUsd: this.metadata.costUsd,
      },
    };
  }

  /**
   * Basic text normalization
   */
  private normalizeBasicText(text: string): string {
    return text
      .trim() // Remove leading/trailing whitespace
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines
      .normalize('NFKC'); // Unicode normalization
  }

  /**
   * Normalize units to standard forms
   */
  private normalizeUnits(text: string): string {
    const unitMappings: Array<{ pattern: RegExp; replacement: string }> = [
      // Time units
      { pattern: /\b(\d+)\s*ms\b/gi, replacement: '$1 milliseconds' },
      { pattern: /\b(\d+)\s*sec(onds?)?\b/gi, replacement: '$1 seconds' },
      { pattern: /\b(\d+)\s*min(utes?)?\b/gi, replacement: '$1 minutes' },
      { pattern: /\b(\d+)\s*hrs?\b/gi, replacement: '$1 hours' },

      // Storage units (convert to bytes for precision)
      { pattern: /\b(\d+)\s*KB\b/g, replacement: (match, num) => `${parseInt(num) * 1024} bytes` },
      { pattern: /\b(\d+)\s*MB\b/g, replacement: (match, num) => `${parseInt(num) * 1024 * 1024} bytes` },
      { pattern: /\b(\d+)\s*GB\b/g, replacement: (match, num) => `${parseInt(num) * 1024 * 1024 * 1024} bytes` },

      // Percentages (standardize format)
      { pattern: /\b(\d+)\s*percent\b/gi, replacement: '$1%' },

      // Currency (standardize to symbol)
      { pattern: /\b(\d+)\s*USD\b/g, replacement: '$$$1' },
      { pattern: /\b(\d+)\s*dollars?\b/gi, replacement: '$$$1' },
    ];

    let normalized = text;
    for (const { pattern, replacement } of unitMappings) {
      normalized = normalized.replace(pattern, replacement as string);
    }

    return normalized;
  }

  /**
   * Resolve common aliases to canonical forms
   */
  private resolveAliases(text: string): string {
    // Common role aliases
    const aliasMappings: Record<string, string> = {
      // Roles
      'PM': 'Product Manager',
      'PdM': 'Product Manager',
      'TPM': 'Technical Product Manager',
      'EM': 'Engineering Manager',
      'SWE': 'Software Engineer',
      'QA': 'Quality Assurance',
      'DevOps': 'DevOps Engineer',
      'SRE': 'Site Reliability Engineer',
      'UX': 'User Experience',
      'UI': 'User Interface',

      // Technologies
      'DB': 'Database',
      'API': 'Application Programming Interface',
      'REST': 'RESTful API',
      'GraphQL': 'GraphQL API',
      'SQL': 'Structured Query Language',
      'NoSQL': 'NoSQL Database',
      'CI/CD': 'Continuous Integration/Continuous Deployment',
      'K8s': 'Kubernetes',
      'AWS': 'Amazon Web Services',
      'GCP': 'Google Cloud Platform',

      // Business terms
      'MVP': 'Minimum Viable Product',
      'KPI': 'Key Performance Indicator',
      'ROI': 'Return on Investment',
      'B2B': 'Business-to-Business',
      'B2C': 'Business-to-Consumer',
      'SaaS': 'Software as a Service',
      'TTM': 'Time to Market',
    };

    let normalized = text;

    // Use word boundary regex to avoid partial matches
    for (const [alias, canonical] of Object.entries(aliasMappings)) {
      const pattern = new RegExp(`\\b${alias}\\b`, 'g');
      normalized = normalized.replace(pattern, canonical);
    }

    return normalized;
  }

  /**
   * Generate SHA-256 content hash for idempotence
   */
  private generateContentHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface NormalizeInput {
  text: string;
  normalizeUnits?: boolean;
  resolveAliases?: boolean;
  generateHash?: boolean;
}

interface NormalizeOutput {
  normalized: string;
  contentHash?: string;
  changes: string[];
}

// ============================================================================
// FACTORY
// ============================================================================

export function createNormalizeTool(): Tool {
  return new NormalizeTool();
}

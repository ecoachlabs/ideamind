/**
 * guard.PII_redactor
 *
 * Detects and redacts Personally Identifiable Information (PII) from text.
 *
 * Features:
 * - Detects: emails, phone numbers, SSNs, credit cards, API keys, IP addresses
 * - Redacts with appropriate placeholders
 * - Audit log of redactions
 * - Configurable sensitivity levels
 */

import {
  Tool,
  ToolInput,
  ToolOutput,
  ToolMetadata,
  ToolCategory,
} from '../../types';

// ============================================================================
// PII REDACTOR TOOL
// ============================================================================

export class PIIRedactorTool implements Tool {
  readonly metadata: ToolMetadata = {
    name: 'guard.PII_redactor',
    description: 'Detect and redact Personally Identifiable Information',
    category: ToolCategory.GUARD,
    version: '1.0.0',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to scan for PII',
        },
        redactMode: {
          type: 'string',
          enum: ['full', 'partial', 'hash'],
          description: 'Redaction mode: full ([REDACTED]), partial (j***@gmail.com), hash (SHA-256)',
          default: 'full',
        },
        sensitivityLevel: {
          type: 'string',
          enum: ['strict', 'moderate', 'lenient'],
          description: 'Detection sensitivity level',
          default: 'strict',
        },
        auditLog: {
          type: 'boolean',
          description: 'Log redactions for audit',
          default: true,
        },
      },
      required: ['text'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        redactedText: { type: 'string' },
        piiDetected: { type: 'boolean' },
        redactionCount: { type: 'number' },
        redactions: { type: 'array' },
      },
    },
    costUsd: 0.001, // Regex processing only
  };

  private patterns: Record<string, RegExp> = {
    // Email addresses
    email:
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

    // Phone numbers (US and international formats)
    phone:
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\+\d{1,3}[-.\s]?\d{1,14}\b/g,

    // Social Security Numbers (US)
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

    // Credit card numbers (Visa, MC, Amex, Discover)
    creditCard:
      /\b(?:\d{4}[-\s]?){3}\d{4}\b|\b\d{15,16}\b/g,

    // API keys (common patterns)
    apiKey:
      /\b(?:api[_-]?key|apikey|access[_-]?token|secret[_-]?key|bearer)[:\s=]["']?([A-Za-z0-9_\-]{20,})\b/gi,

    // AWS keys
    awsKey:
      /\b(?:AKIA[0-9A-Z]{16})\b/g,

    // IP addresses (IPv4)
    ipAddress:
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

    // Crypto wallet addresses (Bitcoin, Ethereum)
    cryptoWallet:
      /\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b|\b0x[a-fA-F0-9]{40}\b/g,

    // Dates of birth (common formats)
    dob:
      /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,

    // Passport numbers (alphanumeric, 6-9 chars)
    passport:
      /\b[A-Z]{1,2}\d{6,9}\b/g,
  };

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startTime = Date.now();
    const {
      text,
      redactMode = 'full',
      sensitivityLevel = 'strict',
      auditLog = true,
    } = input as PIIRedactorInput;

    try {
      const redactions: Redaction[] = [];
      let redactedText = text;

      // Apply each pattern
      for (const [piiType, pattern] of Object.entries(this.patterns)) {
        const matches = Array.from(text.matchAll(pattern));

        for (const match of matches) {
          const original = match[0];
          const position = match.index!;

          // Determine if this match should be redacted based on sensitivity
          if (!this.shouldRedact(piiType, original, sensitivityLevel)) {
            continue;
          }

          // Generate redacted value
          const redacted = this.redact(original, piiType, redactMode);

          // Replace in text
          redactedText = redactedText.replace(original, redacted);

          // Log redaction
          if (auditLog) {
            redactions.push({
              type: piiType,
              position,
              length: original.length,
              redactedValue: redacted,
            });
          }
        }
      }

      return {
        result: {
          redactedText,
          piiDetected: redactions.length > 0,
          redactionCount: redactions.length,
          redactions: auditLog ? redactions : [],
        },
        metadata: {
          toolName: this.metadata.name,
          toolVersion: this.metadata.version,
          executionTimeMs: Date.now() - startTime,
          costUsd: this.metadata.costUsd,
        },
      };
    } catch (error) {
      console.error('[PIIRedactor] Error:', error);
      throw error;
    }
  }

  /**
   * Determine if match should be redacted based on sensitivity
   */
  private shouldRedact(
    piiType: string,
    value: string,
    sensitivity: string
  ): boolean {
    // Strict: redact everything
    if (sensitivity === 'strict') {
      return true;
    }

    // Moderate: skip common false positives
    if (sensitivity === 'moderate') {
      // Allow localhost IPs
      if (piiType === 'ipAddress' && value.startsWith('127.0.0')) {
        return false;
      }

      // Allow example emails
      if (piiType === 'email' && value.includes('example.com')) {
        return false;
      }

      // Allow documentation API keys (obviously fake)
      if (piiType === 'apiKey' && value.includes('YOUR_API_KEY')) {
        return false;
      }
    }

    // Lenient: only redact high-risk PII
    if (sensitivity === 'lenient') {
      const highRisk = ['ssn', 'creditCard', 'passport', 'awsKey'];
      return highRisk.includes(piiType);
    }

    return true;
  }

  /**
   * Redact value based on mode
   */
  private redact(value: string, piiType: string, mode: string): string {
    if (mode === 'full') {
      return `[REDACTED:${piiType.toUpperCase()}]`;
    }

    if (mode === 'partial') {
      return this.partialRedact(value, piiType);
    }

    if (mode === 'hash') {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(value).digest('hex');
      return `[HASH:${hash.substring(0, 12)}]`;
    }

    return '[REDACTED]';
  }

  /**
   * Partial redaction (shows first/last chars)
   */
  private partialRedact(value: string, piiType: string): string {
    if (piiType === 'email') {
      const [local, domain] = value.split('@');
      const redactedLocal =
        local.length > 2
          ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
          : '***';
      return `${redactedLocal}@${domain}`;
    }

    if (piiType === 'phone') {
      const digits = value.replace(/\D/g, '');
      return `***-***-${digits.slice(-4)}`;
    }

    if (piiType === 'ssn') {
      return `***-**-${value.slice(-4)}`;
    }

    if (piiType === 'creditCard') {
      const digits = value.replace(/\D/g, '');
      return `****-****-****-${digits.slice(-4)}`;
    }

    if (piiType === 'apiKey' || piiType === 'awsKey') {
      return value.substring(0, 4) + '*'.repeat(Math.max(value.length - 8, 8)) + value.slice(-4);
    }

    // Default: show first 2 and last 2 chars
    if (value.length > 8) {
      return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
    }

    return '***';
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface PIIRedactorInput {
  text: string;
  redactMode?: 'full' | 'partial' | 'hash';
  sensitivityLevel?: 'strict' | 'moderate' | 'lenient';
  auditLog?: boolean;
}

interface PIIRedactorOutput {
  redactedText: string;
  piiDetected: boolean;
  redactionCount: number;
  redactions: Redaction[];
}

interface Redaction {
  type: string;
  position: number;
  length: number;
  redactedValue: string;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPIIRedactorTool(): Tool {
  return new PIIRedactorTool();
}

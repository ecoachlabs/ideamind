/**
 * Delta Coder Agent
 *
 * Roadmap: M8 - Code Graph & Diff-Aware Gen
 *
 * Agent: agent.deltaCoder
 *
 * Generates minimal surgical diffs instead of rewriting entire files.
 * Preserves formatting, comments, and existing code style.
 *
 * Acceptance:
 * - Only changed lines modified
 * - Formatting preserved
 * - Change size ≤10% of original for small edits
 */

import pino from 'pino';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import crypto from 'crypto';

const logger = pino({ name: 'delta-coder' });

// ============================================================================
// Types
// ============================================================================

export interface ChangeRequest {
  file: string;
  description: string;
  targetFunction?: string;
  targetClass?: string;
  targetLines?: { start: number; end: number };
}

export interface DeltaResult {
  file: string;
  changes: CodeChange[];
  totalLinesChanged: number;
  totalLinesOriginal: number;
  changePercentage: number;
  preservedFormatting: boolean;
  rollbackPatch?: string;
}

export interface CodeChange {
  type: 'insert' | 'delete' | 'replace';
  lineNumber: number;
  original?: string[];
  modified: string[];
  context: { before: string[]; after: string[] };
}

export interface DiffAnalysis {
  additions: number;
  deletions: number;
  modifications: number;
  unchanged: number;
  complexity: number;
}

export interface SurgicalEdit {
  file: string;
  operation: 'insert' | 'delete' | 'replace' | 'rename';
  target: {
    type: 'function' | 'class' | 'line' | 'block';
    identifier: string;
    startLine: number;
    endLine: number;
  };
  newCode: string;
  reason: string;
}

// ============================================================================
// Delta Coder Agent
// ============================================================================

export class DeltaCoderAgent extends EventEmitter {
  constructor(private db: Pool) {
    super();
  }

  /**
   * Generate minimal delta for change request
   */
  async generateDelta(request: ChangeRequest, originalContent: string): Promise<DeltaResult> {
    logger.info({ file: request.file, description: request.description }, 'Generating delta');

    const originalLines = originalContent.split('\n');
    const changes: CodeChange[] = [];

    // Identify target region
    const targetRegion = this.identifyTargetRegion(
      originalLines,
      request.targetFunction,
      request.targetClass,
      request.targetLines
    );

    // Generate minimal changes
    const modifications = await this.generateMinimalChanges(
      request.description,
      originalLines,
      targetRegion
    );

    for (const mod of modifications) {
      changes.push({
        type: mod.type,
        lineNumber: mod.lineNumber,
        original: mod.original,
        modified: mod.modified,
        context: {
          before: originalLines.slice(Math.max(0, mod.lineNumber - 3), mod.lineNumber),
          after: originalLines.slice(
            mod.lineNumber + (mod.original?.length || 0),
            mod.lineNumber + (mod.original?.length || 0) + 3
          ),
        },
      });
    }

    // Apply changes and verify formatting
    const modifiedContent = this.applyChanges(originalLines, changes);
    const preservedFormatting = this.verifyFormatting(originalContent, modifiedContent);

    // Calculate metrics
    const totalLinesChanged = changes.reduce(
      (sum, c) => sum + c.modified.length,
      0
    );
    const changePercentage = (totalLinesChanged / originalLines.length) * 100;

    // Generate rollback patch
    const rollbackPatch = this.generateRollbackPatch(changes);

    const result: DeltaResult = {
      file: request.file,
      changes,
      totalLinesChanged,
      totalLinesOriginal: originalLines.length,
      changePercentage,
      preservedFormatting,
      rollbackPatch,
    };

    // Store in database
    await this.storeDelta(request, result);

    this.emit('delta-generated', result);

    // Check acceptance criteria (≤10% change for small edits)
    if (request.description.includes('small') || request.description.includes('minor')) {
      if (changePercentage > 10) {
        logger.warn(
          { changePercentage },
          'Change percentage exceeds 10% for small edit'
        );
      }
    }

    return result;
  }

  /**
   * Apply surgical edit to file
   */
  async applySurgicalEdit(edit: SurgicalEdit, originalContent: string): Promise<string> {
    const lines = originalContent.split('\n');

    switch (edit.operation) {
      case 'replace':
        // Replace target lines with new code
        const newLines = edit.newCode.split('\n');
        lines.splice(edit.target.startLine - 1, edit.target.endLine - edit.target.startLine + 1, ...newLines);
        break;

      case 'insert':
        // Insert new code at target line
        const insertLines = edit.newCode.split('\n');
        lines.splice(edit.target.startLine - 1, 0, ...insertLines);
        break;

      case 'delete':
        // Delete target lines
        lines.splice(edit.target.startLine - 1, edit.target.endLine - edit.target.startLine + 1);
        break;

      case 'rename':
        // Rename function/class/variable
        const pattern = new RegExp(`\\b${edit.target.identifier}\\b`, 'g');
        for (let i = edit.target.startLine - 1; i < edit.target.endLine; i++) {
          lines[i] = lines[i].replace(pattern, edit.newCode);
        }
        break;
    }

    return lines.join('\n');
  }

  /**
   * Analyze diff between two versions
   */
  async analyzeDiff(original: string, modified: string): Promise<DiffAnalysis> {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    let additions = 0;
    let deletions = 0;
    let modifications = 0;
    let unchanged = 0;

    // Simple line-by-line diff (LCS algorithm would be better)
    const maxLen = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLen; i++) {
      const origLine = originalLines[i];
      const modLine = modifiedLines[i];

      if (origLine === undefined) {
        additions++;
      } else if (modLine === undefined) {
        deletions++;
      } else if (origLine === modLine) {
        unchanged++;
      } else {
        modifications++;
      }
    }

    // Calculate complexity (number of distinct change regions)
    const complexity = this.calculateDiffComplexity(originalLines, modifiedLines);

    return {
      additions,
      deletions,
      modifications,
      unchanged,
      complexity,
    };
  }

  /**
   * Generate unified diff format
   */
  async generateUnifiedDiff(
    original: string,
    modified: string,
    filename: string
  ): Promise<string> {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    let diff = `--- ${filename}\n+++ ${filename}\n`;

    // Find hunks (consecutive changed lines)
    const hunks = this.findHunks(originalLines, modifiedLines);

    for (const hunk of hunks) {
      diff += `@@ -${hunk.originalStart},${hunk.originalCount} +${hunk.modifiedStart},${hunk.modifiedCount} @@\n`;

      // Add context and changes
      for (let i = hunk.originalStart - 1; i < hunk.originalStart + hunk.originalCount - 1; i++) {
        if (i < originalLines.length) {
          if (hunk.deletedLines.includes(i)) {
            diff += `-${originalLines[i]}\n`;
          } else {
            diff += ` ${originalLines[i]}\n`;
          }
        }
      }

      for (const line of hunk.addedLines) {
        diff += `+${line}\n`;
      }
    }

    return diff;
  }

  /**
   * Apply unified diff patch
   */
  async applyPatch(original: string, patch: string): Promise<string> {
    const lines = original.split('\n');
    const patchLines = patch.split('\n');

    let currentLine = 0;

    for (let i = 0; i < patchLines.length; i++) {
      const patchLine = patchLines[i];

      if (patchLine.startsWith('@@')) {
        // Parse hunk header
        const match = patchLine.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
        if (match) {
          currentLine = parseInt(match[1]) - 1;
        }
      } else if (patchLine.startsWith('-')) {
        // Delete line
        lines.splice(currentLine, 1);
      } else if (patchLine.startsWith('+')) {
        // Add line
        lines.splice(currentLine, 0, patchLine.substring(1));
        currentLine++;
      } else if (patchLine.startsWith(' ')) {
        // Context line
        currentLine++;
      }
    }

    return lines.join('\n');
  }

  /**
   * Identify target region for changes
   */
  private identifyTargetRegion(
    lines: string[],
    targetFunction?: string,
    targetClass?: string,
    targetLines?: { start: number; end: number }
  ): { start: number; end: number } {
    if (targetLines) {
      return targetLines;
    }

    if (targetFunction) {
      // Find function definition
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`function ${targetFunction}`) || lines[i].includes(`def ${targetFunction}`)) {
          const end = this.findBlockEnd(lines, i);
          return { start: i + 1, end };
        }
      }
    }

    if (targetClass) {
      // Find class definition
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`class ${targetClass}`)) {
          const end = this.findBlockEnd(lines, i);
          return { start: i + 1, end };
        }
      }
    }

    // Default to entire file
    return { start: 1, end: lines.length };
  }

  /**
   * Generate minimal changes (simplified - real implementation would use LLM)
   */
  private async generateMinimalChanges(
    description: string,
    lines: string[],
    targetRegion: { start: number; end: number }
  ): Promise<
    Array<{
      type: 'insert' | 'delete' | 'replace';
      lineNumber: number;
      original?: string[];
      modified: string[];
    }>
  > {
    // This is a placeholder - real implementation would use LLM to generate changes
    // For now, return empty array
    logger.info({ description, targetRegion }, 'Generating minimal changes (placeholder)');
    return [];
  }

  /**
   * Apply changes to lines
   */
  private applyChanges(originalLines: string[], changes: CodeChange[]): string {
    const lines = [...originalLines];

    // Sort changes by line number (reverse to avoid index shifting)
    const sortedChanges = changes.sort((a, b) => b.lineNumber - a.lineNumber);

    for (const change of sortedChanges) {
      switch (change.type) {
        case 'insert':
          lines.splice(change.lineNumber, 0, ...change.modified);
          break;

        case 'delete':
          lines.splice(change.lineNumber, change.original?.length || 0);
          break;

        case 'replace':
          lines.splice(
            change.lineNumber,
            change.original?.length || 0,
            ...change.modified
          );
          break;
      }
    }

    return lines.join('\n');
  }

  /**
   * Verify formatting preservation
   */
  private verifyFormatting(original: string, modified: string): boolean {
    // Check indentation style
    const originalIndent = this.detectIndentStyle(original);
    const modifiedIndent = this.detectIndentStyle(modified);

    if (originalIndent.type !== modifiedIndent.type) {
      return false;
    }

    // Check line ending style
    const originalLineEnding = original.includes('\r\n') ? '\r\n' : '\n';
    const modifiedLineEnding = modified.includes('\r\n') ? '\r\n' : '\n';

    if (originalLineEnding !== modifiedLineEnding) {
      return false;
    }

    return true;
  }

  /**
   * Detect indentation style
   */
  private detectIndentStyle(content: string): { type: 'spaces' | 'tabs'; size: number } {
    const lines = content.split('\n');
    let spacesCount = 0;
    let tabsCount = 0;

    for (const line of lines) {
      if (line.startsWith('  ')) spacesCount++;
      if (line.startsWith('\t')) tabsCount++;
    }

    return spacesCount > tabsCount
      ? { type: 'spaces', size: 2 }
      : { type: 'tabs', size: 1 };
  }

  /**
   * Generate rollback patch
   */
  private generateRollbackPatch(changes: CodeChange[]): string {
    let patch = '';

    // Reverse changes for rollback
    for (const change of changes.reverse()) {
      switch (change.type) {
        case 'insert':
          // Rollback: delete inserted lines
          patch += `delete lines ${change.lineNumber}-${change.lineNumber + change.modified.length - 1}\n`;
          break;

        case 'delete':
          // Rollback: insert deleted lines
          patch += `insert at ${change.lineNumber}:\n`;
          patch += change.original?.join('\n') + '\n';
          break;

        case 'replace':
          // Rollback: replace with original
          patch += `replace lines ${change.lineNumber}-${change.lineNumber + change.modified.length - 1} with:\n`;
          patch += change.original?.join('\n') + '\n';
          break;
      }
    }

    return patch;
  }

  /**
   * Find block end
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
   * Calculate diff complexity
   */
  private calculateDiffComplexity(original: string[], modified: string[]): number {
    let complexity = 0;
    let inChangeRegion = false;

    const maxLen = Math.max(original.length, modified.length);

    for (let i = 0; i < maxLen; i++) {
      const changed = original[i] !== modified[i];

      if (changed && !inChangeRegion) {
        complexity++;
        inChangeRegion = true;
      } else if (!changed) {
        inChangeRegion = false;
      }
    }

    return complexity;
  }

  /**
   * Find hunks in diff
   */
  private findHunks(
    original: string[],
    modified: string[]
  ): Array<{
    originalStart: number;
    originalCount: number;
    modifiedStart: number;
    modifiedCount: number;
    deletedLines: number[];
    addedLines: string[];
  }> {
    const hunks: Array<any> = [];
    let currentHunk: any = null;

    for (let i = 0; i < Math.max(original.length, modified.length); i++) {
      const changed = original[i] !== modified[i];

      if (changed) {
        if (!currentHunk) {
          currentHunk = {
            originalStart: i + 1,
            originalCount: 0,
            modifiedStart: i + 1,
            modifiedCount: 0,
            deletedLines: [],
            addedLines: [],
          };
        }

        if (original[i] && !modified[i]) {
          currentHunk.originalCount++;
          currentHunk.deletedLines.push(i);
        } else if (!original[i] && modified[i]) {
          currentHunk.modifiedCount++;
          currentHunk.addedLines.push(modified[i]);
        } else {
          currentHunk.originalCount++;
          currentHunk.modifiedCount++;
          currentHunk.deletedLines.push(i);
          currentHunk.addedLines.push(modified[i]);
        }
      } else {
        if (currentHunk) {
          hunks.push(currentHunk);
          currentHunk = null;
        }
      }
    }

    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Store delta in database
   */
  private async storeDelta(request: ChangeRequest, result: DeltaResult): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO code_deltas (
          file,
          description,
          total_lines_changed,
          total_lines_original,
          change_percentage,
          preserved_formatting,
          changes,
          rollback_patch
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          request.file,
          request.description,
          result.totalLinesChanged,
          result.totalLinesOriginal,
          result.changePercentage,
          result.preservedFormatting,
          JSON.stringify(result.changes),
          result.rollbackPatch,
        ]
      );

      logger.info({ file: request.file, changePercentage: result.changePercentage }, 'Delta stored');
    } catch (err) {
      logger.error({ err }, 'Failed to store delta');
    }
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const DELTA_CODER_MIGRATION = `
-- Code deltas table
CREATE TABLE IF NOT EXISTS code_deltas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file TEXT NOT NULL,
  description TEXT NOT NULL,
  total_lines_changed INTEGER NOT NULL,
  total_lines_original INTEGER NOT NULL,
  change_percentage NUMERIC(5,2) NOT NULL,
  preserved_formatting BOOLEAN NOT NULL,
  changes JSONB NOT NULL,
  rollback_patch TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_deltas_file ON code_deltas(file);
CREATE INDEX IF NOT EXISTS idx_deltas_percentage ON code_deltas(change_percentage);
CREATE INDEX IF NOT EXISTS idx_deltas_timestamp ON code_deltas(created_at);

COMMENT ON TABLE code_deltas IS 'Minimal code change deltas';
`;

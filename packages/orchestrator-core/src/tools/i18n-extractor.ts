/**
 * Internationalization String Extractor
 *
 * Advanced i18n string extraction with context analysis, pluralization detection,
 * and integration with popular i18n frameworks.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface TranslatableString {
  key: string;
  defaultValue: string;
  context?: string;
  file: string;
  line: number;
  column?: number;
  plural?: boolean;
  variables?: string[];
  namespace?: string;
}

export interface ExtractionResult {
  strings: TranslatableString[];
  stats: {
    totalStrings: number;
    filesProcessed: number;
    withContext: number;
    withPlurals: number;
    withVariables: number;
  };
  warnings: string[];
}

export interface I18nConfig {
  functionNames?: string[];
  componentNames?: string[];
  includeJSX?: boolean;
  extractComments?: boolean;
  defaultNamespace?: string;
  keyPattern?: RegExp;
}

const DEFAULT_CONFIG: I18nConfig = {
  functionNames: ['t', 'i18n.t', '$t', 'translate', '__'],
  componentNames: ['Trans', 'Translation'],
  includeJSX: true,
  extractComments: true,
  defaultNamespace: 'common',
};

export class I18nExtractorTool {
  private config: I18nConfig;

  constructor(config: Partial<I18nConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract translatable strings from source code
   */
  extractStrings(sourceCode: string, filePath: string): TranslatableString[] {
    const strings: TranslatableString[] = [];
    const lines = sourceCode.split('\n');

    // Extract from function calls: t('key'), i18n.t('key'), etc.
    strings.push(...this.extractFromFunctions(sourceCode, filePath, lines));

    // Extract from JSX components: <Trans>text</Trans>
    if (this.config.includeJSX) {
      strings.push(...this.extractFromJSX(sourceCode, filePath, lines));
    }

    // Extract from template literals with i18n tags
    strings.push(...this.extractFromTemplateLiterals(sourceCode, filePath, lines));

    return strings;
  }

  /**
   * Extract from function calls
   */
  private extractFromFunctions(
    sourceCode: string,
    filePath: string,
    lines: string[]
  ): TranslatableString[] {
    const strings: TranslatableString[] = [];
    const functionPattern = this.buildFunctionPattern();

    let match;
    while ((match = functionPattern.exec(sourceCode)) !== null) {
      const fullMatch = match[0];
      const functionName = match[1];
      const args = match[2];

      // Parse arguments
      const parsed = this.parseArguments(args);

      if (parsed.key) {
        const lineNumber = this.getLineNumber(sourceCode, match.index, lines);
        const context = this.extractContextComment(lines, lineNumber);

        strings.push({
          key: parsed.key,
          defaultValue: parsed.defaultValue || parsed.key,
          context: parsed.context || context,
          file: filePath,
          line: lineNumber,
          column: this.getColumnNumber(lines, lineNumber, match.index),
          plural: parsed.plural,
          variables: parsed.variables,
          namespace: parsed.namespace || this.config.defaultNamespace,
        });
      }
    }

    return strings;
  }

  /**
   * Build regex pattern for function matching
   */
  private buildFunctionPattern(): RegExp {
    const names = this.config.functionNames!.map(n => n.replace('.', '\\.'));
    const pattern = `(${names.join('|')})\\s*\\(([^)]*)\\)`;
    return new RegExp(pattern, 'g');
  }

  /**
   * Parse function arguments
   */
  private parseArguments(argsString: string): {
    key?: string;
    defaultValue?: string;
    context?: string;
    plural?: boolean;
    variables?: string[];
    namespace?: string;
  } {
    const result: any = {};

    // Remove whitespace
    const cleaned = argsString.trim();

    // Simple case: t('key')
    const simpleMatch = cleaned.match(/^['"]([^'"]+)['"]$/);
    if (simpleMatch) {
      result.key = simpleMatch[1];
      return result;
    }

    // With options: t('key', { count: n, defaultValue: 'text' })
    const keyMatch = cleaned.match(/^['"]([^'"]+)['"]/);
    if (keyMatch) {
      result.key = keyMatch[1];

      // Extract options object
      const optionsMatch = cleaned.match(/\{([^}]+)\}/);
      if (optionsMatch) {
        const options = optionsMatch[1];

        // Default value
        const defaultMatch = options.match(/defaultValue:\s*['"]([^'"]+)['"]/);
        if (defaultMatch) {
          result.defaultValue = defaultMatch[1];
        }

        // Context
        const contextMatch = options.match(/context:\s*['"]([^'"]+)['"]/);
        if (contextMatch) {
          result.context = contextMatch[1];
        }

        // Plural
        const countMatch = options.match(/count:\s*(\w+)/);
        if (countMatch) {
          result.plural = true;
          result.variables = [countMatch[1]];
        }

        // Namespace
        const nsMatch = options.match(/ns:\s*['"]([^'"]+)['"]/);
        if (nsMatch) {
          result.namespace = nsMatch[1];
        }

        // Extract all variables
        const varMatches = options.matchAll(/\{\{(\w+)\}\}/g);
        const vars: string[] = [];
        for (const varMatch of varMatches) {
          vars.push(varMatch[1]);
        }
        if (vars.length > 0) {
          result.variables = vars;
        }
      }
    }

    return result;
  }

  /**
   * Extract from JSX components
   */
  private extractFromJSX(
    sourceCode: string,
    filePath: string,
    lines: string[]
  ): TranslatableString[] {
    const strings: TranslatableString[] = [];
    const componentPattern = new RegExp(
      `<(${this.config.componentNames!.join('|')})([^>]*)>([^<]+)</`,
      'g'
    );

    let match;
    while ((match = componentPattern.exec(sourceCode)) !== null) {
      const componentName = match[1];
      const props = match[2];
      const content = match[3].trim();

      if (content) {
        const lineNumber = this.getLineNumber(sourceCode, match.index, lines);

        // Extract i18nKey prop
        const keyMatch = props.match(/i18nKey=['"]([^'"]+)['"]/);
        const key = keyMatch ? keyMatch[1] : this.generateKey(content);

        strings.push({
          key,
          defaultValue: content,
          file: filePath,
          line: lineNumber,
          variables: this.extractVariablesFromJSX(props),
          namespace: this.config.defaultNamespace,
        });
      }
    }

    return strings;
  }

  /**
   * Extract from template literals
   */
  private extractFromTemplateLiterals(
    sourceCode: string,
    filePath: string,
    lines: string[]
  ): TranslatableString[] {
    const strings: TranslatableString[] = [];
    const pattern = /i18n`([^`]+)`/g;

    let match;
    while ((match = pattern.exec(sourceCode)) !== null) {
      const content = match[1];
      const lineNumber = this.getLineNumber(sourceCode, match.index, lines);

      strings.push({
        key: this.generateKey(content),
        defaultValue: content,
        file: filePath,
        line: lineNumber,
        variables: this.extractVariablesFromTemplate(content),
        namespace: this.config.defaultNamespace,
      });
    }

    return strings;
  }

  /**
   * Extract variables from JSX props
   */
  private extractVariablesFromJSX(props: string): string[] {
    const variables: string[] = [];
    const pattern = /\{([^}]+)\}/g;
    let match;

    while ((match = pattern.exec(props)) !== null) {
      const varName = match[1].trim();
      if (varName && !varName.startsWith('"') && !varName.startsWith("'")) {
        variables.push(varName);
      }
    }

    return variables;
  }

  /**
   * Extract variables from template literal
   */
  private extractVariablesFromTemplate(content: string): string[] {
    const variables: string[] = [];
    const pattern = /\$\{([^}]+)\}/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      variables.push(match[1].trim());
    }

    return variables;
  }

  /**
   * Extract context from comment above the line
   */
  private extractContextComment(lines: string[], lineNumber: number): string | undefined {
    if (!this.config.extractComments || lineNumber < 2) {
      return undefined;
    }

    const prevLine = lines[lineNumber - 2]?.trim();
    if (prevLine?.startsWith('//')) {
      // Extract comment content
      const commentMatch = prevLine.match(/\/\/\s*(.+)/);
      if (commentMatch) {
        return commentMatch[1];
      }
    }

    return undefined;
  }

  /**
   * Generate key from content
   */
  private generateKey(content: string): string {
    // Convert to snake_case key
    return content
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50);
  }

  /**
   * Get line number from index
   */
  private getLineNumber(sourceCode: string, index: number, lines: string[]): number {
    const beforeMatch = sourceCode.substring(0, index);
    return beforeMatch.split('\n').length;
  }

  /**
   * Get column number
   */
  private getColumnNumber(lines: string[], lineNumber: number, index: number): number {
    const line = lines[lineNumber - 1];
    return line ? line.length - line.trimStart().length + 1 : 1;
  }

  /**
   * Extract from multiple files
   */
  async extractFromFiles(filePaths: string[]): Promise<ExtractionResult> {
    const allStrings: TranslatableString[] = [];
    const warnings: string[] = [];
    let filesProcessed = 0;

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const strings = this.extractStrings(content, filePath);
        allStrings.push(...strings);
        filesProcessed++;
      } catch (error) {
        warnings.push(`Failed to process ${filePath}: ${error}`);
      }
    }

    // Calculate stats
    const stats = {
      totalStrings: allStrings.length,
      filesProcessed,
      withContext: allStrings.filter(s => s.context).length,
      withPlurals: allStrings.filter(s => s.plural).length,
      withVariables: allStrings.filter(s => s.variables && s.variables.length > 0).length,
    };

    return {
      strings: allStrings,
      stats,
      warnings,
    };
  }

  /**
   * Extract from directory (recursive)
   */
  async extractFromDirectory(
    dirPath: string,
    extensions: string[] = ['.ts', '.tsx', '.js', '.jsx']
  ): Promise<ExtractionResult> {
    const files = await this.findFiles(dirPath, extensions);
    return this.extractFromFiles(files);
  }

  /**
   * Find all files with given extensions
   */
  private async findFiles(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and common build directories
        if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
          continue;
        }
        files.push(...await this.findFiles(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Export to JSON format
   */
  exportToJSON(strings: TranslatableString[], namespace?: string): Record<string, string> {
    const result: Record<string, string> = {};

    for (const str of strings) {
      if (!namespace || str.namespace === namespace) {
        result[str.key] = str.defaultValue;
      }
    }

    return result;
  }

  /**
   * Export to PO format (gettext)
   */
  exportToPO(strings: TranslatableString[]): string {
    let po = '# Translation file\n';
    po += `# Generated on ${new Date().toISOString()}\n\n`;

    for (const str of strings) {
      if (str.context) {
        po += `# ${str.context}\n`;
      }
      po += `#: ${str.file}:${str.line}\n`;
      if (str.variables && str.variables.length > 0) {
        po += `#, variables: ${str.variables.join(', ')}\n`;
      }
      po += `msgid "${str.key}"\n`;
      po += `msgstr "${str.defaultValue}"\n\n`;
    }

    return po;
  }
}

// Keep backward compatibility
export const I18nExtractor = I18nExtractorTool;

/**
 * Accessibility Tool (A11y)
 *
 * Automated accessibility checking against WCAG 2.1 guidelines.
 * Detects common accessibility issues in HTML, React/JSX, and design specifications.
 */

import * as fs from 'fs/promises';

export interface A11yIssue {
  rule: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagLevel: 'A' | 'AA' | 'AAA';
  wcagCriteria: string;
  element?: string;
  message: string;
  suggestion: string;
  line?: number;
  column?: number;
  file?: string;
}

export interface A11yReport {
  summary: {
    totalIssues: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    score: number; // 0-100
    passedRules: number;
    failedRules: number;
  };
  issues: A11yIssue[];
  timestamp: string;
}

export interface A11yConfig {
  wcagLevel?: 'A' | 'AA' | 'AAA';
  ignoreRules?: string[];
  customRules?: A11yRule[];
  checkImages?: boolean;
  checkForms?: boolean;
  checkContrast?: boolean;
  checkKeyboard?: boolean;
  checkAria?: boolean;
}

export interface A11yRule {
  id: string;
  name: string;
  wcagCriteria: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  check: (element: any) => boolean;
  message: string;
  suggestion: string;
}

const DEFAULT_CONFIG: A11yConfig = {
  wcagLevel: 'AA',
  ignoreRules: [],
  checkImages: true,
  checkForms: true,
  checkContrast: true,
  checkKeyboard: true,
  checkAria: true,
};

export class A11yTool {
  private config: A11yConfig;
  private rules: A11yRule[];

  constructor(config: Partial<A11yConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = this.initializeRules();
  }

  /**
   * Check HTML/JSX code for accessibility issues
   */
  async checkCode(code: string, filePath?: string): Promise<A11yReport> {
    const issues: A11yIssue[] = [];
    const lines = code.split('\n');

    // Check images
    if (this.config.checkImages) {
      issues.push(...this.checkImages(code, lines, filePath));
    }

    // Check forms
    if (this.config.checkForms) {
      issues.push(...this.checkForms(code, lines, filePath));
    }

    // Check ARIA
    if (this.config.checkAria) {
      issues.push(...this.checkAria(code, lines, filePath));
    }

    // Check headings
    issues.push(...this.checkHeadings(code, lines, filePath));

    // Check links
    issues.push(...this.checkLinks(code, lines, filePath));

    // Check buttons
    issues.push(...this.checkButtons(code, lines, filePath));

    // Check keyboard navigation
    if (this.config.checkKeyboard) {
      issues.push(...this.checkKeyboard(code, lines, filePath));
    }

    // Check semantic HTML
    issues.push(...this.checkSemanticHTML(code, lines, filePath));

    // Check language
    issues.push(...this.checkLanguage(code, lines, filePath));

    // Generate report
    return this.generateReport(issues);
  }

  /**
   * Check images for alt text
   */
  private checkImages(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const imgPattern = /<img\s+([^>]*)>/gi;

    let match;
    while ((match = imgPattern.exec(code)) !== null) {
      const attrs = match[1];
      const line = this.getLineNumber(code, match.index, lines);

      // Check for alt attribute
      if (!attrs.match(/alt\s*=\s*["'][^"']*["']/i)) {
        issues.push({
          rule: 'img-alt',
          severity: 'critical',
          wcagLevel: 'A',
          wcagCriteria: '1.1.1',
          element: match[0],
          message: 'Image missing alt attribute',
          suggestion: 'Add descriptive alt text to all images. Use alt="" for decorative images.',
          line,
          file: filePath,
        });
      }

      // Check for empty alt on non-decorative images
      const altMatch = attrs.match(/alt\s*=\s*["']([^"']*)["']/i);
      if (altMatch && altMatch[1] === '' && !attrs.includes('role="presentation"')) {
        issues.push({
          rule: 'img-alt-empty',
          severity: 'serious',
          wcagLevel: 'A',
          wcagCriteria: '1.1.1',
          element: match[0],
          message: 'Image has empty alt text but is not marked as decorative',
          suggestion: 'Either add descriptive alt text or mark as decorative with role="presentation"',
          line,
          file: filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check form elements
   */
  private checkForms(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Check inputs for labels
    const inputPattern = /<input\s+([^>]*)>/gi;
    let match;

    while ((match = inputPattern.exec(code)) !== null) {
      const attrs = match[1];
      const line = this.getLineNumber(code, match.index, lines);

      // Check for id or aria-label
      const hasId = attrs.match(/id\s*=\s*["']([^"']+)["']/i);
      const hasAriaLabel = attrs.match(/aria-label\s*=\s*["'][^"']*["']/i);
      const hasAriaLabelledBy = attrs.match(/aria-labelledby\s*=\s*["'][^"']*["']/i);

      if (!hasId && !hasAriaLabel && !hasAriaLabelledBy) {
        issues.push({
          rule: 'input-label',
          severity: 'critical',
          wcagLevel: 'A',
          wcagCriteria: '1.3.1, 3.3.2',
          element: match[0],
          message: 'Input field has no associated label',
          suggestion: 'Associate input with a <label> element using id/for or use aria-label',
          line,
          file: filePath,
        });
      }

      // Check for type="submit" or type="button" accessibility
      const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
      if (typeMatch && (typeMatch[1] === 'submit' || typeMatch[1] === 'button')) {
        const hasValue = attrs.match(/value\s*=\s*["'][^"']+["']/i);
        if (!hasValue && !hasAriaLabel) {
          issues.push({
            rule: 'button-name',
            severity: 'serious',
            wcagLevel: 'A',
            wcagCriteria: '4.1.2',
            element: match[0],
            message: 'Button input has no accessible name',
            suggestion: 'Add value attribute or aria-label to button inputs',
            line,
            file: filePath,
          });
        }
      }
    }

    // Check select elements
    const selectPattern = /<select\s+([^>]*)>/gi;
    while ((match = selectPattern.exec(code)) !== null) {
      const attrs = match[1];
      const line = this.getLineNumber(code, match.index, lines);

      const hasId = attrs.match(/id\s*=\s*["']([^"']+)["']/i);
      const hasAriaLabel = attrs.match(/aria-label\s*=\s*["'][^"']*["']/i);

      if (!hasId && !hasAriaLabel) {
        issues.push({
          rule: 'select-label',
          severity: 'critical',
          wcagLevel: 'A',
          wcagCriteria: '1.3.1',
          element: match[0],
          message: 'Select element has no associated label',
          suggestion: 'Associate select with a <label> element or use aria-label',
          line,
          file: filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check ARIA usage
   */
  private checkAria(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Check for invalid ARIA roles
    const rolePattern = /role\s*=\s*["']([^"']+)["']/gi;
    const validRoles = [
      'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
      'checkbox', 'columnheader', 'combobox', 'complementary', 'contentinfo',
      'definition', 'dialog', 'directory', 'document', 'feed', 'figure',
      'form', 'grid', 'gridcell', 'group', 'heading', 'img', 'link', 'list',
      'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu',
      'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation',
      'none', 'note', 'option', 'presentation', 'progressbar', 'radio',
      'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar',
      'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status',
      'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox',
      'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem'
    ];

    let match;
    while ((match = rolePattern.exec(code)) !== null) {
      const role = match[1];
      const line = this.getLineNumber(code, match.index, lines);

      if (!validRoles.includes(role)) {
        issues.push({
          rule: 'aria-role-valid',
          severity: 'serious',
          wcagLevel: 'A',
          wcagCriteria: '4.1.2',
          message: `Invalid ARIA role: "${role}"`,
          suggestion: `Use a valid ARIA role from the WAI-ARIA specification`,
          line,
          file: filePath,
        });
      }
    }

    // Check for aria-label on non-labelable elements
    const ariaLabelPattern = /<(div|span)\s+[^>]*aria-label\s*=\s*["'][^"']*["'][^>]*>/gi;
    while ((match = ariaLabelPattern.exec(code)) !== null) {
      const element = match[1];
      const line = this.getLineNumber(code, match.index, lines);

      // Check if element has a role that supports labeling
      const hasRole = match[0].match(/role\s*=\s*["'][^"']+["']/i);

      if (!hasRole) {
        issues.push({
          rule: 'aria-label-misuse',
          severity: 'moderate',
          wcagLevel: 'A',
          wcagCriteria: '4.1.2',
          element: match[0],
          message: `aria-label on <${element}> without a role has no effect`,
          suggestion: 'Add an appropriate ARIA role or use a semantic element',
          line,
          file: filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check heading structure
   */
  private checkHeadings(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const headingPattern = /<h([1-6])[^>]*>([^<]*)<\/h[1-6]>/gi;
    const headings: Array<{ level: number; text: string; line: number }> = [];

    let match;
    while ((match = headingPattern.exec(code)) !== null) {
      const level = parseInt(match[1]);
      const text = match[2].trim();
      const line = this.getLineNumber(code, match.index, lines);

      headings.push({ level, text, line });

      // Check for empty headings
      if (text === '') {
        issues.push({
          rule: 'empty-heading',
          severity: 'serious',
          wcagLevel: 'A',
          wcagCriteria: '2.4.6',
          element: match[0],
          message: 'Heading element is empty',
          suggestion: 'Add descriptive text to the heading or remove it',
          line,
          file: filePath,
        });
      }
    }

    // Check heading hierarchy
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1];
      const curr = headings[i];

      if (curr.level - prev.level > 1) {
        issues.push({
          rule: 'heading-order',
          severity: 'moderate',
          wcagLevel: 'A',
          wcagCriteria: '1.3.1',
          message: `Heading level skipped from h${prev.level} to h${curr.level}`,
          suggestion: 'Use sequential heading levels (h1, h2, h3...) without skipping',
          line: curr.line,
          file: filePath,
        });
      }
    }

    // Check for missing h1
    if (!headings.some(h => h.level === 1)) {
      issues.push({
        rule: 'missing-h1',
        severity: 'moderate',
        wcagLevel: 'A',
        wcagCriteria: '2.4.6',
        message: 'Page has no h1 heading',
        suggestion: 'Add an h1 heading that describes the main content of the page',
        file: filePath,
      });
    }

    return issues;
  }

  /**
   * Check links
   */
  private checkLinks(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const linkPattern = /<a\s+([^>]*)>([^<]*)<\/a>/gi;

    let match;
    while ((match = linkPattern.exec(code)) !== null) {
      const attrs = match[1];
      const text = match[2].trim();
      const line = this.getLineNumber(code, match.index, lines);

      // Check for empty link text
      if (text === '' && !attrs.match(/aria-label\s*=\s*["'][^"']+["']/i)) {
        issues.push({
          rule: 'link-name',
          severity: 'critical',
          wcagLevel: 'A',
          wcagCriteria: '2.4.4',
          element: match[0],
          message: 'Link has no accessible text',
          suggestion: 'Add text content or aria-label to describe the link purpose',
          line,
          file: filePath,
        });
      }

      // Check for generic link text
      const genericTexts = ['click here', 'here', 'read more', 'more', 'link'];
      if (genericTexts.includes(text.toLowerCase())) {
        issues.push({
          rule: 'link-text-generic',
          severity: 'minor',
          wcagLevel: 'A',
          wcagCriteria: '2.4.4',
          element: match[0],
          message: `Link has generic text: "${text}"`,
          suggestion: 'Use descriptive link text that makes sense out of context',
          line,
          file: filePath,
        });
      }

      // Check for target="_blank" without warning
      if (attrs.includes('target="_blank"') && !attrs.match(/aria-label|title/i)) {
        issues.push({
          rule: 'link-new-window',
          severity: 'minor',
          wcagLevel: 'AAA',
          wcagCriteria: '3.2.5',
          element: match[0],
          message: 'Link opens in new window without warning',
          suggestion: 'Add aria-label or visible text indicating link opens in new window',
          line,
          file: filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check buttons
   */
  private checkButtons(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];
    const buttonPattern = /<button\s+([^>]*)>([^<]*)<\/button>/gi;

    let match;
    while ((match = buttonPattern.exec(code)) !== null) {
      const attrs = match[1];
      const text = match[2].trim();
      const line = this.getLineNumber(code, match.index, lines);

      // Check for empty button text
      if (text === '' && !attrs.match(/aria-label\s*=\s*["'][^"']+["']/i)) {
        issues.push({
          rule: 'button-name',
          severity: 'critical',
          wcagLevel: 'A',
          wcagCriteria: '4.1.2',
          element: match[0],
          message: 'Button has no accessible text',
          suggestion: 'Add text content or aria-label to describe the button action',
          line,
          file: filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check keyboard navigation
   */
  private checkKeyboard(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Check for tabindex > 0
    const tabindexPattern = /tabindex\s*=\s*["']([1-9][0-9]*)["']/gi;
    let match;

    while ((match = tabindexPattern.exec(code)) !== null) {
      const line = this.getLineNumber(code, match.index, lines);

      issues.push({
        rule: 'tabindex-positive',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriteria: '2.4.3',
        message: `Positive tabindex (${match[1]}) disrupts logical tab order`,
        suggestion: 'Use tabindex="0" or "-1", avoid positive values',
        line,
        file: filePath,
      });
    }

    // Check for onClick without onKeyDown/onKeyPress
    const onClickPattern = /<(div|span)\s+[^>]*onClick\s*=\s*{?[^}>]+}?[^>]*>/gi;
    while ((match = onClickPattern.exec(code)) !== null) {
      const element = match[0];
      const line = this.getLineNumber(code, match.index, lines);

      if (!element.match(/onKeyDown|onKeyPress|onKeyUp/i) && !element.match(/role\s*=\s*["']button["']/i)) {
        issues.push({
          rule: 'click-events-keyboard',
          severity: 'serious',
          wcagLevel: 'A',
          wcagCriteria: '2.1.1',
          element: match[0],
          message: 'Click handler without keyboard event handler',
          suggestion: 'Add onKeyDown/onKeyPress handler or use a <button> element',
          line,
          file: filePath,
        });
      }
    }

    return issues;
  }

  /**
   * Check semantic HTML
   */
  private checkSemanticHTML(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Check for <div role="button"> instead of <button>
    const divButtonPattern = /<div\s+[^>]*role\s*=\s*["']button["'][^>]*>/gi;
    let match;

    while ((match = divButtonPattern.exec(code)) !== null) {
      const line = this.getLineNumber(code, match.index, lines);

      issues.push({
        rule: 'semantic-button',
        severity: 'moderate',
        wcagLevel: 'A',
        wcagCriteria: '4.1.2',
        element: match[0],
        message: 'Using div with role="button" instead of semantic <button>',
        suggestion: 'Use <button> element for better accessibility and semantics',
        line,
        file: filePath,
      });
    }

    return issues;
  }

  /**
   * Check language attribute
   */
  private checkLanguage(code: string, lines: string[], filePath?: string): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Check for html lang attribute
    if (code.includes('<html') && !code.match(/<html[^>]*\slang\s*=\s*["'][^"']+["']/i)) {
      issues.push({
        rule: 'html-lang',
        severity: 'serious',
        wcagLevel: 'A',
        wcagCriteria: '3.1.1',
        message: 'HTML element missing lang attribute',
        suggestion: 'Add lang attribute to <html> element (e.g., lang="en")',
        file: filePath,
      });
    }

    return issues;
  }

  /**
   * Get line number from character index
   */
  private getLineNumber(code: string, index: number, lines: string[]): number {
    const beforeMatch = code.substring(0, index);
    return beforeMatch.split('\n').length;
  }

  /**
   * Generate accessibility report
   */
  private generateReport(issues: A11yIssue[]): A11yReport {
    // Filter based on WCAG level
    const filteredIssues = issues.filter(issue => {
      if (this.config.ignoreRules?.includes(issue.rule)) {
        return false;
      }

      if (this.config.wcagLevel === 'A') {
        return issue.wcagLevel === 'A';
      } else if (this.config.wcagLevel === 'AA') {
        return issue.wcagLevel === 'A' || issue.wcagLevel === 'AA';
      }

      return true; // AAA includes all
    });

    const critical = filteredIssues.filter(i => i.severity === 'critical').length;
    const serious = filteredIssues.filter(i => i.severity === 'serious').length;
    const moderate = filteredIssues.filter(i => i.severity === 'moderate').length;
    const minor = filteredIssues.filter(i => i.severity === 'minor').length;

    // Calculate score (0-100)
    const totalWeight = critical * 10 + serious * 5 + moderate * 2 + minor * 1;
    const maxScore = 100;
    const score = Math.max(0, maxScore - totalWeight);

    return {
      summary: {
        totalIssues: filteredIssues.length,
        critical,
        serious,
        moderate,
        minor,
        score,
        passedRules: 0, // Would need to track all rules checked
        failedRules: new Set(filteredIssues.map(i => i.rule)).size,
      },
      issues: filteredIssues,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Initialize built-in accessibility rules
   */
  private initializeRules(): A11yRule[] {
    return [
      // Rules are now implemented inline in check methods
      // This could be expanded to a plugin-based architecture
    ];
  }

  /**
   * Export report to different formats
   */
  exportReport(report: A11yReport, format: 'json' | 'html' | 'markdown'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);

      case 'html':
        return this.exportToHTML(report);

      case 'markdown':
        return this.exportToMarkdown(report);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Export report to HTML
   */
  private exportToHTML(report: A11yReport): string {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Accessibility Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; }
    .score { font-size: 48px; font-weight: bold; color: ${report.summary.score >= 80 ? 'green' : report.summary.score >= 60 ? 'orange' : 'red'}; }
    .issue { border-left: 4px solid; padding: 10px; margin: 10px 0; }
    .critical { border-color: #d32f2f; background: #ffebee; }
    .serious { border-color: #f57c00; background: #fff3e0; }
    .moderate { border-color: #fbc02d; background: #fffde7; }
    .minor { border-color: #1976d2; background: #e3f2fd; }
  </style>
</head>
<body>
  <h1>Accessibility Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <div class="score">${report.summary.score}/100</div>
    <p>Total Issues: ${report.summary.totalIssues}</p>
    <ul>
      <li>Critical: ${report.summary.critical}</li>
      <li>Serious: ${report.summary.serious}</li>
      <li>Moderate: ${report.summary.moderate}</li>
      <li>Minor: ${report.summary.minor}</li>
    </ul>
    <p>Generated: ${report.timestamp}</p>
  </div>
  <h2>Issues</h2>`;

    for (const issue of report.issues) {
      html += `
  <div class="issue ${issue.severity}">
    <h3>${issue.rule}</h3>
    <p><strong>Severity:</strong> ${issue.severity}</p>
    <p><strong>WCAG:</strong> ${issue.wcagLevel} (${issue.wcagCriteria})</p>
    <p><strong>Message:</strong> ${issue.message}</p>
    <p><strong>Suggestion:</strong> ${issue.suggestion}</p>
    ${issue.file ? `<p><strong>File:</strong> ${issue.file}:${issue.line}</p>` : ''}
  </div>`;
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * Export report to Markdown
   */
  private exportToMarkdown(report: A11yReport): string {
    let md = `# Accessibility Report\n\n`;
    md += `## Summary\n\n`;
    md += `**Score:** ${report.summary.score}/100\n\n`;
    md += `- Total Issues: ${report.summary.totalIssues}\n`;
    md += `- Critical: ${report.summary.critical}\n`;
    md += `- Serious: ${report.summary.serious}\n`;
    md += `- Moderate: ${report.summary.moderate}\n`;
    md += `- Minor: ${report.summary.minor}\n\n`;
    md += `Generated: ${report.timestamp}\n\n`;
    md += `## Issues\n\n`;

    for (const issue of report.issues) {
      md += `### ${issue.rule} (${issue.severity})\n\n`;
      md += `**WCAG:** ${issue.wcagLevel} - ${issue.wcagCriteria}\n\n`;
      md += `**Message:** ${issue.message}\n\n`;
      md += `**Suggestion:** ${issue.suggestion}\n\n`;

      if (issue.file) {
        md += `**Location:** ${issue.file}:${issue.line}\n\n`;
      }

      md += `---\n\n`;
    }

    return md;
  }
}

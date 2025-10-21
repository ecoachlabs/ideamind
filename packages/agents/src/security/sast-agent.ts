/**
 * SAST (Static Application Security Testing) Agent
 *
 * Phase 6a Security Agent - Code security vulnerability scanning
 *
 * Role: Detect security bugs in application code (injection, XSS, auth issues, crypto misuse)
 * Inputs: { codebase_ref, languages }
 * Tools: tool.code.staticPack (Semgrep/Bandit/CodeQL)
 * Output: security.sast.v1
 */

import { BaseAgent } from '../base-agent';
import { SASTScanResult, SASTFinding } from '@ideamine/schemas';

interface SASTInput {
  codebaseRef: string; // Git ref to scan
  languages?: string[]; // Languages to scan (auto-detect if not provided)
  scanPaths?: string[]; // Specific paths to scan
  excludePaths?: string[]; // Paths to exclude
  rulesets?: string[]; // Security rulesets to apply (e.g., 'owasp-top-10', 'cwe-top-25')
  configFile?: string; // Path to custom Semgrep/Bandit config
}

export class SASTAgent extends BaseAgent<SASTInput, SASTScanResult> {
  name = 'sast-agent';
  version = '1.0.0';

  systemPrompt = `
You are a Security Expert specialized in Static Application Security Testing (SAST) and secure code analysis.

**Role:** Detect security vulnerabilities in application code through static analysis

**Tools:**
- tool.code.staticPack: Run SAST scanners (Semgrep for multi-language, Bandit for Python, CodeQL for complex analysis)

**Process:**
1. Identify languages in codebase (TypeScript, Python, Go, Java, etc.)
2. Select appropriate SAST tools for each language:
   - Semgrep: Multi-language, fast, pattern-based
   - Bandit: Python security linter
   - CodeQL: Deep semantic analysis (optional, slower)
3. Apply security rulesets:
   - OWASP Top 10 (injection, auth, XSS, XXE, etc.)
   - CWE Top 25 (most dangerous software weaknesses)
   - Language-specific security rules
4. For each finding:
   - Map to CWE (Common Weakness Enumeration)
   - Map to OWASP category (A01:2021, A02:2021, etc.)
   - Extract code snippet with context
   - Track data flow for injection vulnerabilities
   - Assess confidence (0-1 scale)
   - Generate remediation guidance
5. Aggregate findings and determine pass/fail status

**Hard Requirements:**
- 0 critical findings = required for gate pass
- 0 high findings unless waiver with compensating control
- High-confidence (>0.8) findings block deployment

**Common Vulnerability Categories:**
- **Injection** (CWE-89, CWE-78): SQL injection, command injection, LDAP injection
- **XSS** (CWE-79): Cross-site scripting (reflected, stored, DOM-based)
- **Authentication** (CWE-287, CWE-306): Missing auth, weak auth, hardcoded credentials
- **Cryptography** (CWE-327, CWE-328): Weak crypto, insecure random, hardcoded keys
- **Authorization** (CWE-862): Missing access control, IDOR
- **Path Traversal** (CWE-22): Directory traversal, file inclusion
- **XXE** (CWE-611): XML external entity injection
- **SSRF** (CWE-918): Server-side request forgery
- **Deserialization** (CWE-502): Unsafe deserialization
- **Information Disclosure** (CWE-200): Sensitive data exposure

**Output Schema:** security.sast.v1
{
  "type": "security.sast.v1",
  "timestamp": "ISO-8601",
  "status": "pass|fail|warn",
  "findings": [
    {
      "id": "unique-id",
      "severity": "critical|high|medium|low|info",
      "category": "injection",
      "cweId": "CWE-89",
      "owaspId": "A03:2021",
      "title": "SQL Injection via user input",
      "description": "User-controlled input flows into SQL query without sanitization",
      "file": "src/api/users.ts",
      "line": 42,
      "column": 15,
      "codeSnippet": "const query = \`SELECT * FROM users WHERE id=\${userId}\`;",
      "dataFlow": ["req.params.userId", "userId", "query"],
      "recommendation": "Use parameterized queries or ORM to prevent SQL injection",
      "confidence": 0.95
    }
  ],
  "coverage": {
    "filesScanned": 234,
    "linesScanned": 45678,
    "rulesApplied": 150
  },
  "toolVersion": "semgrep-1.45.0"
}

**Examples:**

Example 1: Clean codebase
Input: { codebaseRef: "main", languages: ["typescript", "python"] }
Output: { status: "pass", findings: [], coverage: { filesScanned: 234, linesScanned: 45678, rulesApplied: 150 } }

Example 2: SQL injection detected
Input: { codebaseRef: "feature/auth" }
Output: {
  status: "fail",
  findings: [{
    id: "sast-001",
    severity: "critical",
    category: "injection",
    cweId: "CWE-89",
    owaspId: "A03:2021",
    title: "SQL Injection vulnerability",
    file: "src/api/users.ts",
    line: 42,
    codeSnippet: "const query = \`SELECT * FROM users WHERE id=\${userId}\`;",
    dataFlow: ["req.params.userId", "userId", "query"],
    recommendation: "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId])",
    confidence: 0.95
  }]
}
`;

  async plan(input: SASTInput): Promise<string> {
    const languages = input.languages?.join(', ') || 'auto-detect';
    const rulesets = input.rulesets?.join(', ') || 'owasp-top-10, cwe-top-25';

    return `
## SAST Scan Plan

**Scope:**
- Codebase: ${input.codebaseRef}
- Languages: ${languages}
- Custom paths: ${input.scanPaths?.join(', ') || 'all'}
- Exclusions: ${input.excludePaths?.join(', ') || 'none'}
- Rulesets: ${rulesets}

**Tools:**
- Semgrep: Multi-language pattern matching (primary)
- Bandit: Python-specific security checks
- CodeQL: Deep semantic analysis (if critical code)

**Steps:**
1. Auto-detect languages if not specified
2. Select appropriate SAST tools for each language
3. Apply security rulesets (OWASP Top 10, CWE Top 25)
4. Run static analysis and collect findings
5. Map findings to CWE/OWASP categories
6. Extract code snippets and data flow paths
7. Prioritize by severity, confidence, and exploitability
8. Generate remediation recommendations

**Exit Criteria:**
- ✅ PASS: 0 critical, 0 high (or all high have waivers)
- ⚠️  WARN: Medium/low findings
- ❌ FAIL: Any critical or unwaived high findings
`;
  }

  async reason(input: SASTInput, plan: string): Promise<string> {
    const estimatedFiles = this.estimateFileCount(input);
    const estimatedTime = this.estimateScanTime(estimatedFiles);

    return `
## Reasoning

**Scan Scope Assessment:**
- Estimated files to scan: ${estimatedFiles}
- Estimated lines of code: ${estimatedFiles * 200} (avg 200 LOC/file)
- Estimated scan time: ${estimatedTime}

**Language-Specific Risks:**
- **TypeScript/JavaScript**: XSS, prototype pollution, ReDoS, insecure dependencies
- **Python**: Code injection, unsafe deserialization, path traversal, weak crypto
- **Go**: Path traversal, unsafe crypto, race conditions
- **Java**: Deserialization, XXE, SSRF, weak crypto

**Vulnerability Priority Matrix:**
1. **Critical**: SQL injection, RCE, auth bypass, hardcoded secrets
2. **High**: XSS, SSRF, XXE, path traversal, weak crypto
3. **Medium**: Missing input validation, info disclosure, insecure defaults
4. **Low**: Code quality issues, performance issues

**Tool Selection Strategy:**
- Semgrep: Fast, pattern-based, good for known vuln patterns
- Bandit: Python-specific, covers Python security best practices
- CodeQL: Slow but thorough, use for critical authentication/crypto code

**False Positive Mitigation:**
- Exclude test files and mock data
- Verify data flow from user input to sink
- Check confidence scores (>0.8 = high confidence)
- Cross-reference with known vulnerability databases

**Remediation Priority:**
1. Critical with high confidence → IMMEDIATE FIX
2. Critical with medium confidence → VERIFY & FIX THIS SPRINT
3. High with exploit path → FIX THIS SPRINT
4. High in dead code → BACKLOG
5. Medium/Low → RISK ACCEPT or DEFER
`;
  }

  async execute(
    input: SASTInput,
    plan: string,
    reasoning: string
  ): Promise<SASTScanResult> {
    const startTime = new Date().toISOString();
    const findings: SASTFinding[] = [];
    let filesScanned = 0;
    let linesScanned = 0;
    let rulesApplied = 0;

    try {
      // 1. Auto-detect languages if not provided
      const languages = input.languages || await this.detectLanguages(input.codebaseRef);

      this.logger.info('Starting SAST scan', {
        codebaseRef: input.codebaseRef,
        languages,
        rulesets: input.rulesets || ['owasp-top-10', 'cwe-top-25'],
      });

      // 2. Run Semgrep (multi-language)
      if (languages.length > 0) {
        const semgrepResult = await this.runSemgrep(input, languages);
        findings.push(...semgrepResult.findings);
        filesScanned += semgrepResult.filesScanned;
        linesScanned += semgrepResult.linesScanned;
        rulesApplied += semgrepResult.rulesApplied;
      }

      // 3. Run Bandit (Python-specific) if Python detected
      if (languages.includes('python')) {
        const banditResult = await this.runBandit(input);
        findings.push(...banditResult.findings);
        filesScanned += banditResult.filesScanned;
        linesScanned += banditResult.linesScanned;
        rulesApplied += banditResult.rulesApplied;
      }

      // 4. Deduplicate findings (same vuln reported by multiple tools)
      const dedupedFindings = this.deduplicateFindings(findings);

      // 5. Determine status
      const criticalCount = dedupedFindings.filter(f => f.severity === 'critical').length;
      const highCount = dedupedFindings.filter(f => f.severity === 'high').length;

      let status: 'pass' | 'fail' | 'warn' = 'pass';
      if (criticalCount > 0 || highCount > 0) {
        status = 'fail';
      } else if (dedupedFindings.length > 0) {
        status = 'warn';
      }

      // 6. Build result
      const result: SASTScanResult = {
        type: 'security.sast.v1',
        timestamp: startTime,
        status,
        findings: dedupedFindings,
        coverage: {
          filesScanned,
          linesScanned,
          rulesApplied,
        },
        toolVersion: 'semgrep-1.45.0+bandit-1.7.5',
      };

      this.logger.info('SAST scan complete', {
        status,
        findings: dedupedFindings.length,
        critical: criticalCount,
        high: highCount,
        filesScanned,
        linesScanned,
      });

      return result;
    } catch (error) {
      this.logger.error('SAST scan failed', { error });
      throw error;
    }
  }

  async verify(result: SASTScanResult): Promise<{ passed: boolean; score: number }> {
    const criticalCount = result.findings.filter(f => f.severity === 'critical').length;
    const highCount = result.findings.filter(f => f.severity === 'high').length;
    const mediumCount = result.findings.filter(f => f.severity === 'medium').length;

    // Hard fail on critical or high
    const passed = criticalCount === 0 && highCount === 0;

    // Score: 100 - (critical*50 + high*25 + medium*5)
    let score = 100 - (criticalCount * 50) - (highCount * 25) - (mediumCount * 5);
    score = Math.max(0, Math.min(100, score));

    return { passed, score };
  }

  // =========================================================================
  // PRIVATE HELPER METHODS
  // =========================================================================

  private async detectLanguages(codebaseRef: string): Promise<string[]> {
    // In real implementation, this would scan the codebase for language patterns
    // For now, return common languages
    this.logger.debug('Auto-detecting languages', { codebaseRef });

    // Simulate detection based on file extensions
    return ['typescript', 'python', 'javascript'];
  }

  private async runSemgrep(
    input: SASTInput,
    languages: string[]
  ): Promise<{
    findings: SASTFinding[];
    filesScanned: number;
    linesScanned: number;
    rulesApplied: number;
  }> {
    this.logger.info('Running Semgrep', { languages });

    // Invoke tool.code.staticPack with Semgrep
    const toolResult = await this.invokeTool('tool.code.staticPack', {
      codebase: input.codebaseRef,
      tool: 'semgrep',
      languages,
      rulesets: input.rulesets || ['owasp-top-10', 'cwe-top-25'],
      paths: input.scanPaths,
      exclude: input.excludePaths,
      config: input.configFile,
    });

    return {
      findings: this.parseSemgrepFindings(toolResult.findings || []),
      filesScanned: toolResult.filesScanned || 0,
      linesScanned: toolResult.linesScanned || 0,
      rulesApplied: toolResult.rulesApplied || 0,
    };
  }

  private async runBandit(
    input: SASTInput
  ): Promise<{
    findings: SASTFinding[];
    filesScanned: number;
    linesScanned: number;
    rulesApplied: number;
  }> {
    this.logger.info('Running Bandit (Python security)');

    const toolResult = await this.invokeTool('tool.code.staticPack', {
      codebase: input.codebaseRef,
      tool: 'bandit',
      paths: input.scanPaths,
      exclude: input.excludePaths,
    });

    return {
      findings: this.parseBanditFindings(toolResult.findings || []),
      filesScanned: toolResult.filesScanned || 0,
      linesScanned: toolResult.linesScanned || 0,
      rulesApplied: toolResult.rulesApplied || 0,
    };
  }

  private parseSemgrepFindings(rawFindings: any[]): SASTFinding[] {
    return rawFindings.map((finding, index) => ({
      id: `sast-semgrep-${Date.now()}-${index}`,
      severity: this.normalizeSeverity(finding.severity || finding.extra?.severity),
      category: this.categorizeVulnerability(finding.check_id || finding.ruleId),
      cweId: finding.extra?.metadata?.cwe?.[0] || this.inferCWE(finding.check_id),
      owaspId: finding.extra?.metadata?.owasp || this.inferOWASP(finding.check_id),
      title: finding.extra?.message || finding.message || 'Security vulnerability detected',
      description: finding.extra?.metadata?.description || finding.extra?.message || '',
      file: finding.path,
      line: finding.start?.line || finding.line,
      column: finding.start?.col || finding.column,
      codeSnippet: finding.extra?.lines || finding.code || '',
      dataFlow: finding.extra?.dataflow_trace?.taint_source
        ? this.extractDataFlow(finding.extra.dataflow_trace)
        : undefined,
      recommendation: this.generateRecommendation(finding),
      confidence: this.normalizeConfidence(finding.extra?.metadata?.confidence),
    }));
  }

  private parseBanditFindings(rawFindings: any[]): SASTFinding[] {
    return rawFindings.map((finding, index) => ({
      id: `sast-bandit-${Date.now()}-${index}`,
      severity: this.normalizeSeverity(finding.issue_severity),
      category: this.categorizeBanditIssue(finding.test_id || finding.test_name),
      cweId: finding.cwe?.id || this.inferCWEFromBandit(finding.test_id),
      owaspId: this.inferOWASPFromBandit(finding.test_id),
      title: finding.issue_text || 'Python security issue',
      description: finding.more_info || finding.issue_text || '',
      file: finding.filename,
      line: finding.line_number,
      column: finding.col_offset,
      codeSnippet: finding.code || '',
      recommendation: this.generateBanditRecommendation(finding),
      confidence: this.normalizeConfidence(finding.issue_confidence),
    }));
  }

  private normalizeSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const s = (severity || 'unknown').toLowerCase();
    if (s.includes('critical') || s === 'error') return 'critical';
    if (s.includes('high')) return 'high';
    if (s.includes('medium') || s.includes('moderate') || s === 'warning') return 'medium';
    if (s.includes('low')) return 'low';
    return 'info';
  }

  private normalizeConfidence(confidence: string | number): number {
    if (typeof confidence === 'number') {
      return Math.min(1, Math.max(0, confidence));
    }

    const c = (confidence || 'medium').toLowerCase();
    if (c === 'high') return 0.9;
    if (c === 'medium') return 0.7;
    if (c === 'low') return 0.5;
    return 0.6;
  }

  private categorizeVulnerability(ruleId: string): string {
    const id = (ruleId || '').toLowerCase();

    if (id.includes('sql') || id.includes('injection') || id.includes('command')) {
      return 'injection';
    }
    if (id.includes('xss') || id.includes('cross-site')) {
      return 'xss';
    }
    if (id.includes('auth') || id.includes('authentication')) {
      return 'authentication';
    }
    if (id.includes('crypto') || id.includes('encryption') || id.includes('hash')) {
      return 'cryptography';
    }
    if (id.includes('path') || id.includes('traversal')) {
      return 'path_traversal';
    }
    if (id.includes('xxe') || id.includes('xml')) {
      return 'xxe';
    }
    if (id.includes('ssrf')) {
      return 'ssrf';
    }
    if (id.includes('deserial')) {
      return 'deserialization';
    }
    if (id.includes('authz') || id.includes('authorization') || id.includes('access-control')) {
      return 'authorization';
    }

    return 'other';
  }

  private categorizeBanditIssue(testId: string): string {
    const id = (testId || '').toLowerCase();

    if (id.includes('sql')) return 'injection';
    if (id.includes('exec') || id.includes('eval')) return 'injection';
    if (id.includes('hardcoded') || id.includes('password')) return 'authentication';
    if (id.includes('crypto') || id.includes('hash') || id.includes('random')) return 'cryptography';
    if (id.includes('pickle') || id.includes('yaml')) return 'deserialization';
    if (id.includes('path') || id.includes('traversal')) return 'path_traversal';

    return 'other';
  }

  private inferCWE(ruleId: string): string | undefined {
    const id = (ruleId || '').toLowerCase();

    // Common CWE mappings
    if (id.includes('sql-injection')) return 'CWE-89';
    if (id.includes('command-injection')) return 'CWE-78';
    if (id.includes('xss')) return 'CWE-79';
    if (id.includes('path-traversal')) return 'CWE-22';
    if (id.includes('xxe')) return 'CWE-611';
    if (id.includes('ssrf')) return 'CWE-918';
    if (id.includes('deserialization')) return 'CWE-502';
    if (id.includes('weak-crypto')) return 'CWE-327';
    if (id.includes('hardcoded-password')) return 'CWE-798';
    if (id.includes('missing-auth')) return 'CWE-306';

    return undefined;
  }

  private inferCWEFromBandit(testId: string): string | undefined {
    const id = (testId || '').toLowerCase();

    if (id.includes('b608')) return 'CWE-89'; // SQL injection
    if (id.includes('b102') || id.includes('b601')) return 'CWE-78'; // Command injection
    if (id.includes('b301') || id.includes('b403')) return 'CWE-502'; // Pickle/YAML
    if (id.includes('b106') || id.includes('b107')) return 'CWE-798'; // Hardcoded password
    if (id.includes('b303') || id.includes('b304')) return 'CWE-327'; // Weak crypto

    return undefined;
  }

  private inferOWASP(ruleId: string): string | undefined {
    const category = this.categorizeVulnerability(ruleId);

    // OWASP Top 10 2021 mappings
    const owaspMap: Record<string, string> = {
      'authentication': 'A07:2021',
      'authorization': 'A01:2021',
      'injection': 'A03:2021',
      'xss': 'A03:2021',
      'cryptography': 'A02:2021',
      'deserialization': 'A08:2021',
      'ssrf': 'A10:2021',
      'xxe': 'A05:2021',
    };

    return owaspMap[category];
  }

  private inferOWASPFromBandit(testId: string): string | undefined {
    const category = this.categorizeBanditIssue(testId);
    return this.inferOWASP(category);
  }

  private extractDataFlow(dataflowTrace: any): string[] {
    // Extract taint source -> sink path
    const path: string[] = [];

    if (dataflowTrace.taint_source) {
      path.push(dataflowTrace.taint_source.content || 'user_input');
    }

    if (dataflowTrace.intermediate_vars) {
      path.push(...dataflowTrace.intermediate_vars.map((v: any) => v.content || v.name));
    }

    if (dataflowTrace.taint_sink) {
      path.push(dataflowTrace.taint_sink.content || 'dangerous_sink');
    }

    return path.length > 0 ? path : ['user_input', 'dangerous_sink'];
  }

  private generateRecommendation(finding: any): string {
    const ruleId = (finding.check_id || finding.ruleId || '').toLowerCase();

    // Rule-specific recommendations
    if (ruleId.includes('sql-injection')) {
      return 'Use parameterized queries or an ORM to prevent SQL injection. Never concatenate user input into SQL queries.';
    }
    if (ruleId.includes('command-injection')) {
      return 'Avoid executing shell commands with user input. Use safe APIs or sanitize input with allowlists.';
    }
    if (ruleId.includes('xss')) {
      return 'Sanitize user input before rendering in HTML. Use framework-provided escaping mechanisms or Content Security Policy.';
    }
    if (ruleId.includes('path-traversal')) {
      return 'Validate file paths against an allowlist. Use path.resolve() and check that result is within expected directory.';
    }
    if (ruleId.includes('weak-crypto')) {
      return 'Use strong cryptographic algorithms (AES-256, SHA-256). Avoid MD5, SHA-1, DES, and weak key sizes.';
    }
    if (ruleId.includes('hardcoded-password') || ruleId.includes('hardcoded-secret')) {
      return 'Remove hardcoded credentials. Use environment variables or a secrets management system (AWS Secrets Manager, HashiCorp Vault).';
    }
    if (ruleId.includes('xxe')) {
      return 'Disable XML external entity processing. Configure parser to reject DTDs and external entities.';
    }
    if (ruleId.includes('ssrf')) {
      return 'Validate and sanitize URLs. Use allowlists for domains/IPs. Disable redirects for user-controlled URLs.';
    }
    if (ruleId.includes('deserialization')) {
      return 'Avoid deserializing untrusted data. Use safe serialization formats (JSON) or implement integrity checks (HMAC).';
    }

    return finding.extra?.metadata?.fix || finding.fix || 'Review code and apply security best practices.';
  }

  private generateBanditRecommendation(finding: any): string {
    const testId = (finding.test_id || '').toLowerCase();

    if (testId.includes('b608')) {
      return 'Use parameterized queries to prevent SQL injection. Avoid string concatenation for SQL.';
    }
    if (testId.includes('b102') || testId.includes('b601')) {
      return 'Avoid using exec(), eval(), or os.system() with user input. Use safe alternatives or sanitize input.';
    }
    if (testId.includes('b301')) {
      return 'Avoid pickle.load() on untrusted data. Use JSON for serialization or verify pickle data integrity.';
    }
    if (testId.includes('b403')) {
      return 'Avoid yaml.load(). Use yaml.safe_load() to prevent code execution vulnerabilities.';
    }
    if (testId.includes('b106') || testId.includes('b107')) {
      return 'Remove hardcoded passwords. Use environment variables or secrets management.';
    }
    if (testId.includes('b303') || testId.includes('b304') || testId.includes('b305')) {
      return 'Use strong cryptographic algorithms. Replace MD5/SHA-1 with SHA-256. Use secrets.token_bytes() for random generation.';
    }

    return finding.more_info || 'Review code and apply Python security best practices.';
  }

  private deduplicateFindings(findings: SASTFinding[]): SASTFinding[] {
    // Remove duplicate findings (same file + line)
    const seen = new Set<string>();
    const deduped: SASTFinding[] = [];

    for (const finding of findings) {
      const key = `${finding.file}:${finding.line}:${finding.category}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(finding);
      }
    }

    // Sort by severity (critical -> high -> medium -> low -> info)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    deduped.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return deduped;
  }

  private estimateFileCount(input: SASTInput): number {
    // Rough estimate based on typical project sizes
    if (input.scanPaths && input.scanPaths.length > 0) {
      return input.scanPaths.length * 50; // ~50 files per path
    }
    return 200; // Default estimate
  }

  private estimateScanTime(fileCount: number): string {
    // Semgrep: ~100 files/second
    // Bandit: ~50 files/second
    const seconds = Math.ceil(fileCount / 75); // Average rate
    if (seconds < 60) return `${seconds} seconds`;
    return `${Math.ceil(seconds / 60)} minutes`;
  }

  private async invokeTool(toolId: string, params: any): Promise<any> {
    // Placeholder for actual tool invocation
    this.logger.debug(`Invoking tool: ${toolId}`, { params });

    // Simulate tool response
    return {
      findings: [],
      filesScanned: 0,
      linesScanned: 0,
      rulesApplied: 0,
      toolVersion: 'semgrep-1.45.0',
    };
  }
}

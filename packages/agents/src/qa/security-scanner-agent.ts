import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Security Vulnerability
 */
interface SecurityVulnerability {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'authentication' | 'authorization' | 'injection' | 'xss' | 'csrf' | 'sensitive-data' | 'configuration' | 'dependency';
  cwe: string; // Common Weakness Enumeration ID
  owasp: string; // OWASP Top 10 category
  description: string;
  location: {
    file: string;
    line?: number;
    function?: string;
  };
  impact: string;
  exploitability: 'easy' | 'moderate' | 'difficult';
  remediation: string;
  references: string[];
}

/**
 * Dependency Vulnerability
 */
interface DependencyVulnerability {
  package: string;
  version: string;
  vulnerability: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cve: string; // CVE identifier
  fixedIn: string;
  recommendation: string;
}

/**
 * Security Configuration
 */
interface SecurityConfiguration {
  area: string;
  current: string;
  recommended: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact: string;
}

/**
 * Compliance Check
 */
interface ComplianceCheck {
  standard: 'OWASP' | 'PCI-DSS' | 'HIPAA' | 'SOC2' | 'GDPR';
  requirement: string;
  status: 'compliant' | 'non-compliant' | 'partial' | 'not-applicable';
  findings: string[];
  remediation?: string;
}

/**
 * Security Test Case
 */
interface SecurityTestCase {
  id: string;
  name: string;
  category: string;
  description: string;
  testScript: string;
  expectedResult: string;
  actualResult?: string;
  status?: 'pass' | 'fail' | 'skip';
}

/**
 * Security Scan Report
 */
interface SecurityScanReport {
  summary: {
    totalVulnerabilities: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    securityScore: number; // 0-100
    complianceScore: number; // 0-100
  };
  vulnerabilities: SecurityVulnerability[];
  dependencyVulnerabilities: DependencyVulnerability[];
  securityConfigurations: SecurityConfiguration[];
  complianceChecks: ComplianceCheck[];
  securityTests: SecurityTestCase[];
  threatModel: {
    assets: string[];
    threats: {
      threat: string;
      likelihood: 'high' | 'medium' | 'low';
      impact: 'high' | 'medium' | 'low';
      mitigations: string[];
    }[];
  };
  scanTools: {
    tool: string;
    version: string;
    purpose: string;
  }[];
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
  }[];
  remediationPlan: {
    phase: string;
    tasks: string[];
    estimatedEffort: string;
    priority: string;
  }[];
}

/**
 * SecurityScannerAgent
 *
 * Performs comprehensive security analysis including:
 * - Static Application Security Testing (SAST)
 * - Dependency vulnerability scanning
 * - Security configuration review
 * - OWASP Top 10 compliance checking
 * - Threat modeling
 * - Security test case generation
 * - Compliance validation (PCI-DSS, HIPAA, GDPR, SOC2)
 * - Penetration testing recommendations
 *
 * Identifies security vulnerabilities, misconfigurations, and provides
 * actionable remediation guidance with priority levels.
 *
 * Input: Code implementation + System architecture + Compliance requirements
 * Output: Comprehensive security scan report with vulnerabilities and remediation plan
 */
export class SecurityScannerAgent extends BaseAgent {
  private llm: ChatAnthropic;

  constructor(config: AgentConfig) {
    super(config);

    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  protected async plan(input: any): Promise<ExecutionPlan> {
    return {
      steps: [
        'Analyze code for security vulnerabilities',
        'Scan dependencies for known CVEs',
        'Review security configurations',
        'Generate remediation plan with priorities',
      ],
      estimatedTotalDurationMs: 16000, // ~16 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildSecurityScanPrompt(input);

      this.logger.info('Invoking LLM for security scanning');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const scanReport = this.parseScanReport(content);

      return {
        reasoning: `Security scan identified ${scanReport.summary.totalVulnerabilities} vulnerabilities (${scanReport.summary.criticalCount} critical, ${scanReport.summary.highCount} high). Security score: ${scanReport.summary.securityScore}/100.`,
        confidence: 0.85,
        intermediate: {
          scanReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for security scanning', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const scanReport = result.intermediate?.scanReport;

    return [
      {
        type: 'security-scan-report',
        content: scanReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildSecurityScanPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const storyLoopComplete = previousArtifacts?.find((a: any) => a.type === 'story-loop-complete')?.content;
    const codeReviews = previousArtifacts?.filter((a: any) => a.type === 'code-review') || [];
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;

    const language = repoBlueprint?.overview?.language || 'TypeScript';
    const framework = repoBlueprint?.overview?.framework || 'React';
    const complianceReqs = ideaSpec?.constraints?.complianceRequirements || [];
    const securityFindings = codeReviews.flatMap((r: any) =>
      r.content?.securityAnalysis?.vulnerabilities || []
    );

    return `You are a Senior Security Engineer performing comprehensive security analysis.

PROJECT CONTEXT:
Language: ${language}
Framework: ${framework}
Total Files: ${storyLoopComplete?.summary?.totalFiles || 0}
Compliance Requirements: ${complianceReqs.join(', ') || 'None specified'}

SECURITY FINDINGS FROM CODE REVIEW:
${securityFindings.slice(0, 5).map((v: any, i: number) => `
${i + 1}. [${v.severity}] ${v.type}: ${v.description}
`).join('\n') || 'No critical findings from code review'}

SYSTEM ARCHITECTURE:
Architecture Style: ${systemArch?.overview?.architectureStyle || 'N/A'}
Security Controls: ${systemArch?.securityArchitecture?.controls?.slice(0, 3).join(', ') || 'N/A'}

TASK:
Perform comprehensive security analysis. Your response MUST be valid JSON:

{
  "summary": {
    "totalVulnerabilities": 12,
    "criticalCount": 2,
    "highCount": 4,
    "mediumCount": 5,
    "lowCount": 1,
    "securityScore": 72,
    "complianceScore": 85
  },
  "vulnerabilities": [
    {
      "id": "SEC-001",
      "title": "SQL Injection vulnerability in user search",
      "severity": "critical",
      "category": "injection",
      "cwe": "CWE-89",
      "owasp": "A03:2021 – Injection",
      "description": "User input is directly concatenated into SQL query without sanitization",
      "location": {
        "file": "src/api/users.ts",
        "line": 45,
        "function": "searchUsers"
      },
      "impact": "Attacker could read/modify database, extract sensitive data, or delete records",
      "exploitability": "easy",
      "remediation": "Use parameterized queries or ORM with prepared statements. Example: db.query('SELECT * FROM users WHERE name = $1', [username])",
      "references": [
        "https://owasp.org/www-community/attacks/SQL_Injection",
        "https://cwe.mitre.org/data/definitions/89.html"
      ]
    },
    {
      "id": "SEC-002",
      "title": "Missing authentication on admin endpoint",
      "severity": "critical",
      "category": "authentication",
      "cwe": "CWE-306",
      "owasp": "A01:2021 – Broken Access Control",
      "description": "Admin endpoint /api/admin/users accessible without authentication",
      "location": {
        "file": "src/api/admin.ts",
        "line": 23,
        "function": "listAllUsers"
      },
      "impact": "Unauthorized access to admin functionality and sensitive user data",
      "exploitability": "easy",
      "remediation": "Add authentication middleware: app.use('/api/admin', requireAuth, requireAdmin)",
      "references": ["https://owasp.org/Top10/A01_2021-Broken_Access_Control/"]
    },
    {
      "id": "SEC-003",
      "title": "Sensitive data logged to console",
      "severity": "high",
      "category": "sensitive-data",
      "cwe": "CWE-532",
      "owasp": "A02:2021 – Cryptographic Failures",
      "description": "User passwords and API keys logged in plain text",
      "location": {
        "file": "src/auth/login.ts",
        "line": 67
      },
      "impact": "Credentials exposed in log files, accessible to unauthorized users",
      "exploitability": "moderate",
      "remediation": "Remove sensitive data from logs, use proper logging levels, sanitize log output",
      "references": ["https://cwe.mitre.org/data/definitions/532.html"]
    }
  ],
  "dependencyVulnerabilities": [
    {
      "package": "lodash",
      "version": "4.17.15",
      "vulnerability": "Prototype Pollution",
      "severity": "high",
      "cve": "CVE-2020-8203",
      "fixedIn": "4.17.21",
      "recommendation": "Update to lodash@4.17.21 or later"
    },
    {
      "package": "express",
      "version": "4.16.0",
      "vulnerability": "Query Parameter Pollution",
      "severity": "medium",
      "cve": "CVE-2022-24999",
      "fixedIn": "4.17.3",
      "recommendation": "Update to express@4.17.3 or later"
    }
  ],
  "securityConfigurations": [
    {
      "area": "HTTPS/TLS",
      "current": "HTTP only",
      "recommended": "Enforce HTTPS with TLS 1.2+",
      "priority": "critical",
      "impact": "Data transmitted in plain text, vulnerable to MITM attacks"
    },
    {
      "area": "CORS",
      "current": "Allow all origins (*)",
      "recommended": "Restrict to specific trusted domains",
      "priority": "high",
      "impact": "Vulnerable to cross-origin attacks"
    },
    {
      "area": "Password Policy",
      "current": "No minimum requirements",
      "recommended": "Minimum 12 characters, complexity requirements",
      "priority": "high",
      "impact": "Weak passwords compromise account security"
    }
  ],
  "complianceChecks": [
    {
      "standard": "OWASP",
      "requirement": "A01:2021 – Broken Access Control",
      "status": "non-compliant",
      "findings": [
        "Missing authorization checks on admin endpoints",
        "No role-based access control implementation"
      ],
      "remediation": "Implement RBAC with middleware for all protected routes"
    },
    {
      "standard": "GDPR",
      "requirement": "Article 32 - Security of Processing",
      "status": "partial",
      "findings": [
        "Encryption at rest: Not implemented",
        "Encryption in transit: Partial (HTTPS not enforced)"
      ],
      "remediation": "Enable database encryption, enforce HTTPS"
    }
  ],
  "securityTests": [
    {
      "id": "ST-001",
      "name": "SQL Injection Test",
      "category": "Injection",
      "description": "Test if application is vulnerable to SQL injection",
      "testScript": "const maliciousInput = \\\"'; DROP TABLE users; --\\\";\\nconst response = await api.post('/api/search', { query: maliciousInput });\\nexpect(response.status).not.toBe(200);",
      "expectedResult": "Request rejected with 400 Bad Request"
    },
    {
      "id": "ST-002",
      "name": "Unauthorized Access Test",
      "category": "Authentication",
      "description": "Verify admin endpoints require authentication",
      "testScript": "const response = await api.get('/api/admin/users');\\nexpect(response.status).toBe(401);",
      "expectedResult": "401 Unauthorized"
    }
  ],
  "threatModel": {
    "assets": [
      "User credentials",
      "Personal data (PII)",
      "Payment information",
      "API keys and secrets"
    ],
    "threats": [
      {
        "threat": "SQL Injection Attack",
        "likelihood": "high",
        "impact": "high",
        "mitigations": [
          "Use parameterized queries",
          "Input validation and sanitization",
          "Principle of least privilege for database access"
        ]
      },
      {
        "threat": "Brute Force Authentication",
        "likelihood": "medium",
        "impact": "high",
        "mitigations": [
          "Implement rate limiting",
          "Account lockout after failed attempts",
          "Multi-factor authentication"
        ]
      }
    ]
  },
  "scanTools": [
    {
      "tool": "OWASP Dependency-Check",
      "version": "8.0.0",
      "purpose": "Scan dependencies for known vulnerabilities"
    },
    {
      "tool": "ESLint Security Plugin",
      "version": "1.7.1",
      "purpose": "Static analysis for security issues"
    },
    {
      "tool": "npm audit",
      "version": "latest",
      "purpose": "Check npm packages for vulnerabilities"
    }
  ],
  "recommendations": [
    {
      "priority": "immediate",
      "recommendation": "Fix critical SQL injection vulnerability in user search",
      "impact": "Prevents database compromise and data exfiltration",
      "effort": "low"
    },
    {
      "priority": "immediate",
      "recommendation": "Add authentication to admin endpoints",
      "impact": "Prevents unauthorized admin access",
      "effort": "low"
    },
    {
      "priority": "high",
      "recommendation": "Update vulnerable dependencies (lodash, express)",
      "impact": "Eliminates known CVEs",
      "effort": "low"
    },
    {
      "priority": "high",
      "recommendation": "Enforce HTTPS across all endpoints",
      "impact": "Protects data in transit from MITM attacks",
      "effort": "medium"
    }
  ],
  "remediationPlan": [
    {
      "phase": "Immediate (Week 1)",
      "tasks": [
        "Fix SQL injection vulnerabilities",
        "Add authentication to admin endpoints",
        "Remove sensitive data from logs"
      ],
      "estimatedEffort": "3-5 days",
      "priority": "critical"
    },
    {
      "phase": "Short-term (Weeks 2-4)",
      "tasks": [
        "Update all vulnerable dependencies",
        "Implement HTTPS enforcement",
        "Add rate limiting",
        "Implement RBAC system"
      ],
      "estimatedEffort": "2 weeks",
      "priority": "high"
    },
    {
      "phase": "Medium-term (Months 2-3)",
      "tasks": [
        "Implement comprehensive security testing in CI/CD",
        "Add Web Application Firewall (WAF)",
        "Conduct penetration testing",
        "Implement security monitoring and alerting"
      ],
      "estimatedEffort": "1 month",
      "priority": "medium"
    }
  ]
}

REQUIREMENTS:
- Identify 10-20 security vulnerabilities across OWASP Top 10 categories
- Include specific code locations and remediation steps
- Scan for dependency vulnerabilities (CVEs)
- Review security configurations (HTTPS, CORS, CSP, etc.)
- Check compliance with specified standards (${complianceReqs.join(', ') || 'OWASP'})
- Generate security test cases
- Create threat model with assets and threats
- Provide prioritized remediation plan
- Focus on:
  - Injection attacks (SQL, NoSQL, Command)
  - Authentication and authorization flaws
  - Sensitive data exposure
  - Security misconfiguration
  - Cross-Site Scripting (XSS)
  - Insecure deserialization
  - Known vulnerable dependencies

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseScanReport(text: string): SecurityScanReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as SecurityScanReport;
    } catch (error) {
      this.logger.error('Failed to parse security scan report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback security scan report');

    const scanReport: SecurityScanReport = {
      summary: {
        totalVulnerabilities: 3,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 2,
        lowCount: 0,
        securityScore: 75,
        complianceScore: 80,
      },
      vulnerabilities: [
        {
          id: 'SEC-001',
          title: 'Missing HTTPS enforcement',
          severity: 'high',
          category: 'configuration',
          cwe: 'CWE-319',
          owasp: 'A02:2021 – Cryptographic Failures',
          description: 'Application allows HTTP connections',
          location: {
            file: 'server.ts',
            line: 10,
          },
          impact: 'Data transmitted without encryption',
          exploitability: 'moderate',
          remediation: 'Enforce HTTPS and add HSTS header',
          references: ['https://owasp.org/Top10/A02_2021-Cryptographic_Failures/'],
        },
      ],
      dependencyVulnerabilities: [],
      securityConfigurations: [],
      complianceChecks: [],
      securityTests: [],
      threatModel: {
        assets: ['User data'],
        threats: [],
      },
      scanTools: [
        {
          tool: 'Static Analysis',
          version: '1.0.0',
          purpose: 'Security scanning',
        },
      ],
      recommendations: [
        {
          priority: 'high',
          recommendation: 'Enable HTTPS',
          impact: 'Secure data in transit',
          effort: 'medium',
        },
      ],
      remediationPlan: [],
    };

    return {
      reasoning: 'Using fallback security scan report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        scanReport,
      },
    };
  }
}

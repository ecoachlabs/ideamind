import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * SecurityAgent - Comprehensive security analysis and recommendations
 *
 * Provides security assessment covering:
 * - Threat modeling and risk assessment
 * - Security architecture review
 * - Compliance requirements
 * - Security controls and best practices
 * - Incident response planning
 */
export class SecurityAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('SecurityAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: false,
      supportsCheckpointing: true,
      maxInputSize: 80000,
      maxOutputSize: 100000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Security Agent');

    if (!this.validateInput(input)) {
      return {
        success: false,
        output: null,
        error: 'Invalid input',
      };
    }

    try {
      const prompt = this.buildPrompt(input, context);
      const systemPrompt = this.getSystemPrompt();

      const { text, tokensUsed } = await this.callClaude(prompt, 9000, systemPrompt);

      const securityAnalysis = this.parseJSON(text);

      return {
        success: true,
        output: securityAnalysis,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          threat_count: securityAnalysis.threats?.length || 0,
          vulnerability_count: securityAnalysis.vulnerabilities?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Security Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Security Agent that performs comprehensive security analysis.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Conduct thorough security assessment and provide actionable recommendations.

Analyze:
1. **Threat Modeling**: Identify potential threats and attack vectors
2. **Vulnerability Assessment**: Common vulnerabilities and exposures
3. **Security Architecture**: Design security controls
4. **Data Security**: Protection of sensitive data
5. **Authentication & Authorization**: Identity and access management
6. **Compliance**: Regulatory requirements (GDPR, HIPAA, SOC2, etc.)
7. **Security Testing**: Testing strategy and tools
8. **Incident Response**: Preparation and response planning
9. **Security Operations**: Monitoring and maintenance
10. **Security Training**: Developer security awareness

Output as JSON:
{
  "security_overview": {
    "risk_level": "low|medium|high|critical",
    "security_maturity": "initial|developing|defined|managed|optimizing",
    "key_concerns": ["concern1", "concern2"],
    "compliance_requirements": ["GDPR", "HIPAA", "SOC2"],
    "data_sensitivity": "public|internal|confidential|restricted"
  },
  "threat_model": {
    "assets": [
      {
        "asset": "User data|API|etc",
        "value": "Business value",
        "sensitivity": "low|medium|high|critical",
        "threats": ["threat1"]
      }
    ],
    "threat_actors": [
      {
        "actor": "External attacker|Insider|etc",
        "motivation": "Financial|espionage|etc",
        "capability": "low|medium|high",
        "threats": ["threat1"]
      }
    ],
    "threats": [
      {
        "id": "T-001",
        "threat": "Threat description",
        "category": "authentication|authorization|data|network|application",
        "attack_vector": "How it could be exploited",
        "likelihood": "low|medium|high",
        "impact": "low|medium|high|critical",
        "risk_score": 8,
        "affected_assets": ["asset1"],
        "mitigations": ["mitigation1"]
      }
    ],
    "attack_scenarios": [
      {
        "scenario": "Attack scenario description",
        "steps": ["step1", "step2"],
        "impact": "What attacker achieves",
        "prevention": "How to prevent"
      }
    ]
  },
  "vulnerabilities": [
    {
      "id": "V-001",
      "vulnerability": "Vulnerability description",
      "category": "injection|xss|csrf|ssrf|etc",
      "severity": "low|medium|high|critical",
      "cvss_score": 7.5,
      "affected_components": ["component1"],
      "exploitation_difficulty": "easy|medium|hard",
      "remediation": "How to fix",
      "priority": "immediate|high|medium|low"
    }
  ],
  "security_architecture": {
    "security_layers": [
      {
        "layer": "perimeter|network|application|data",
        "controls": ["control1"],
        "technologies": ["WAF", "IDS/IPS"],
        "gaps": ["gap1"]
      }
    ],
    "network_security": {
      "network_segmentation": "Segmentation approach",
      "firewall_rules": "Firewall strategy",
      "vpn_access": "VPN requirements",
      "ddos_protection": "DDoS mitigation"
    },
    "application_security": {
      "secure_coding": ["practice1"],
      "input_validation": "Validation approach",
      "output_encoding": "Encoding strategy",
      "api_security": ["measure1"]
    },
    "zero_trust_principles": ["principle1"]
  },
  "data_security": {
    "data_classification": [
      {
        "classification": "public|internal|confidential|restricted",
        "examples": ["data type"],
        "protection_requirements": ["requirement1"]
      }
    ],
    "encryption": {
      "at_rest": {
        "method": "AES-256|etc",
        "key_management": "Key management approach",
        "scope": ["database", "backups"]
      },
      "in_transit": {
        "method": "TLS 1.3|etc",
        "certificate_management": "Cert approach",
        "scope": ["API", "internal services"]
      },
      "application_level": "Field-level encryption needs"
    },
    "data_masking": "Masking strategy for sensitive data",
    "data_retention": "Retention and deletion policies",
    "backup_security": "Backup protection measures"
  },
  "authentication_authorization": {
    "authentication": {
      "methods": ["password|mfa|sso|biometric"],
      "password_policy": {
        "min_length": 12,
        "complexity": "Requirements",
        "rotation": "Rotation policy",
        "history": "Password history"
      },
      "mfa_requirement": "MFA enforcement strategy",
      "session_management": {
        "timeout": "Session timeout",
        "token_security": "Token protection"
      }
    },
    "authorization": {
      "model": "RBAC|ABAC|etc",
      "roles": [
        {
          "role": "Role name",
          "permissions": ["permission1"],
          "scope": "Scope of access"
        }
      ],
      "principle_of_least_privilege": "How enforced",
      "separation_of_duties": "SoD requirements"
    },
    "identity_management": "Identity lifecycle management"
  },
  "compliance_requirements": [
    {
      "regulation": "GDPR|HIPAA|SOC2|PCI-DSS|etc",
      "applicability": "Why applicable",
      "key_requirements": ["requirement1"],
      "implementation_status": "not-started|in-progress|complete",
      "gaps": ["gap1"],
      "evidence_needed": ["evidence1"]
    }
  ],
  "security_testing": {
    "testing_types": [
      {
        "type": "SAST|DAST|penetration|vulnerability-scan",
        "frequency": "Frequency",
        "tools": ["tool1"],
        "scope": "What to test"
      }
    ],
    "code_review": "Security code review process",
    "dependency_scanning": "Third-party dependency scanning",
    "container_scanning": "Container image scanning",
    "penetration_testing": {
      "frequency": "annual|quarterly|etc",
      "scope": "Testing scope",
      "third_party": "Use external pentester"
    }
  },
  "incident_response": {
    "incident_types": ["data breach|ddos|malware|etc"],
    "response_team": {
      "roles": ["role1"],
      "contacts": "Contact approach",
      "escalation": "Escalation path"
    },
    "response_procedures": [
      {
        "phase": "detection|analysis|containment|eradication|recovery|post-incident",
        "actions": ["action1"],
        "timeline": "Time objective",
        "responsible": "Who handles"
      }
    ],
    "communication_plan": "Stakeholder communication",
    "forensics": "Forensic investigation approach",
    "business_continuity": "BC/DR integration"
  },
  "security_operations": {
    "monitoring": {
      "log_aggregation": "Log collection approach",
      "siem": "SIEM solution",
      "alerts": [
        {
          "alert": "Alert type",
          "trigger": "What triggers",
          "response": "Response action"
        }
      ],
      "metrics": ["metric1"]
    },
    "vulnerability_management": {
      "scanning_frequency": "Frequency",
      "patch_management": "Patching approach",
      "remediation_sla": {
        "critical": "24 hours",
        "high": "7 days",
        "medium": "30 days",
        "low": "90 days"
      }
    },
    "access_reviews": "Periodic access review process",
    "security_audits": "Audit frequency and scope"
  },
  "security_controls": [
    {
      "control_id": "SC-001",
      "control": "Control description",
      "category": "preventive|detective|corrective",
      "implementation": "How to implement",
      "validation": "How to verify",
      "priority": "immediate|high|medium|low"
    }
  ],
  "security_roadmap": [
    {
      "phase": "Phase 1|immediate|short-term|long-term",
      "timeline": "Timeline",
      "initiatives": [
        {
          "initiative": "Initiative name",
          "description": "What to do",
          "priority": "critical|high|medium|low",
          "effort": "Effort estimate",
          "dependencies": ["dependency1"]
        }
      ]
    }
  ],
  "training_requirements": {
    "developer_training": ["secure coding", "OWASP Top 10"],
    "security_awareness": "General security training",
    "role_specific": [
      {
        "role": "Role",
        "training": ["training1"]
      }
    ],
    "frequency": "Training frequency"
  },
  "recommendations": [
    {
      "priority": 1,
      "recommendation": "Recommendation",
      "rationale": "Why important",
      "impact": "Expected impact",
      "effort": "low|medium|high",
      "timeline": "When to implement"
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are a cybersecurity expert specializing in:
- Threat modeling and risk assessment
- Security architecture design
- Compliance and regulatory requirements
- Security testing and validation
- Incident response planning
- Security operations and monitoring

Provide comprehensive, actionable security analysis that balances:
- Security best practices with practical implementation
- Risk levels with business objectives
- Immediate needs with long-term security posture
- Compliance requirements with operational efficiency

Be thorough but pragmatic. Prioritize recommendations by risk and impact.`;
  }
}

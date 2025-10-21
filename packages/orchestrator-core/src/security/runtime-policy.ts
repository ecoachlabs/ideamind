/**
 * Runtime Policy Guard (OPA)
 *
 * Roadmap: M5 - Safety-in-Depth
 *
 * Guard: guard.runtimePolicy
 *
 * Enforces policy at runtime (egress, secrets, nets) using Open Policy Agent.
 *
 * Acceptance:
 * - Violations blocked; audit logged
 */

import pino from 'pino';
import { Pool } from 'pg';

const logger = pino({ name: 'runtime-policy' });

// ============================================================================
// Types
// ============================================================================

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  violations?: string[];
  metadata?: Record<string, any>;
}

export interface PolicyContext {
  action: string;
  resource: string;
  subject: string;
  environment?: {
    tenantId?: string;
    runId?: string;
    phase?: string;
    timestamp?: Date;
  };
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  category: 'egress' | 'secrets' | 'network' | 'tools' | 'data' | 'compute';
  enabled: boolean;
  rules: PolicyRule[];
}

export interface PolicyRule {
  id: string;
  condition: string; // OPA Rego expression
  effect: 'allow' | 'deny';
  priority: number;
}

export interface PolicyViolation {
  policyId: string;
  context: PolicyContext;
  decision: PolicyDecision;
  timestamp: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// Runtime Policy Guard
// ============================================================================

export class RuntimePolicyGuard {
  private policies: Map<string, Policy> = new Map();

  constructor(private db: Pool) {
    this.initializeDefaultPolicies();
    this.loadPoliciesFromDB();
  }

  /**
   * Initialize default policies
   */
  private initializeDefaultPolicies() {
    // Egress control policy
    this.registerPolicy({
      id: 'egress-allowlist',
      name: 'Egress Allowlist',
      description: 'Only allow egress to approved domains',
      category: 'egress',
      enabled: true,
      rules: [
        {
          id: 'egress-rule-1',
          condition: 'resource.domain in data.allowed_domains',
          effect: 'allow',
          priority: 1,
        },
        {
          id: 'egress-rule-2',
          condition: 'resource.domain not in data.allowed_domains',
          effect: 'deny',
          priority: 2,
        },
      ],
    });

    // Secrets access policy
    this.registerPolicy({
      id: 'secrets-rbac',
      name: 'Secrets RBAC',
      description: 'Role-based access to secrets',
      category: 'secrets',
      enabled: true,
      rules: [
        {
          id: 'secrets-rule-1',
          condition: 'subject.role == "admin"',
          effect: 'allow',
          priority: 1,
        },
        {
          id: 'secrets-rule-2',
          condition: 'subject.role == "agent" and resource.scope == "run"',
          effect: 'allow',
          priority: 2,
        },
        {
          id: 'secrets-rule-3',
          condition: 'true',
          effect: 'deny',
          priority: 99,
        },
      ],
    });

    // Tool execution policy
    this.registerPolicy({
      id: 'tool-sandboxing',
      name: 'Tool Sandboxing',
      description: 'Restrict dangerous tool operations',
      category: 'tools',
      enabled: true,
      rules: [
        {
          id: 'tool-rule-1',
          condition: 'resource.tool == "bash" and contains(resource.command, "rm -rf")',
          effect: 'deny',
          priority: 1,
        },
        {
          id: 'tool-rule-2',
          condition: 'resource.tool == "bash" and contains(resource.command, "/etc/")',
          effect: 'deny',
          priority: 2,
        },
        {
          id: 'tool-rule-3',
          condition: 'resource.filesystemPath startsWith "/home/sandbox"',
          effect: 'allow',
          priority: 10,
        },
      ],
    });

    // Network policy
    this.registerPolicy({
      id: 'network-isolation',
      name: 'Network Isolation',
      description: 'Isolate tenant networks',
      category: 'network',
      enabled: true,
      rules: [
        {
          id: 'network-rule-1',
          condition: 'resource.tenantId == subject.tenantId',
          effect: 'allow',
          priority: 1,
        },
        {
          id: 'network-rule-2',
          condition: 'resource.tenantId != subject.tenantId',
          effect: 'deny',
          priority: 2,
        },
      ],
    });

    // Data access policy
    this.registerPolicy({
      id: 'data-privacy',
      name: 'Data Privacy',
      description: 'Prevent cross-tenant data access',
      category: 'data',
      enabled: true,
      rules: [
        {
          id: 'data-rule-1',
          condition: 'resource.classification == "public"',
          effect: 'allow',
          priority: 1,
        },
        {
          id: 'data-rule-2',
          condition:
            'resource.classification == "private" and resource.ownerId == subject.id',
          effect: 'allow',
          priority: 2,
        },
        {
          id: 'data-rule-3',
          condition: 'resource.classification == "private"',
          effect: 'deny',
          priority: 3,
        },
      ],
    });

    // Compute limits policy
    this.registerPolicy({
      id: 'compute-quotas',
      name: 'Compute Quotas',
      description: 'Enforce compute resource quotas',
      category: 'compute',
      enabled: true,
      rules: [
        {
          id: 'compute-rule-1',
          condition: 'resource.cpuCores <= subject.quota.maxCPU',
          effect: 'allow',
          priority: 1,
        },
        {
          id: 'compute-rule-2',
          condition: 'resource.memoryGB <= subject.quota.maxMemory',
          effect: 'allow',
          priority: 2,
        },
        {
          id: 'compute-rule-3',
          condition: 'true',
          effect: 'deny',
          priority: 99,
        },
      ],
    });
  }

  /**
   * Load policies from database
   */
  private async loadPoliciesFromDB() {
    try {
      const result = await this.db.query(`
        SELECT * FROM runtime_policies WHERE enabled = true
      `);

      for (const row of result.rows) {
        this.policies.set(row.id, {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          enabled: row.enabled,
          rules: row.rules,
        });
      }

      logger.info({ count: this.policies.size }, 'Policies loaded');
    } catch (err) {
      logger.warn({ err }, 'Failed to load policies from DB');
    }
  }

  /**
   * Evaluate policy decision
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    logger.debug({ context }, 'Evaluating policy');

    // Find applicable policies
    const applicablePolicies = this.getApplicablePolicies(context);

    if (applicablePolicies.length === 0) {
      // No policies = allow by default
      return { allowed: true };
    }

    // Evaluate each policy
    const violations: string[] = [];
    let allowed = true;

    for (const policy of applicablePolicies) {
      const decision = await this.evaluatePolicy(policy, context);

      if (!decision.allowed) {
        allowed = false;
        violations.push(`${policy.name}: ${decision.reason || 'Policy denied'}`);
      }
    }

    const result: PolicyDecision = {
      allowed,
      violations: violations.length > 0 ? violations : undefined,
      reason: violations.length > 0 ? violations.join('; ') : undefined,
    };

    // Log violation
    if (!allowed) {
      await this.logViolation(context, result);
    }

    return result;
  }

  /**
   * Get applicable policies for context
   */
  private getApplicablePolicies(context: PolicyContext): Policy[] {
    const policies: Policy[] = [];

    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      // Check if policy applies to this action
      if (this.policyApplies(policy, context)) {
        policies.push(policy);
      }
    }

    return policies;
  }

  /**
   * Check if policy applies to context
   */
  private policyApplies(policy: Policy, context: PolicyContext): boolean {
    // Map actions to policy categories
    const actionToPolicyMap: Record<string, Policy['category'][]> = {
      'http.request': ['egress', 'network'],
      'secret.read': ['secrets'],
      'tool.execute': ['tools'],
      'data.read': ['data'],
      'data.write': ['data'],
      'compute.allocate': ['compute'],
    };

    const applicableCategories = actionToPolicyMap[context.action] || [];
    return applicableCategories.includes(policy.category);
  }

  /**
   * Evaluate single policy
   */
  private async evaluatePolicy(
    policy: Policy,
    context: PolicyContext
  ): Promise<PolicyDecision> {
    // Sort rules by priority
    const sortedRules = [...policy.rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      const matches = this.evaluateRule(rule, context);

      if (matches) {
        return {
          allowed: rule.effect === 'allow',
          reason: rule.effect === 'deny' ? `Rule ${rule.id} denied` : undefined,
        };
      }
    }

    // No rules matched = deny by default
    return {
      allowed: false,
      reason: 'No matching rules',
    };
  }

  /**
   * Evaluate single rule
   *
   * Note: This is a simplified implementation.
   * In production, use actual OPA/Rego evaluation.
   */
  private evaluateRule(rule: PolicyRule, context: PolicyContext): boolean {
    // Parse condition (simplified - real OPA would use Rego)
    const condition = rule.condition;

    try {
      // Create evaluation context
      const evalContext = {
        subject: this.parseSubject(context.subject),
        resource: this.parseResource(context.resource),
        action: context.action,
        environment: context.environment || {},
      };

      // Simplified condition evaluation
      // TODO: Replace with actual OPA/Rego evaluation
      return this.evaluateCondition(condition, evalContext);
    } catch (err) {
      logger.error({ rule: rule.id, err }, 'Rule evaluation error');
      return false;
    }
  }

  /**
   * Simplified condition evaluation
   */
  private evaluateCondition(condition: string, context: any): boolean {
    // Very simplified - just check for basic patterns
    // In production, use OPA's Rego engine

    // Example: "subject.role == 'admin'"
    if (condition.includes('==')) {
      const [left, right] = condition.split('==').map((s) => s.trim());
      const leftValue = this.resolveValue(left, context);
      const rightValue = right.replace(/['"]/g, '');
      return leftValue === rightValue;
    }

    // Example: "resource.domain in data.allowed_domains"
    if (condition.includes(' in ')) {
      const [left, right] = condition.split(' in ').map((s) => s.trim());
      const leftValue = this.resolveValue(left, context);
      const rightArray = this.resolveValue(right, context);
      return Array.isArray(rightArray) && rightArray.includes(leftValue);
    }

    // Example: "contains(resource.command, 'rm -rf')"
    if (condition.startsWith('contains(')) {
      const match = condition.match(/contains\((.+),\s*["'](.+)["']\)/);
      if (match) {
        const str = this.resolveValue(match[1], context);
        const substr = match[2];
        return typeof str === 'string' && str.includes(substr);
      }
    }

    // Example: "resource.path startsWith '/home/sandbox'"
    if (condition.includes('startsWith')) {
      const match = condition.match(/(.+)\s+startsWith\s+["'](.+)["']/);
      if (match) {
        const str = this.resolveValue(match[1].trim(), context);
        const prefix = match[2];
        return typeof str === 'string' && str.startsWith(prefix);
      }
    }

    // "true" condition
    if (condition.trim() === 'true') {
      return true;
    }

    return false;
  }

  /**
   * Resolve value from context
   */
  private resolveValue(path: string, context: any): any {
    const parts = path.split('.');
    let value = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Parse subject from string
   */
  private parseSubject(subject: string): any {
    // Format: "role:admin" or "user:123" or JSON
    if (subject.startsWith('{')) {
      return JSON.parse(subject);
    }

    const [type, value] = subject.split(':');
    return { type, [type]: value };
  }

  /**
   * Parse resource from string
   */
  private parseResource(resource: string): any {
    // Format: "domain:example.com" or JSON
    if (resource.startsWith('{')) {
      return JSON.parse(resource);
    }

    const [type, value] = resource.split(':', 2);
    return { type, [type]: value };
  }

  /**
   * Log policy violation
   */
  private async logViolation(
    context: PolicyContext,
    decision: PolicyDecision
  ): Promise<void> {
    try {
      await this.db.query(
        `
        INSERT INTO policy_violations (
          action, resource, subject, decision, timestamp, environment
        ) VALUES ($1, $2, $3, $4, NOW(), $5)
      `,
        [
          context.action,
          context.resource,
          context.subject,
          JSON.stringify(decision),
          JSON.stringify(context.environment || {}),
        ]
      );

      logger.warn({ context, decision }, 'Policy violation logged');
    } catch (err) {
      logger.error({ err }, 'Failed to log violation');
    }
  }

  /**
   * Register new policy
   */
  async registerPolicy(policy: Policy): Promise<void> {
    this.policies.set(policy.id, policy);

    // Store in database
    await this.db.query(
      `
      INSERT INTO runtime_policies (id, name, description, category, enabled, rules)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = $2,
        description = $3,
        category = $4,
        enabled = $5,
        rules = $6
    `,
      [
        policy.id,
        policy.name,
        policy.description,
        policy.category,
        policy.enabled,
        JSON.stringify(policy.rules),
      ]
    );

    logger.info({ policyId: policy.id }, 'Policy registered');
  }

  /**
   * Enable/disable policy
   */
  async setPolicyEnabled(policyId: string, enabled: boolean): Promise<void> {
    const policy = this.policies.get(policyId);
    if (policy) {
      policy.enabled = enabled;

      await this.db.query(
        `UPDATE runtime_policies SET enabled = $1 WHERE id = $2`,
        [enabled, policyId]
      );

      logger.info({ policyId, enabled }, 'Policy updated');
    }
  }

  /**
   * Get violation statistics
   */
  async getStats(days: number = 7): Promise<{
    totalViolations: number;
    byAction: Record<string, number>;
    byPolicy: Record<string, number>;
  }> {
    const result = await this.db.query(
      `
      SELECT
        COUNT(*) as total,
        action,
        COUNT(*) as count
      FROM policy_violations
      WHERE timestamp > NOW() - INTERVAL '${days} days'
      GROUP BY action
    `
    );

    const byAction: Record<string, number> = {};
    for (const row of result.rows) {
      byAction[row.action] = parseInt(row.count);
    }

    return {
      totalViolations: result.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      byAction,
      byPolicy: {}, // TODO: Track by policy ID
    };
  }
}

// ============================================================================
// Database Migration
// ============================================================================

export const RUNTIME_POLICY_MIGRATION = `
-- Runtime policies table
CREATE TABLE IF NOT EXISTS runtime_policies (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_policies_category ON runtime_policies(category);
CREATE INDEX IF NOT EXISTS idx_policies_enabled ON runtime_policies(enabled);

COMMENT ON TABLE runtime_policies IS 'OPA-style runtime policy definitions';

-- Policy violations log
CREATE TABLE IF NOT EXISTS policy_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action VARCHAR(100) NOT NULL,
  resource TEXT NOT NULL,
  subject TEXT NOT NULL,
  decision JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  environment JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_violations_timestamp ON policy_violations(timestamp);
CREATE INDEX IF NOT EXISTS idx_violations_action ON policy_violations(action);

COMMENT ON TABLE policy_violations IS 'Runtime policy violation audit log';
`;

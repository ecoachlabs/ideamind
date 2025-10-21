/**
 * Design Critic Agent
 *
 * Adversarial design review agent that critiques PRDs, APIs, architectures,
 * and UI designs for UX, accessibility, performance, scalability, and security issues.
 *
 * Acts as a "red team" for design quality, finding issues before they reach production.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'design-critic' });

export interface DesignIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'ux' | 'accessibility' | 'performance' | 'scalability' | 'security' | 'maintainability' | 'testability';
  title: string;
  description: string;
  location: string;
  suggestion: string;
  impactArea?: string;
  effortEstimate?: 'trivial' | 'small' | 'medium' | 'large' | 'xlarge';
}

export interface DesignReview {
  reviewId: string;
  artifactId: string;
  artifactType: 'prd' | 'api' | 'architecture' | 'ui' | 'database';
  issues: DesignIssue[];
  scores: {
    overall: number;
    ux: number;
    accessibility: number;
    performance: number;
    scalability: number;
    security: number;
  };
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  reviewedAt: Date;
}

export interface DesignCriticConfig {
  strictMode?: boolean; // More aggressive critique
  focusAreas?: string[]; // Focus on specific categories
  minScore?: number; // Minimum acceptable score (0-100)
}

const DEFAULT_CONFIG: DesignCriticConfig = {
  strictMode: false,
  focusAreas: ['ux', 'accessibility', 'performance', 'scalability', 'security'],
  minScore: 70,
};

export class DesignCriticAgent extends EventEmitter {
  private config: DesignCriticConfig;

  constructor(
    private pool: Pool,
    config: Partial<DesignCriticConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Review a PRD (Product Requirements Document)
   */
  async reviewPRD(prd: string, artifactId: string, runId?: string): Promise<DesignReview> {
    logger.info({ artifactId, runId }, 'Reviewing PRD');

    const issues: DesignIssue[] = [];

    // UX Analysis
    issues.push(...this.analyzePRDForUX(prd));

    // Accessibility Analysis
    issues.push(...this.analyzePRDForAccessibility(prd));

    // Performance Analysis
    issues.push(...this.analyzePRDForPerformance(prd));

    // Scalability Analysis
    issues.push(...this.analyzePRDForScalability(prd));

    // Security Analysis
    issues.push(...this.analyzePRDForSecurity(prd));

    // Calculate scores
    const scores = this.calculateScores(issues, prd);

    // Count issues by severity
    const counts = {
      critical: issues.filter((i) => i.severity === 'critical').length,
      high: issues.filter((i) => i.severity === 'high').length,
      medium: issues.filter((i) => i.severity === 'medium').length,
      low: issues.filter((i) => i.severity === 'low').length,
      info: issues.filter((i) => i.severity === 'info').length,
    };

    const review: DesignReview = {
      reviewId: `review-${Date.now()}`,
      artifactId,
      artifactType: 'prd',
      issues,
      scores,
      counts,
      reviewedAt: new Date(),
    };

    // Store review in database
    await this.storeReview(review, runId);

    // Emit event
    this.emit('review-complete', review);

    logger.info(
      {
        artifactId,
        overallScore: scores.overall,
        issueCount: issues.length,
        criticalCount: counts.critical,
      },
      'PRD review complete'
    );

    return review;
  }

  /**
   * Analyze PRD for UX issues
   */
  private analyzePRDForUX(prd: string): DesignIssue[] {
    const issues: DesignIssue[] = [];

    // Check for user personas
    if (!prd.match(/persona|user type|target user/i)) {
      issues.push({
        severity: 'high',
        category: 'ux',
        title: 'Missing User Personas',
        description: 'PRD does not define user personas or target users',
        location: 'User Research Section',
        suggestion: 'Add detailed user personas with demographics, goals, and pain points',
        impactArea: 'User Understanding',
        effortEstimate: 'medium',
      });
    }

    // Check for user flows
    if (!prd.match(/user flow|user journey|workflow/i)) {
      issues.push({
        severity: 'medium',
        category: 'ux',
        title: 'Missing User Flows',
        description: 'No user flows or journeys documented',
        location: 'UX Section',
        suggestion: 'Document primary user flows with diagrams',
        impactArea: 'User Experience',
        effortEstimate: 'medium',
      });
    }

    // Check for error handling UX
    if (!prd.match(/error (message|handling|state)|validation/i)) {
      issues.push({
        severity: 'medium',
        category: 'ux',
        title: 'Missing Error Handling UX',
        description: 'Error states and messages not specified',
        location: 'Error Handling Section',
        suggestion: 'Define error messages, retry mechanisms, and fallback states',
        impactArea: 'Error Recovery',
        effortEstimate: 'small',
      });
    }

    // Check for loading states
    if (!prd.match(/loading|spinner|skeleton|placeholder/i)) {
      issues.push({
        severity: 'low',
        category: 'ux',
        title: 'Missing Loading States',
        description: 'Loading states not documented',
        location: 'UI States Section',
        suggestion: 'Specify loading indicators, skeleton screens, or progress bars',
        impactArea: 'Perceived Performance',
        effortEstimate: 'small',
      });
    }

    // Check for mobile experience
    if (!prd.match(/mobile|responsive|touch|gesture/i)) {
      issues.push({
        severity: 'high',
        category: 'ux',
        title: 'Mobile Experience Not Addressed',
        description: 'No mention of mobile or responsive design',
        location: 'Platform Support',
        suggestion: 'Define mobile-first or responsive design requirements',
        impactArea: 'Mobile Users',
        effortEstimate: 'large',
      });
    }

    return issues;
  }

  /**
   * Analyze PRD for accessibility issues
   */
  private analyzePRDForAccessibility(prd: string): DesignIssue[] {
    const issues: DesignIssue[] = [];

    // Check for WCAG compliance
    if (!prd.match(/wcag|accessibility|a11y|aria/i)) {
      issues.push({
        severity: 'critical',
        category: 'accessibility',
        title: 'No Accessibility Requirements',
        description: 'WCAG compliance and accessibility not mentioned',
        location: 'Accessibility Section',
        suggestion: 'Define WCAG 2.1 AA compliance requirements at minimum',
        impactArea: 'Disabled Users',
        effortEstimate: 'large',
      });
    }

    // Check for keyboard navigation
    if (!prd.match(/keyboard (navigation|access|shortcut)/i)) {
      issues.push({
        severity: 'high',
        category: 'accessibility',
        title: 'Keyboard Navigation Not Specified',
        description: 'No keyboard navigation requirements',
        location: 'Accessibility Section',
        suggestion: 'Document keyboard shortcuts and tab order requirements',
        impactArea: 'Keyboard Users',
        effortEstimate: 'medium',
      });
    }

    // Check for screen reader support
    if (!prd.match(/screen reader|voiceover|nvda|jaws/i)) {
      issues.push({
        severity: 'high',
        category: 'accessibility',
        title: 'Screen Reader Support Not Addressed',
        description: 'No screen reader compatibility mentioned',
        location: 'Accessibility Section',
        suggestion: 'Specify ARIA labels, alt text, and semantic HTML requirements',
        impactArea: 'Visually Impaired Users',
        effortEstimate: 'medium',
      });
    }

    // Check for color contrast
    if (!prd.match(/color contrast|contrast ratio/i)) {
      issues.push({
        severity: 'medium',
        category: 'accessibility',
        title: 'Color Contrast Not Mentioned',
        description: 'No color contrast requirements',
        location: 'Visual Design Section',
        suggestion: 'Require 4.5:1 contrast ratio for normal text (WCAG AA)',
        impactArea: 'Low Vision Users',
        effortEstimate: 'small',
      });
    }

    return issues;
  }

  /**
   * Analyze PRD for performance issues
   */
  private analyzePRDForPerformance(prd: string): DesignIssue[] {
    const issues: DesignIssue[] = [];

    // Check for performance budgets
    if (!prd.match(/performance (budget|target)|load time|response time/i)) {
      issues.push({
        severity: 'high',
        category: 'performance',
        title: 'No Performance Budgets',
        description: 'Performance targets and budgets not defined',
        location: 'Performance Section',
        suggestion: 'Define load time, response time, and resource size budgets',
        impactArea: 'User Experience',
        effortEstimate: 'small',
      });
    }

    // Check for caching strategy
    if (!prd.match(/cach(e|ing)|cdn/i)) {
      issues.push({
        severity: 'medium',
        category: 'performance',
        title: 'No Caching Strategy',
        description: 'Caching and CDN strategy not documented',
        location: 'Performance Section',
        suggestion: 'Define caching layers (browser, CDN, server) and TTL policies',
        impactArea: 'Load Times',
        effortEstimate: 'medium',
      });
    }

    // Check for lazy loading
    if (!prd.match(/lazy load|defer|async|code splitting/i)) {
      issues.push({
        severity: 'low',
        category: 'performance',
        title: 'No Lazy Loading Strategy',
        description: 'Lazy loading or code splitting not mentioned',
        location: 'Performance Section',
        suggestion: 'Implement lazy loading for images, routes, and heavy components',
        impactArea: 'Initial Load Time',
        effortEstimate: 'medium',
      });
    }

    return issues;
  }

  /**
   * Analyze PRD for scalability issues
   */
  private analyzePRDForScalability(prd: string): DesignIssue[] {
    const issues: DesignIssue[] = [];

    // Check for scale targets
    if (!prd.match(/scale|concurrent (user|request)|throughput|capacity/i)) {
      issues.push({
        severity: 'high',
        category: 'scalability',
        title: 'No Scale Targets Defined',
        description: 'Expected user volume and throughput not specified',
        location: 'Non-Functional Requirements',
        suggestion: 'Define target concurrent users, requests/sec, and growth projections',
        impactArea: 'System Capacity',
        effortEstimate: 'small',
      });
    }

    // Check for database scaling
    if (!prd.match(/database (scaling|shard|replication|read replica)/i)) {
      issues.push({
        severity: 'medium',
        category: 'scalability',
        title: 'Database Scaling Not Addressed',
        description: 'Database scaling strategy not documented',
        location: 'Data Architecture',
        suggestion: 'Define read replicas, sharding, or partitioning strategy',
        impactArea: 'Data Layer',
        effortEstimate: 'large',
      });
    }

    // Check for rate limiting
    if (!prd.match(/rate limit|throttl(e|ing)|quota/i)) {
      issues.push({
        severity: 'medium',
        category: 'scalability',
        title: 'No Rate Limiting',
        description: 'Rate limiting and quotas not specified',
        location: 'API Design',
        suggestion: 'Implement per-user and per-IP rate limits',
        impactArea: 'API Protection',
        effortEstimate: 'medium',
      });
    }

    return issues;
  }

  /**
   * Analyze PRD for security issues
   */
  private analyzePRDForSecurity(prd: string): DesignIssue[] {
    const issues: DesignIssue[] = [];

    // Check for authentication
    if (!prd.match(/authenticat(ion|e)|login|sign in/i)) {
      issues.push({
        severity: 'critical',
        category: 'security',
        title: 'Authentication Not Specified',
        description: 'User authentication mechanism not defined',
        location: 'Security Section',
        suggestion: 'Define authentication method (OAuth, JWT, etc.) and session management',
        impactArea: 'User Security',
        effortEstimate: 'large',
      });
    }

    // Check for authorization
    if (!prd.match(/authoriz(ation|e)|permission|rbac|access control/i)) {
      issues.push({
        severity: 'critical',
        category: 'security',
        title: 'Authorization Not Defined',
        description: 'Access control and permissions not specified',
        location: 'Security Section',
        suggestion: 'Define role-based access control (RBAC) or attribute-based (ABAC)',
        impactArea: 'Data Protection',
        effortEstimate: 'large',
      });
    }

    // Check for encryption
    if (!prd.match(/encrypt(ion|ed)|tls|https|ssl/i)) {
      issues.push({
        severity: 'critical',
        category: 'security',
        title: 'Encryption Not Addressed',
        description: 'Data encryption requirements not documented',
        location: 'Security Section',
        suggestion: 'Require TLS 1.3 for transit, AES-256 for data at rest',
        impactArea: 'Data Security',
        effortEstimate: 'medium',
      });
    }

    // Check for input validation
    if (!prd.match(/input validation|sanitiz|escap(e|ing)|xss|sql injection/i)) {
      issues.push({
        severity: 'high',
        category: 'security',
        title: 'Input Validation Not Mentioned',
        description: 'Input validation and sanitization not specified',
        location: 'Security Section',
        suggestion: 'Implement strict input validation, sanitization, and output encoding',
        impactArea: 'Injection Attacks',
        effortEstimate: 'medium',
      });
    }

    // Check for audit logging
    if (!prd.match(/audit (log|trail)|security log|access log/i)) {
      issues.push({
        severity: 'high',
        category: 'security',
        title: 'No Audit Logging',
        description: 'Security audit logging not specified',
        location: 'Security Section',
        suggestion: 'Log all authentication, authorization, and sensitive data access',
        impactArea: 'Security Monitoring',
        effortEstimate: 'medium',
      });
    }

    return issues;
  }

  /**
   * Calculate scores for each category
   */
  private calculateScores(issues: DesignIssue[], content: string): DesignReview['scores'] {
    const maxDeductions = {
      critical: 20,
      high: 10,
      medium: 5,
      low: 2,
      info: 0,
    };

    const calculateCategoryScore = (category: DesignIssue['category']): number => {
      const categoryIssues = issues.filter((i) => i.category === category);
      let deductions = 0;

      for (const issue of categoryIssues) {
        deductions += maxDeductions[issue.severity];
      }

      // Start at 100, deduct points for issues
      const score = Math.max(0, 100 - deductions);

      return score;
    };

    const ux = calculateCategoryScore('ux');
    const accessibility = calculateCategoryScore('accessibility');
    const performance = calculateCategoryScore('performance');
    const scalability = calculateCategoryScore('scalability');
    const security = calculateCategoryScore('security');

    // Overall score is weighted average
    const overall = Math.round(
      ux * 0.25 +
      accessibility * 0.20 +
      performance * 0.15 +
      scalability * 0.20 +
      security * 0.20
    );

    return {
      overall,
      ux,
      accessibility,
      performance,
      scalability,
      security,
    };
  }

  /**
   * Store review in database
   */
  private async storeReview(review: DesignReview, runId?: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Insert review
      const reviewResult = await client.query(
        `INSERT INTO design_reviews
         (artifact_id, artifact_type, run_id, overall_score, ux_score, accessibility_score,
          performance_score, scalability_score, security_score, critical_count, high_count,
          medium_count, low_count, status, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          review.artifactId,
          review.artifactType,
          runId || null,
          review.scores.overall,
          review.scores.ux,
          review.scores.accessibility,
          review.scores.performance,
          review.scores.scalability,
          review.scores.security,
          review.counts.critical,
          review.counts.high,
          review.counts.medium,
          review.counts.low,
          'completed',
          review.reviewedAt,
        ]
      );

      const dbReviewId = reviewResult.rows[0].id;

      // Insert issues
      for (const issue of review.issues) {
        await client.query(
          `INSERT INTO design_issues
           (review_id, severity, category, title, description, location, suggestion,
            impact_area, effort_estimate, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            dbReviewId,
            issue.severity,
            issue.category,
            issue.title,
            issue.description,
            issue.location,
            issue.suggestion,
            issue.impactArea || null,
            issue.effortEstimate || null,
            'open',
          ]
        );
      }

      await client.query('COMMIT');

      logger.debug({ reviewId: dbReviewId, issueCount: review.issues.length }, 'Review stored in database');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Failed to store review in database');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get review summary for a run
   */
  async getRunReviewSummary(runId: string): Promise<{
    totalReviews: number;
    avgScore: number;
    totalCritical: number;
    totalHigh: number;
    totalMedium: number;
    totalLow: number;
  }> {
    const result = await this.pool.query(
      'SELECT * FROM get_design_review_summary($1)',
      [runId]
    );

    if (result.rows.length === 0) {
      return {
        totalReviews: 0,
        avgScore: 0,
        totalCritical: 0,
        totalHigh: 0,
        totalMedium: 0,
        totalLow: 0,
      };
    }

    return {
      totalReviews: parseInt(result.rows[0].total_reviews) || 0,
      avgScore: parseFloat(result.rows[0].avg_score) || 0,
      totalCritical: parseInt(result.rows[0].total_critical) || 0,
      totalHigh: parseInt(result.rows[0].total_high) || 0,
      totalMedium: parseInt(result.rows[0].total_medium) || 0,
      totalLow: parseInt(result.rows[0].total_low) || 0,
    };
  }

  /**
   * Get recent reviews
   */
  async getRecentReviews(limit: number = 10): Promise<any[]> {
    const result = await this.pool.query(
      'SELECT * FROM v_recent_design_reviews LIMIT $1',
      [limit]
    );

    return result.rows;
  }

  /**
   * Legacy compatibility method
   */
  async scoreDesign(prd: string): Promise<number> {
    // Quick score without full review
    const issues: DesignIssue[] = [];
    issues.push(...this.analyzePRDForUX(prd));
    issues.push(...this.analyzePRDForAccessibility(prd));
    issues.push(...this.analyzePRDForPerformance(prd));
    issues.push(...this.analyzePRDForScalability(prd));
    issues.push(...this.analyzePRDForSecurity(prd));

    const scores = this.calculateScores(issues, prd);
    return scores.overall;
  }
}

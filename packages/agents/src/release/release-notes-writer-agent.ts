import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Release Note Item
 */
interface ReleaseNoteItem {
  id: string;
  category: 'feature' | 'improvement' | 'bugfix' | 'security' | 'breaking' | 'deprecated';
  title: string;
  description: string;
  userImpact: 'high' | 'medium' | 'low';
  technicalDetails?: string;
  linkedIssues?: string[];
  pullRequests?: string[];
}

/**
 * Breaking Change
 */
interface BreakingChange {
  id: string;
  title: string;
  description: string;
  impact: string;
  migrationPath: string;
  codeExample?: {
    before: string;
    after: string;
  };
  affectedUsers: string;
}

/**
 * Migration Guide
 */
interface MigrationGuide {
  fromVersion: string;
  toVersion: string;
  estimatedTime: number; // minutes
  difficulty: 'easy' | 'moderate' | 'complex';
  steps: {
    step: number;
    title: string;
    description: string;
    commands?: string[];
    warnings?: string[];
  }[];
  rollbackInstructions: string[];
  commonIssues: {
    issue: string;
    solution: string;
  }[];
}

/**
 * API Changes
 */
interface APIChanges {
  added: {
    endpoint: string;
    method: string;
    description: string;
    example?: string;
  }[];
  modified: {
    endpoint: string;
    changes: string[];
    backwardCompatible: boolean;
  }[];
  deprecated: {
    endpoint: string;
    replacement?: string;
    removalVersion?: string;
  }[];
  removed: {
    endpoint: string;
    removedIn: string;
  }[];
}

/**
 * Dependency Updates
 */
interface DependencyUpdates {
  major: {
    name: string;
    from: string;
    to: string;
    breaking: boolean;
    notes?: string;
  }[];
  minor: {
    name: string;
    from: string;
    to: string;
  }[];
  security: {
    name: string;
    vulnerability: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    fixedIn: string;
  }[];
}

/**
 * Known Issues
 */
interface KnownIssue {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  workaround?: string;
  plannedFix?: string;
  affectedPlatforms?: string[];
}

/**
 * Performance Improvements
 */
interface PerformanceImprovement {
  area: string;
  description: string;
  benchmark: {
    before: string;
    after: string;
    improvement: string;
  };
  impact: 'high' | 'medium' | 'low';
}

/**
 * Security Updates
 */
interface SecurityUpdate {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  cve?: string;
  affectedVersions: string;
  fixedIn: string;
  creditedTo?: string;
}

/**
 * Release Documentation
 */
interface ReleaseDocumentation {
  gettingStarted: string;
  upgradeGuide: string;
  changelog: string;
  knownIssues: string;
  apiReference?: string;
  troubleshooting: string;
}

/**
 * Release Notes
 */
interface ReleaseNotes {
  version: string;
  releaseDate: string;
  codename?: string;
  summary: {
    totalChanges: number;
    features: number;
    improvements: number;
    bugfixes: number;
    breakingChanges: number;
    securityFixes: number;
  };
  highlights: string[];
  changes: ReleaseNoteItem[];
  breakingChanges: BreakingChange[];
  migrationGuide?: MigrationGuide;
  apiChanges?: APIChanges;
  dependencies: DependencyUpdates;
  performance: PerformanceImprovement[];
  security: SecurityUpdate[];
  knownIssues: KnownIssue[];
  deprecations: {
    feature: string;
    reason: string;
    replacement?: string;
    removalPlanned: string;
  }[];
  documentation: ReleaseDocumentation;
  contributors: {
    name: string;
    contributions: number;
    type: 'code' | 'docs' | 'design' | 'testing';
  }[];
  thankYou: string;
  nextSteps: string[];
  supportChannels: {
    type: 'community' | 'documentation' | 'support' | 'issues';
    name: string;
    url: string;
  }[];
}

/**
 * ReleaseNotesWriterAgent
 *
 * Generates comprehensive release documentation including:
 * - Release notes with categorized changes (features, improvements, bugfixes)
 * - Breaking changes with migration paths
 * - Upgrade guides with step-by-step instructions
 * - API change documentation
 * - Dependency updates and security fixes
 * - Performance improvements with benchmarks
 * - Known issues and workarounds
 * - Changelog in multiple formats (Markdown, HTML, JSON)
 * - Migration guides for major version upgrades
 * - User-facing documentation
 * - Developer-facing technical details
 *
 * Provides clear, actionable documentation for smooth releases.
 *
 * Input: Story loop complete + Code review + QA reports + Packaging
 * Output: Complete release notes and documentation
 */
export class ReleaseNotesWriterAgent extends BaseAgent {
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
        'Analyze implemented features and changes',
        'Identify breaking changes and migration needs',
        'Generate user-facing release notes',
        'Create technical documentation and guides',
      ],
      estimatedTotalDurationMs: 13000, // ~13 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildReleaseNotesPrompt(input);

      this.logger.info('Invoking LLM for release notes generation');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const releaseNotes = this.parseReleaseNotes(content);

      return {
        reasoning: `Release notes generated for v${releaseNotes.version} with ${releaseNotes.summary.totalChanges} changes (${releaseNotes.summary.features} features, ${releaseNotes.summary.improvements} improvements, ${releaseNotes.summary.bugfixes} bugfixes). ${releaseNotes.summary.breakingChanges} breaking changes documented.`,
        confidence: 0.89,
        intermediate: {
          releaseNotes,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for release notes', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const releaseNotes = result.intermediate?.releaseNotes;

    return [
      {
        type: 'release-notes',
        content: releaseNotes,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildReleaseNotesPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const storyLoopComplete = previousArtifacts?.find((a: any) => a.type === 'story-loop-complete')?.content;
    const codeReview = previousArtifacts?.find((a: any) => a.type === 'code-review')?.content;
    const qaComplete = previousArtifacts?.find((a: any) => a.type === 'qa-complete')?.content;
    const packagingReport = previousArtifacts?.find((a: any) => a.type === 'packaging-report')?.content;

    const projectTitle = ideaSpec?.title || 'Project';
    const totalStories = storyLoopComplete?.summary?.totalStories || 0;
    const totalFiles = storyLoopComplete?.summary?.totalFiles || 0;

    return `You are a Technical Writer and Release Manager specializing in clear, user-friendly documentation.

PROJECT CONTEXT:
Project: ${projectTitle}
Total User Stories Implemented: ${totalStories}
Total Files: ${totalFiles}
Package Version: ${packagingReport?.packages?.[0]?.version || '1.0.0'}

IMPLEMENTED FEATURES:
${storyLoopComplete?.stories?.slice(0, 5).map((s: any) => `- ${s.title}: ${s.description}`).join('\n') || 'Various features implemented'}

TASK:
Generate comprehensive release notes and documentation. Your response MUST be valid JSON:

{
  "version": "1.0.0",
  "releaseDate": "2025-01-15",
  "codename": "Phoenix",
  "summary": {
    "totalChanges": 45,
    "features": 12,
    "improvements": 18,
    "bugfixes": 13,
    "breakingChanges": 2,
    "securityFixes": 3
  },
  "highlights": [
    "🚀 New real-time collaboration features with WebSocket support",
    "⚡ 3x performance improvement in data processing",
    "🔒 Enhanced security with OAuth 2.0 and JWT authentication",
    "📱 Mobile-responsive design across all screens",
    "♿ WCAG 2.1 AA accessibility compliance"
  ],
  "changes": [
    {
      "id": "feat-001",
      "category": "feature",
      "title": "Real-time collaboration",
      "description": "Added real-time collaboration features allowing multiple users to work simultaneously on documents with instant updates",
      "userImpact": "high",
      "technicalDetails": "Implemented WebSocket server using Socket.io for bi-directional communication",
      "linkedIssues": ["#123", "#145"],
      "pullRequests": ["#234"]
    },
    {
      "id": "improve-001",
      "category": "improvement",
      "title": "Faster data processing",
      "description": "Optimized database queries reducing page load time by 65%",
      "userImpact": "high",
      "technicalDetails": "Added database indexing, implemented query caching with Redis"
    },
    {
      "id": "fix-001",
      "category": "bugfix",
      "title": "Fixed authentication timeout",
      "description": "Resolved issue where users were logged out unexpectedly after 15 minutes",
      "userImpact": "medium",
      "linkedIssues": ["#198"]
    },
    {
      "id": "sec-001",
      "category": "security",
      "title": "Fixed XSS vulnerability",
      "description": "Patched cross-site scripting vulnerability in comment input fields",
      "userImpact": "high",
      "technicalDetails": "Implemented DOMPurify for HTML sanitization"
    }
  ],
  "breakingChanges": [
    {
      "id": "breaking-001",
      "title": "API authentication now requires OAuth 2.0",
      "description": "The legacy API key authentication has been removed. All API requests must now use OAuth 2.0 tokens.",
      "impact": "All API integrations need to be updated to use OAuth 2.0 flow",
      "migrationPath": "1. Register your app in Developer Portal\\n2. Implement OAuth 2.0 authorization flow\\n3. Replace API keys with access tokens in requests",
      "codeExample": {
        "before": "headers: { 'X-API-Key': 'your-api-key' }",
        "after": "headers: { 'Authorization': 'Bearer your-oauth-token' }"
      },
      "affectedUsers": "Developers using REST API"
    },
    {
      "id": "breaking-002",
      "title": "Minimum Node.js version increased to 18",
      "description": "Node.js 16 and earlier are no longer supported",
      "impact": "Developers must upgrade to Node.js 18 or later",
      "migrationPath": "1. Install Node.js 18+ from nodejs.org\\n2. Update CI/CD pipelines to use Node 18\\n3. Test your application",
      "affectedUsers": "Developers and DevOps teams"
    }
  ],
  "migrationGuide": {
    "fromVersion": "0.9.x",
    "toVersion": "1.0.0",
    "estimatedTime": 30,
    "difficulty": "moderate",
    "steps": [
      {
        "step": 1,
        "title": "Backup your data",
        "description": "Create a complete backup of your database and configuration files",
        "commands": ["npm run backup"],
        "warnings": ["Ensure backup completes successfully before proceeding"]
      },
      {
        "step": 2,
        "title": "Update dependencies",
        "description": "Update to the latest version using your package manager",
        "commands": ["npm install @company/app@1.0.0", "npm install"],
        "warnings": []
      },
      {
        "step": 3,
        "title": "Run database migrations",
        "description": "Apply database schema changes",
        "commands": ["npm run migrate"],
        "warnings": ["This may take 5-10 minutes for large databases"]
      },
      {
        "step": 4,
        "title": "Update API authentication",
        "description": "Migrate from API keys to OAuth 2.0 tokens (see breaking changes)",
        "commands": [],
        "warnings": ["Test authentication in development first"]
      },
      {
        "step": 5,
        "title": "Test and verify",
        "description": "Run tests and verify application functionality",
        "commands": ["npm test", "npm run e2e"],
        "warnings": []
      }
    ],
    "rollbackInstructions": [
      "npm install @company/app@0.9.12",
      "Restore database from backup",
      "Restart application server"
    ],
    "commonIssues": [
      {
        "issue": "Database migration fails with 'column already exists'",
        "solution": "This indicates a partial migration. Run 'npm run migrate:reset' and try again"
      },
      {
        "issue": "OAuth tokens not working",
        "solution": "Ensure you've registered your app in Developer Portal and using correct client ID/secret"
      }
    ]
  },
  "apiChanges": {
    "added": [
      {
        "endpoint": "/api/v1/collaborate",
        "method": "POST",
        "description": "Start a real-time collaboration session",
        "example": "POST /api/v1/collaborate { \\"documentId\\": \\"123\\" }"
      }
    ],
    "modified": [
      {
        "endpoint": "/api/v1/auth",
        "changes": ["Now requires OAuth 2.0 instead of API keys"],
        "backwardCompatible": false
      }
    ],
    "deprecated": [
      {
        "endpoint": "/api/v1/legacy/users",
        "replacement": "/api/v2/users",
        "removalVersion": "2.0.0"
      }
    ],
    "removed": [
      {
        "endpoint": "/api/v1/auth/apikey",
        "removedIn": "1.0.0"
      }
    ]
  },
  "dependencies": {
    "major": [
      {
        "name": "react",
        "from": "17.0.2",
        "to": "18.2.0",
        "breaking": true,
        "notes": "See React 18 upgrade guide for concurrent features"
      }
    ],
    "minor": [
      {
        "name": "axios",
        "from": "1.4.0",
        "to": "1.6.2"
      }
    ],
    "security": [
      {
        "name": "express",
        "vulnerability": "CVE-2024-12345 - Prototype pollution",
        "severity": "high",
        "fixedIn": "4.18.3"
      }
    ]
  },
  "performance": [
    {
      "area": "Database queries",
      "description": "Optimized N+1 queries with eager loading and indexing",
      "benchmark": {
        "before": "850ms average response time",
        "after": "120ms average response time",
        "improvement": "85% faster"
      },
      "impact": "high"
    },
    {
      "area": "Bundle size",
      "description": "Reduced JavaScript bundle size through code splitting and tree shaking",
      "benchmark": {
        "before": "1.2MB gzipped",
        "after": "450KB gzipped",
        "improvement": "62% smaller"
      },
      "impact": "high"
    }
  ],
  "security": [
    {
      "id": "sec-001",
      "severity": "high",
      "title": "Fixed XSS vulnerability in comment system",
      "description": "Resolved cross-site scripting vulnerability that could allow malicious scripts in user comments",
      "cve": "CVE-2024-54321",
      "affectedVersions": "< 1.0.0",
      "fixedIn": "1.0.0",
      "creditedTo": "Security researcher Jane Doe"
    }
  ],
  "knownIssues": [
    {
      "id": "issue-001",
      "title": "Collaboration may disconnect on slow networks",
      "description": "WebSocket connection may timeout on networks with >500ms latency",
      "severity": "minor",
      "workaround": "Refresh page to reconnect",
      "plannedFix": "1.1.0",
      "affectedPlatforms": ["Web"]
    }
  ],
  "deprecations": [
    {
      "feature": "Legacy API v1 endpoints",
      "reason": "Replaced with more efficient v2 API",
      "replacement": "/api/v2/*",
      "removalPlanned": "2.0.0 (Q3 2025)"
    }
  ],
  "documentation": {
    "gettingStarted": "https://docs.example.com/getting-started",
    "upgradeGuide": "https://docs.example.com/upgrade-to-1.0",
    "changelog": "https://github.com/example/app/blob/main/CHANGELOG.md",
    "knownIssues": "https://github.com/example/app/issues",
    "apiReference": "https://docs.example.com/api",
    "troubleshooting": "https://docs.example.com/troubleshooting"
  },
  "contributors": [
    {"name": "Alice Developer", "contributions": 45, "type": "code"},
    {"name": "Bob Designer", "contributions": 12, "type": "design"},
    {"name": "Carol Tester", "contributions": 23, "type": "testing"}
  ],
  "thankYou": "Thank you to all our contributors, early adopters, and the community for making this release possible!",
  "nextSteps": [
    "Read the upgrade guide before migrating",
    "Test in a staging environment first",
    "Join our Discord for migration support",
    "Report any issues on GitHub"
  ],
  "supportChannels": [
    {
      "type": "documentation",
      "name": "Documentation",
      "url": "https://docs.example.com"
    },
    {
      "type": "community",
      "name": "Discord Community",
      "url": "https://discord.gg/example"
    },
    {
      "type": "issues",
      "name": "GitHub Issues",
      "url": "https://github.com/example/app/issues"
    },
    {
      "type": "support",
      "name": "Enterprise Support",
      "url": "https://example.com/support"
    }
  ]
}

REQUIREMENTS:
- Generate release notes for version ${packagingReport?.packages?.[0]?.version || '1.0.0'}
- Include 8-15 notable changes across all categories
- Provide 3-5 key highlights in engaging, emoji-enhanced format
- Document all breaking changes with migration paths
- Include code examples for breaking changes
- Provide step-by-step migration guide if breaking changes exist
- List performance improvements with benchmarks
- Document security fixes without exposing vulnerabilities
- Include known issues with workarounds
- Provide clear next steps for users
- Make user-facing content friendly and actionable
- Make technical details comprehensive for developers

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseReleaseNotes(text: string): ReleaseNotes {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as ReleaseNotes;
    } catch (error) {
      this.logger.error('Failed to parse release notes', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback release notes');

    const releaseNotes: ReleaseNotes = {
      version: '1.0.0',
      releaseDate: new Date().toISOString().split('T')[0],
      summary: {
        totalChanges: 10,
        features: 5,
        improvements: 3,
        bugfixes: 2,
        breakingChanges: 0,
        securityFixes: 0,
      },
      highlights: [
        'Initial release',
        'Core features implemented',
      ],
      changes: [
        {
          id: 'feat-001',
          category: 'feature',
          title: 'Initial release',
          description: 'First version of the application',
          userImpact: 'high',
        },
      ],
      breakingChanges: [],
      dependencies: {
        major: [],
        minor: [],
        security: [],
      },
      performance: [],
      security: [],
      knownIssues: [],
      deprecations: [],
      documentation: {
        gettingStarted: 'See documentation',
        upgradeGuide: 'N/A - initial release',
        changelog: 'See CHANGELOG.md',
        knownIssues: 'None',
        troubleshooting: 'See documentation',
      },
      contributors: [],
      thankYou: 'Thank you for using our application!',
      nextSteps: [
        'Read the documentation',
        'Get started with the app',
      ],
      supportChannels: [],
    };

    return {
      reasoning: 'Using fallback release notes as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        releaseNotes,
      },
    };
  }
}

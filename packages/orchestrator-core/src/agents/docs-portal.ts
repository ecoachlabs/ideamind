/**
 * Docs Portal Agent
 *
 * Generates comprehensive documentation portals from run artifacts,
 * including API references, quickstarts, tutorials, and SDK examples.
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'docs-portal' });

export interface PortalSpec {
  apiDocs: string;
  sdks: SDK[];
  quickstarts: string[];
}

export interface SDK {
  language: string;
  packageName: string;
  version: string;
  installCommand: string;
  exampleCode: string;
}

export interface DocumentationPortal {
  id?: string;
  runId: string;
  tenantId?: string;
  portalName: string;
  portalUrl?: string;
  portalVersion: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  apiDocsCount: number;
  guideCount: number;
  exampleCount: number;
  sdkCount: number;
  completenessScore?: number;
  clarityScore?: number;
  generatedAt?: Date;
}

export interface DocumentationSection {
  portalId: string;
  sectionType: 'api' | 'guide' | 'tutorial' | 'reference' | 'example' | 'sdk' | 'quickstart';
  sectionTitle: string;
  sectionSlug: string;
  content: string;
  contentFormat: 'markdown' | 'html' | 'asciidoc' | 'rst';
  displayOrder: number;
  parentSectionId?: string;
  tags?: Record<string, string>;
}

export interface APIEndpoint {
  method: string;
  path: string;
  description: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
}

export interface PortalConfig {
  includeAPI?: boolean;
  includeGuides?: boolean;
  includeTutorials?: boolean;
  includeSDKs?: boolean;
  languages?: string[];
  theme?: 'default' | 'minimal' | 'detailed';
}

const DEFAULT_CONFIG: PortalConfig = {
  includeAPI: true,
  includeGuides: true,
  includeTutorials: true,
  includeSDKs: true,
  languages: ['typescript', 'python', 'go', 'java'],
  theme: 'default',
};

export class DocsPortalAgent extends EventEmitter {
  constructor(
    private pool: Pool,
    private config: PortalConfig = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate documentation portal for a run
   */
  async generatePortal(runId: string, tenantId?: string): Promise<DocumentationPortal> {
    logger.info({ runId, tenantId }, 'Generating documentation portal');

    // Create portal record
    const portal: DocumentationPortal = {
      runId,
      tenantId,
      portalName: `Documentation - Run ${runId}`,
      portalVersion: '1.0.0',
      status: 'generating',
      apiDocsCount: 0,
      guideCount: 0,
      exampleCount: 0,
      sdkCount: 0,
    };

    // Store in database
    const result = await this.pool.query(
      `INSERT INTO documentation_portals
       (run_id, tenant_id, portal_name, portal_version, status, generation_started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [portal.runId, portal.tenantId || null, portal.portalName, portal.portalVersion, portal.status]
    );

    const portalId = result.rows[0].id;
    portal.id = portalId;

    try {
      // Get artifacts from run
      const artifacts = await this.getRunArtifacts(runId);

      const sections: DocumentationSection[] = [];

      // Generate API reference if enabled
      if (this.config.includeAPI) {
        const apiSections = await this.generateAPIReference(artifacts, portalId);
        sections.push(...apiSections);
        portal.apiDocsCount = apiSections.length;
      }

      // Generate quickstart guide
      if (this.config.includeGuides) {
        const quickstart = await this.generateQuickstart(runId, portalId);
        sections.push(quickstart);
        portal.guideCount = 1;
      }

      // Generate tutorials if enabled
      if (this.config.includeTutorials) {
        const tutorials = await this.generateTutorials(artifacts, portalId);
        sections.push(...tutorials);
        portal.exampleCount = tutorials.length;
      }

      // Generate SDK examples if enabled
      if (this.config.includeSDKs) {
        const sdkSections = await this.generateSDKDocs(artifacts, portalId);
        sections.push(...sdkSections);
        portal.sdkCount = sdkSections.filter(s => s.sectionType === 'sdk').length;
      }

      // Store all sections
      for (const section of sections) {
        await this.storeSection(section);
      }

      // Calculate quality scores
      const completeness = this.scoreCompleteness(portal, sections);
      const clarity = this.scoreClarity(sections);

      // Update portal status
      await this.pool.query(
        `UPDATE documentation_portals
         SET status = $1,
             api_docs_count = $2,
             guide_count = $3,
             example_count = $4,
             sdk_count = $5,
             completeness_score = $6,
             clarity_score = $7,
             generation_completed_at = NOW()
         WHERE id = $8`,
        ['completed', portal.apiDocsCount, portal.guideCount, portal.exampleCount,
         portal.sdkCount, completeness, clarity, portalId]
      );

      portal.status = 'completed';
      portal.completenessScore = completeness;
      portal.clarityScore = clarity;

      this.emit('portal-generated', portal);

      logger.info(
        {
          portalId,
          runId,
          sections: sections.length,
          completeness: completeness.toFixed(2),
          clarity: clarity.toFixed(2),
        },
        'Documentation portal generated'
      );

      return portal;
    } catch (err) {
      logger.error({ err, runId }, 'Failed to generate portal');

      await this.pool.query(
        `UPDATE documentation_portals SET status = $1 WHERE id = $2`,
        ['failed', portalId]
      );

      portal.status = 'failed';
      throw err;
    }
  }

  /**
   * Get artifacts from a run
   */
  private async getRunArtifacts(runId: string): Promise<any[]> {
    // In real implementation, would query artifacts table
    // For now, return mock data structure
    return [
      {
        type: 'openapi',
        content: {
          paths: {
            '/users': {
              get: { description: 'List users', parameters: [], responses: {} },
              post: { description: 'Create user', requestBody: {}, responses: {} },
            },
            '/users/{id}': {
              get: { description: 'Get user by ID', parameters: [{ name: 'id' }], responses: {} },
            },
          },
        },
      },
      {
        type: 'code',
        language: 'typescript',
        content: 'export async function authenticate(user: User) { ... }',
      },
    ];
  }

  /**
   * Generate API reference documentation
   */
  private async generateAPIReference(
    artifacts: any[],
    portalId: string
  ): Promise<DocumentationSection[]> {
    const sections: DocumentationSection[] = [];
    let displayOrder = 0;

    // Find OpenAPI specs
    const openApiArtifacts = artifacts.filter(a => a.type === 'openapi');

    if (openApiArtifacts.length === 0) {
      // Generate basic API reference from code artifacts
      sections.push({
        portalId,
        sectionType: 'api',
        sectionTitle: 'API Reference',
        sectionSlug: 'api-reference',
        content: this.generateBasicAPIReference(artifacts),
        contentFormat: 'markdown',
        displayOrder: displayOrder++,
      });
    } else {
      // Generate from OpenAPI spec
      for (const spec of openApiArtifacts) {
        const paths = spec.content.paths || {};

        for (const [path, methods] of Object.entries(paths)) {
          for (const [method, details] of Object.entries(methods as any)) {
            sections.push({
              portalId,
              sectionType: 'api',
              sectionTitle: `${method.toUpperCase()} ${path}`,
              sectionSlug: `api-${method}-${path.replace(/\//g, '-')}`,
              content: this.formatAPIEndpoint(method, path, details),
              contentFormat: 'markdown',
              displayOrder: displayOrder++,
            });
          }
        }
      }
    }

    return sections;
  }

  /**
   * Format API endpoint as markdown
   */
  private formatAPIEndpoint(method: string, path: string, details: any): string {
    let md = `# ${method.toUpperCase()} ${path}\n\n`;
    md += `${details.description || 'No description provided.'}\n\n`;

    if (details.parameters && details.parameters.length > 0) {
      md += '## Parameters\n\n';
      for (const param of details.parameters) {
        md += `- **${param.name}** (${param.in || 'query'}): ${param.description || 'No description'}\n`;
      }
      md += '\n';
    }

    if (details.requestBody) {
      md += '## Request Body\n\n';
      md += '```json\n';
      md += JSON.stringify(details.requestBody, null, 2);
      md += '\n```\n\n';
    }

    if (details.responses) {
      md += '## Responses\n\n';
      for (const [code, response] of Object.entries(details.responses as any)) {
        md += `### ${code}\n\n`;
        md += `${response.description || 'No description'}\n\n`;
      }
    }

    return md;
  }

  /**
   * Generate basic API reference from code
   */
  private generateBasicAPIReference(artifacts: any[]): string {
    let md = '# API Reference\n\n';
    md += 'This API reference was automatically generated from code artifacts.\n\n';

    const codeArtifacts = artifacts.filter(a => a.type === 'code');

    if (codeArtifacts.length > 0) {
      md += '## Endpoints\n\n';
      md += '### Authentication\n\n';
      md += '```typescript\n';
      md += 'async function authenticate(user: User): Promise<AuthToken>\n';
      md += '```\n\n';
      md += 'Authenticates a user and returns an authentication token.\n\n';
    } else {
      md += '*No API endpoints found in artifacts.*\n\n';
    }

    return md;
  }

  /**
   * Generate quickstart guide
   */
  private async generateQuickstart(runId: string, portalId: string): Promise<DocumentationSection> {
    const content = `# Quickstart Guide

## Installation

\`\`\`bash
npm install @your-org/sdk
\`\`\`

## Basic Usage

\`\`\`typescript
import { Client } from '@your-org/sdk';

const client = new Client({
  apiKey: process.env.API_KEY
});

// Authenticate
const token = await client.authenticate({
  username: 'user@example.com',
  password: 'password'
});

// Make API calls
const users = await client.users.list();
console.log(users);
\`\`\`

## Next Steps

- [API Reference](./api-reference)
- [Tutorials](./tutorials)
- [SDK Documentation](./sdk)
`;

    return {
      portalId,
      sectionType: 'quickstart',
      sectionTitle: 'Quickstart Guide',
      sectionSlug: 'quickstart',
      content,
      contentFormat: 'markdown',
      displayOrder: 0,
    };
  }

  /**
   * Generate tutorials
   */
  private async generateTutorials(
    artifacts: any[],
    portalId: string
  ): Promise<DocumentationSection[]> {
    const tutorials: DocumentationSection[] = [];

    tutorials.push({
      portalId,
      sectionType: 'tutorial',
      sectionTitle: 'Authentication Tutorial',
      sectionSlug: 'tutorial-authentication',
      content: `# Authentication Tutorial

This tutorial walks through implementing authentication in your application.

## Step 1: Install Dependencies

\`\`\`bash
npm install bcrypt jsonwebtoken
\`\`\`

## Step 2: Create User Model

\`\`\`typescript
interface User {
  id: string;
  email: string;
  passwordHash: string;
}
\`\`\`

## Step 3: Implement Authentication

\`\`\`typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

async function authenticate(email: string, password: string): Promise<string> {
  // Find user
  const user = await findUserByEmail(email);

  // Verify password
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  // Generate token
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
  return token;
}
\`\`\`

## Step 4: Protect Routes

\`\`\`typescript
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.userId = decoded.userId;
  next();
}
\`\`\`
`,
      contentFormat: 'markdown',
      displayOrder: 100,
    });

    return tutorials;
  }

  /**
   * Generate SDK documentation
   */
  private async generateSDKDocs(
    artifacts: any[],
    portalId: string
  ): Promise<DocumentationSection[]> {
    const sections: DocumentationSection[] = [];
    const languages = this.config.languages || ['typescript', 'python'];

    for (let i = 0; i < languages.length; i++) {
      const lang = languages[i];
      sections.push({
        portalId,
        sectionType: 'sdk',
        sectionTitle: `${lang.charAt(0).toUpperCase() + lang.slice(1)} SDK`,
        sectionSlug: `sdk-${lang}`,
        content: this.generateSDKContent(lang),
        contentFormat: 'markdown',
        displayOrder: 200 + i,
      });
    }

    return sections;
  }

  /**
   * Generate SDK content for a language
   */
  private generateSDKContent(language: string): string {
    const sdkExamples: Record<string, string> = {
      typescript: `# TypeScript SDK

## Installation

\`\`\`bash
npm install @your-org/sdk
\`\`\`

## Usage

\`\`\`typescript
import { Client } from '@your-org/sdk';

const client = new Client({ apiKey: 'your-api-key' });

// Example: List users
const users = await client.users.list();

// Example: Create user
const newUser = await client.users.create({
  email: 'user@example.com',
  name: 'John Doe'
});
\`\`\`
`,
      python: `# Python SDK

## Installation

\`\`\`bash
pip install your-org-sdk
\`\`\`

## Usage

\`\`\`python
from your_org import Client

client = Client(api_key='your-api-key')

# Example: List users
users = client.users.list()

# Example: Create user
new_user = client.users.create(
    email='user@example.com',
    name='John Doe'
)
\`\`\`
`,
      go: `# Go SDK

## Installation

\`\`\`bash
go get github.com/your-org/sdk-go
\`\`\`

## Usage

\`\`\`go
package main

import "github.com/your-org/sdk-go"

func main() {
    client := sdk.NewClient("your-api-key")

    // Example: List users
    users, err := client.Users.List()

    // Example: Create user
    newUser, err := client.Users.Create(&sdk.User{
        Email: "user@example.com",
        Name:  "John Doe",
    })
}
\`\`\`
`,
    };

    return sdkExamples[language] || `# ${language} SDK\n\nSDK documentation coming soon.`;
  }

  /**
   * Store documentation section
   */
  private async storeSection(section: DocumentationSection): Promise<void> {
    await this.pool.query(
      `INSERT INTO documentation_sections
       (portal_id, section_type, section_title, section_slug, content,
        content_format, display_order, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        section.portalId,
        section.sectionType,
        section.sectionTitle,
        section.sectionSlug,
        section.content,
        section.contentFormat,
        section.displayOrder,
        JSON.stringify(section.tags || {}),
      ]
    );
  }

  /**
   * Score portal completeness
   */
  private scoreCompleteness(portal: DocumentationPortal, sections: DocumentationSection[]): number {
    let score = 0;

    // Has API docs (30%)
    if (portal.apiDocsCount > 0) score += 0.3;

    // Has quickstart (20%)
    if (sections.some(s => s.sectionType === 'quickstart')) score += 0.2;

    // Has tutorials (20%)
    if (portal.exampleCount > 0) score += 0.2;

    // Has SDK docs (20%)
    if (portal.sdkCount > 0) score += 0.2;

    // Multiple sections (10%)
    if (sections.length >= 5) score += 0.1;

    return Math.round(score * 100) / 100;
  }

  /**
   * Score content clarity
   */
  private scoreClarity(sections: DocumentationSection[]): number {
    let totalScore = 0;

    for (const section of sections) {
      let sectionScore = 1.0;

      // Check for code examples
      if (!section.content.includes('```')) {
        sectionScore -= 0.2;
      }

      // Check for headings
      if (!section.content.includes('#')) {
        sectionScore -= 0.1;
      }

      // Check for minimum length
      if (section.content.length < 100) {
        sectionScore -= 0.3;
      }

      // Check for clear descriptions
      if (section.content.includes('No description')) {
        sectionScore -= 0.2;
      }

      totalScore += Math.max(sectionScore, 0);
    }

    const avgScore = sections.length > 0 ? totalScore / sections.length : 0;
    return Math.round(avgScore * 100) / 100;
  }

  /**
   * Get portal by ID
   */
  async getPortal(portalId: string): Promise<any> {
    const result = await this.pool.query(
      'SELECT * FROM v_documentation_portal_overview WHERE id = $1',
      [portalId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get portal sections
   */
  async getPortalSections(portalId: string): Promise<DocumentationSection[]> {
    const result = await this.pool.query(
      `SELECT * FROM documentation_sections
       WHERE portal_id = $1
       ORDER BY display_order ASC`,
      [portalId]
    );

    return result.rows.map(row => ({
      portalId: row.portal_id,
      sectionType: row.section_type,
      sectionTitle: row.section_title,
      sectionSlug: row.section_slug,
      content: row.content,
      contentFormat: row.content_format,
      displayOrder: row.display_order,
      tags: row.tags,
    }));
  }

  /**
   * Legacy method for backward compatibility
   */
  async generatePortalLegacy(runId: string): Promise<PortalSpec> {
    const portal = await this.generatePortal(runId);
    const sections = await this.getPortalSections(portal.id!);

    const apiSections = sections.filter(s => s.sectionType === 'api');
    const sdkSections = sections.filter(s => s.sectionType === 'sdk');

    return {
      apiDocs: apiSections.map(s => s.content).join('\n\n'),
      sdks: sdkSections.map(s => ({
        language: s.sectionTitle.split(' ')[0].toLowerCase(),
        packageName: '@your-org/sdk',
        version: '1.0.0',
        installCommand: 'npm install @your-org/sdk',
        exampleCode: s.content,
      })),
      quickstarts: sections.filter(s => s.sectionType === 'quickstart').map(s => s.content),
    };
  }
}

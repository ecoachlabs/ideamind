import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Code File
 */
interface CodeFile {
  path: string;
  content: string;
  description: string;
  language: string;
  type: 'source' | 'test' | 'config' | 'documentation';
  linesOfCode: number;
}

/**
 * Implementation Detail
 */
interface ImplementationDetail {
  aspect: 'architecture' | 'api' | 'database' | 'ui' | 'business-logic' | 'validation';
  description: string;
  rationale: string;
  alternatives?: string;
}

/**
 * Code Implementation
 */
interface CodeImplementation {
  userStory: {
    id: string;
    title: string;
    asA: string;
    iWant: string;
    soThat: string;
    acceptanceCriteria: string[];
  };
  files: CodeFile[];
  implementationDetails: ImplementationDetail[];
  dependencies: {
    new: {
      name: string;
      version: string;
      purpose: string;
    }[];
    existing: string[];
  };
  databaseChanges: {
    type: 'migration' | 'seed-data' | 'schema-update';
    description: string;
    files: string[];
  }[];
  apiChanges: {
    type: 'new-endpoint' | 'modified-endpoint' | 'deprecated-endpoint';
    endpoint: string;
    description: string;
  }[];
  testingNotes: string[];
  integrationPoints: string[];
  deploymentNotes: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  completionStatus: 'implemented' | 'partial' | 'blocked';
}

/**
 * StoryCoderAgent
 *
 * Implements user stories by generating actual production code including:
 * - Source code files following project architecture
 * - API endpoints and routes
 * - Database models and migrations
 * - UI components and pages
 * - Business logic and validation
 * - Integration with existing codebase
 * - Configuration updates
 * - Documentation updates
 *
 * The agent follows the architecture, API design, and data model from previous phases
 * to ensure consistency and maintainability.
 *
 * Input: User story + Repository blueprint + Architecture + API design + Data model
 * Output: Complete code implementation for the user story
 */
export class StoryCoderAgent extends BaseAgent {
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
        'Analyze user story and acceptance criteria',
        'Design code structure following architecture',
        'Implement source code files',
        'Create database migrations if needed',
      ],
      estimatedTotalDurationMs: 15000, // ~15 seconds per story
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildImplementationPrompt(input);

      this.logger.info('Invoking LLM for code implementation');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const implementation = this.parseImplementation(content);

      return {
        reasoning: `Implemented user story '${implementation.userStory.title}' with ${implementation.files.length} files, ${implementation.apiChanges.length} API changes, and ${implementation.databaseChanges.length} database changes.`,
        confidence: 0.85,
        intermediate: {
          implementation,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for code implementation', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const implementation = result.intermediate?.implementation;

    return [
      {
        type: 'code-implementation',
        content: implementation,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
          storyId: implementation.userStory.id,
        },
      },
    ];
  }

  private buildImplementationPrompt(input: any): string {
    const { userStory, previousArtifacts } = input;

    // Extract relevant context
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;
    const apiDesign = previousArtifacts?.find((a: any) => a.type === 'api-design')?.content;
    const dataModel = previousArtifacts?.find((a: any) => a.type === 'data-model')?.content;

    const language = repoBlueprint?.overview?.language || 'TypeScript';
    const framework = repoBlueprint?.overview?.framework || 'React';
    const architectureStyle = systemArch?.overview?.architectureStyle || 'monolithic';
    const apiStyle = apiDesign?.overview?.apiStyle || 'REST';

    return `You are a Senior Software Engineer implementing a user story with production-quality code.

USER STORY:
ID: ${userStory.id}
Title: ${userStory.title}
As a: ${userStory.asA}
I want: ${userStory.iWant}
So that: ${userStory.soThat}
Story Points: ${userStory.storyPoints || 'N/A'}

ACCEPTANCE CRITERIA:
${userStory.acceptanceCriteria?.map((ac: string, i: number) => `${i + 1}. ${ac}`).join('\n') || 'None specified'}

PROJECT CONTEXT:
Language: ${language}
Framework: ${framework}
Architecture: ${architectureStyle}
API Style: ${apiStyle}

DIRECTORY STRUCTURE:
${this.summarizeDirectoryStructure(repoBlueprint?.directoryStructure)}

ARCHITECTURE COMPONENTS:
${systemArch?.components?.slice(0, 5).map((c: any) => `- ${c.name} (${c.type}): ${c.description}`).join('\n') || 'None specified'}

API ENDPOINTS (related):
${apiDesign?.resources?.slice(0, 3).map((r: any) => `- ${r.name}: ${r.description}`).join('\n') || 'None specified'}

DATA ENTITIES (related):
${dataModel?.entities?.slice(0, 3).map((e: any) => `- ${e.name}: ${e.description}`).join('\n') || 'None specified'}

TASK:
Implement this user story with production-quality code. Your response MUST be valid JSON matching this structure:

{
  "userStory": {
    "id": "${userStory.id}",
    "title": "${userStory.title}",
    "asA": "${userStory.asA}",
    "iWant": "${userStory.iWant}",
    "soThat": "${userStory.soThat}",
    "acceptanceCriteria": ${JSON.stringify(userStory.acceptanceCriteria || [])}
  },
  "files": [
    {
      "path": "src/components/UserProfile.tsx",
      "content": "import React from 'react';\\n\\nexport const UserProfile = () => {\\n  // Implementation\\n  return <div>User Profile</div>;\\n};",
      "description": "User profile component",
      "language": "TypeScript",
      "type": "source",
      "linesOfCode": 25
    },
    {
      "path": "src/api/users.ts",
      "content": "export const getUserProfile = async (userId: string) => {\\n  // API call\\n};",
      "description": "User API functions",
      "language": "TypeScript",
      "type": "source",
      "linesOfCode": 15
    }
  ],
  "implementationDetails": [
    {
      "aspect": "architecture",
      "description": "Implemented following component-based architecture",
      "rationale": "Maintains separation of concerns and reusability"
    },
    {
      "aspect": "api",
      "description": "Created RESTful endpoint for user profile",
      "rationale": "Follows established API design patterns"
    }
  ],
  "dependencies": {
    "new": [
      {
        "name": "react-query",
        "version": "^4.0.0",
        "purpose": "Data fetching and caching"
      }
    ],
    "existing": ["react", "typescript"]
  },
  "databaseChanges": [
    {
      "type": "migration",
      "description": "Add user_preferences table",
      "files": ["migrations/001_add_user_preferences.sql"]
    }
  ],
  "apiChanges": [
    {
      "type": "new-endpoint",
      "endpoint": "GET /api/users/:id/profile",
      "description": "Fetch user profile data"
    }
  ],
  "testingNotes": [
    "Test with authenticated and unauthenticated users",
    "Verify data validation",
    "Test error handling"
  ],
  "integrationPoints": ["Authentication service", "User database"],
  "deploymentNotes": ["Run migrations before deploying"],
  "estimatedComplexity": "medium",
  "completionStatus": "implemented"
}

REQUIREMENTS:
- Generate 3-8 code files implementing the user story
- Include actual, working code (not pseudocode or TODO comments)
- Follow the established architecture and patterns from previous phases
- Include all necessary imports and dependencies
- Add proper error handling and validation
- Follow ${language} and ${framework} best practices
- Include database migrations if data model changes are needed
- Document API changes if endpoints are added/modified
- Ensure code is production-ready and follows the project structure
- Add comments explaining complex logic
- Consider edge cases and error scenarios

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private summarizeDirectoryStructure(dir: any): string {
    if (!dir) return 'Not available';

    const lines: string[] = [];
    const traverse = (d: any, indent: string = '') => {
      if (!d) return;
      lines.push(`${indent}${d.name}/`);
      if (d.subdirectories && d.subdirectories.length > 0 && lines.length < 10) {
        d.subdirectories.forEach((sub: any) => traverse(sub, indent + '  '));
      }
    };
    traverse(dir);
    return lines.slice(0, 10).join('\n');
  }

  private parseImplementation(text: string): CodeImplementation {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize complexity
      if (parsed.estimatedComplexity) {
        parsed.estimatedComplexity = this.normalizeComplexity(parsed.estimatedComplexity);
      }

      return parsed as CodeImplementation;
    } catch (error) {
      this.logger.error('Failed to parse code implementation', { error });
      throw error;
    }
  }

  private normalizeComplexity(complexity: string): 'low' | 'medium' | 'high' {
    const lower = complexity?.toLowerCase().trim() || '';
    if (lower.includes('low') || lower.includes('simple') || lower.includes('easy')) return 'low';
    if (lower.includes('high') || lower.includes('complex') || lower.includes('hard')) return 'high';
    return 'medium';
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback code implementation');

    const { userStory } = input;

    const implementation: CodeImplementation = {
      userStory: {
        id: userStory.id || 'US-001',
        title: userStory.title || 'User story',
        asA: userStory.asA || 'user',
        iWant: userStory.iWant || 'feature',
        soThat: userStory.soThat || 'benefit',
        acceptanceCriteria: userStory.acceptanceCriteria || [],
      },
      files: [
        {
          path: 'src/components/Feature.tsx',
          content: `import React from 'react';\n\nexport const Feature = () => {\n  return (\n    <div>\n      <h1>${userStory.title}</h1>\n      <p>Implementation pending</p>\n    </div>\n  );\n};`,
          description: 'Feature component',
          language: 'TypeScript',
          type: 'source',
          linesOfCode: 10,
        },
      ],
      implementationDetails: [
        {
          aspect: 'ui',
          description: 'Created basic component structure',
          rationale: 'Placeholder for user story implementation',
        },
      ],
      dependencies: {
        new: [],
        existing: ['react'],
      },
      databaseChanges: [],
      apiChanges: [],
      testingNotes: ['Implement tests after code review'],
      integrationPoints: [],
      deploymentNotes: [],
      estimatedComplexity: 'low',
      completionStatus: 'partial',
    };

    return {
      reasoning: 'Using fallback implementation as LLM invocation failed',
      confidence: 0.3,
      intermediate: {
        implementation,
      },
    };
  }
}

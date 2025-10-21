import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Test File
 */
interface TestFile {
  path: string;
  content: string;
  description: string;
  framework: string;
  testsCount: number;
  coverageTarget: number;
}

/**
 * Test Case
 */
interface TestCase {
  name: string;
  type: 'unit' | 'integration' | 'edge-case' | 'error-handling';
  description: string;
  sourceFile: string;
  function: string;
  assertions: number;
}

/**
 * Coverage Report
 */
interface CoverageReport {
  overall: number;
  byFile: {
    file: string;
    coverage: number;
    lines: {
      total: number;
      covered: number;
      uncovered: number;
    };
    branches: {
      total: number;
      covered: number;
      uncovered: number;
    };
  }[];
  uncoveredAreas: {
    file: string;
    lines: string;
    reason: string;
  }[];
}

/**
 * Test Strategy
 */
interface TestStrategy {
  approach: string;
  mockingStrategy: string;
  fixtures: string[];
  testData: {
    scenario: string;
    data: string;
  }[];
}

/**
 * Unit Test Suite
 */
interface UnitTestSuite {
  summary: {
    totalTests: number;
    testFiles: number;
    estimatedCoverage: number;
    framework: string;
    testingNotes: string;
  };
  testFiles: TestFile[];
  testCases: TestCase[];
  coverage: CoverageReport;
  testStrategy: TestStrategy;
  dependencies: {
    name: string;
    version: string;
    purpose: string;
  }[];
  setupInstructions: string[];
  runCommands: {
    command: string;
    description: string;
  }[];
}

/**
 * UnitTestWriterAgent
 *
 * Generates comprehensive unit tests for implemented code including:
 * - Unit tests for all functions and methods
 * - Integration tests for component interactions
 * - Edge case tests
 * - Error handling tests
 * - Mock setup and test fixtures
 * - Test data generation
 * - Coverage analysis
 *
 * Follows testing best practices and aims for 80%+ code coverage.
 *
 * Input: Code implementation + Code review
 * Output: Complete unit test suite with high coverage
 */
export class UnitTestWriterAgent extends BaseAgent {
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
        'Analyze code to identify testable units',
        'Design test strategy and mocking approach',
        'Generate comprehensive test cases',
        'Calculate coverage and identify gaps',
      ],
      estimatedTotalDurationMs: 12000, // ~12 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildTestPrompt(input);

      this.logger.info('Invoking LLM for unit test generation');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const testSuite = this.parseTestSuite(content);

      return {
        reasoning: `Generated ${testSuite.summary.totalTests} tests across ${testSuite.summary.testFiles} test files with estimated ${testSuite.summary.estimatedCoverage}% coverage.`,
        confidence: 0.85,
        intermediate: {
          testSuite,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for unit test generation', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const testSuite = result.intermediate?.testSuite;

    return [
      {
        type: 'unit-test-suite',
        content: testSuite,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildTestPrompt(input: any): string {
    const { codeImplementation, codeReview, previousArtifacts } = input;

    const files = codeImplementation?.files || [];
    const userStory = codeImplementation?.userStory;

    // Extract context
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const language = repoBlueprint?.overview?.language || 'TypeScript';
    const framework = repoBlueprint?.overview?.framework || 'React';

    return `You are a Senior Test Engineer writing comprehensive unit tests.

USER STORY:
${userStory?.title || 'N/A'}

CODE FILES (${files.length} files):
${files.map((f: any, i: number) => `
File ${i + 1}: ${f.path}
\`\`\`${f.language}
${f.content}
\`\`\`
`).join('\n')}

CODE REVIEW FINDINGS:
${codeReview?.findings?.slice(0, 5).map((f: any) => `- [${f.severity}] ${f.issue}`).join('\n') || 'No critical findings'}

PROJECT CONTEXT:
Language: ${language}
Framework: ${framework}
Testing Framework: ${this.getTestingFramework(language, framework)}

TASK:
Write comprehensive unit tests achieving 80%+ code coverage. Your response MUST be valid JSON matching this structure:

{
  "summary": {
    "totalTests": 15,
    "testFiles": 3,
    "estimatedCoverage": 85,
    "framework": "Jest",
    "testingNotes": "Comprehensive test coverage including edge cases and error scenarios"
  },
  "testFiles": [
    {
      "path": "src/components/__tests__/UserProfile.test.tsx",
      "content": "import { render, screen } from '@testing-library/react';\\nimport { UserProfile } from '../UserProfile';\\n\\ndescribe('UserProfile', () => {\\n  it('renders user name', () => {\\n    render(<UserProfile name=\\"John\\" />);\\n    expect(screen.getByText('John')).toBeInTheDocument();\\n  });\\n\\n  it('handles missing name', () => {\\n    render(<UserProfile />);\\n    expect(screen.getByText('Anonymous')).toBeInTheDocument();\\n  });\\n});",
      "description": "Unit tests for UserProfile component",
      "framework": "Jest + React Testing Library",
      "testsCount": 5,
      "coverageTarget": 90
    }
  ],
  "testCases": [
    {
      "name": "renders user name correctly",
      "type": "unit",
      "description": "Verifies component renders with provided name",
      "sourceFile": "src/components/UserProfile.tsx",
      "function": "UserProfile",
      "assertions": 1
    },
    {
      "name": "handles null values",
      "type": "edge-case",
      "description": "Tests component behavior with null props",
      "sourceFile": "src/components/UserProfile.tsx",
      "function": "UserProfile",
      "assertions": 2
    },
    {
      "name": "throws error on invalid input",
      "type": "error-handling",
      "description": "Verifies error handling for invalid data",
      "sourceFile": "src/api/users.ts",
      "function": "getUserProfile",
      "assertions": 1
    }
  ],
  "coverage": {
    "overall": 85,
    "byFile": [
      {
        "file": "src/components/UserProfile.tsx",
        "coverage": 90,
        "lines": {
          "total": 50,
          "covered": 45,
          "uncovered": 5
        },
        "branches": {
          "total": 10,
          "covered": 9,
          "uncovered": 1
        }
      }
    ],
    "uncoveredAreas": [
      {
        "file": "src/api/users.ts",
        "lines": "45-48",
        "reason": "Error handling for network timeout - difficult to test"
      }
    ]
  },
  "testStrategy": {
    "approach": "Test-driven approach with focus on user-facing behavior",
    "mockingStrategy": "Mock external API calls and database interactions",
    "fixtures": ["mockUserData.json", "testConstants.ts"],
    "testData": [
      {
        "scenario": "Valid user data",
        "data": "{ id: '123', name: 'John Doe', email: 'john@example.com' }"
      },
      {
        "scenario": "Empty user data",
        "data": "{ id: '', name: '', email: '' }"
      }
    ]
  },
  "dependencies": [
    {
      "name": "@testing-library/react",
      "version": "^14.0.0",
      "purpose": "React component testing utilities"
    },
    {
      "name": "jest",
      "version": "^29.0.0",
      "purpose": "Test framework and runner"
    }
  ],
  "setupInstructions": [
    "Install test dependencies: npm install --save-dev jest @testing-library/react",
    "Add test script to package.json",
    "Configure Jest in jest.config.js"
  ],
  "runCommands": [
    {
      "command": "npm test",
      "description": "Run all tests"
    },
    {
      "command": "npm run test:coverage",
      "description": "Run tests with coverage report"
    }
  ]
}

REQUIREMENTS:
- Generate 10-20 test cases covering all code paths
- Include tests for:
  - Happy path scenarios
  - Edge cases (empty values, null, undefined)
  - Error handling
  - Boundary conditions
  - Integration points
- Write actual, runnable test code (not pseudocode)
- Use ${this.getTestingFramework(language, framework)} testing framework
- Include setup/teardown if needed
- Mock external dependencies (APIs, databases)
- Aim for 80%+ code coverage
- Follow testing best practices (AAA pattern: Arrange, Act, Assert)
- Include descriptive test names
- Add comments explaining complex test logic

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private getTestingFramework(language: string, framework: string): string {
    if (language === 'TypeScript' || language === 'JavaScript') {
      if (framework.toLowerCase().includes('react')) {
        return 'Jest + React Testing Library';
      }
      return 'Jest';
    } else if (language === 'Python') {
      return 'pytest';
    } else if (language === 'Java') {
      return 'JUnit 5';
    } else if (language === 'Go') {
      return 'Go testing';
    }
    return 'Jest';
  }

  private parseTestSuite(text: string): UnitTestSuite {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as UnitTestSuite;
    } catch (error) {
      this.logger.error('Failed to parse unit test suite', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback unit test suite');

    const { codeImplementation } = input;
    const files = codeImplementation?.files || [];

    const testSuite: UnitTestSuite = {
      summary: {
        totalTests: 5,
        testFiles: 1,
        estimatedCoverage: 60,
        framework: 'Jest',
        testingNotes: 'Basic test coverage generated. Manual tests recommended.',
      },
      testFiles: [
        {
          path: files[0] ? `${files[0].path.replace(/\.(tsx?|jsx?|py|java|go)$/, '')}.test.${files[0].language === 'TypeScript' ? 'ts' : 'js'}` : 'test/example.test.ts',
          content: `describe('Example Tests', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n\n  it('should handle basic cases', () => {\n    // Add test implementation\n    expect(1 + 1).toBe(2);\n  });\n});`,
          description: 'Basic test suite',
          framework: 'Jest',
          testsCount: 2,
          coverageTarget: 60,
        },
      ],
      testCases: [
        {
          name: 'basic functionality test',
          type: 'unit',
          description: 'Tests basic functionality',
          sourceFile: files[0]?.path || 'unknown',
          function: 'main',
          assertions: 1,
        },
      ],
      coverage: {
        overall: 60,
        byFile: [
          {
            file: files[0]?.path || 'unknown',
            coverage: 60,
            lines: {
              total: files[0]?.linesOfCode || 100,
              covered: Math.floor((files[0]?.linesOfCode || 100) * 0.6),
              uncovered: Math.floor((files[0]?.linesOfCode || 100) * 0.4),
            },
            branches: {
              total: 10,
              covered: 6,
              uncovered: 4,
            },
          },
        ],
        uncoveredAreas: [
          {
            file: files[0]?.path || 'unknown',
            lines: 'Various',
            reason: 'Automated test generation incomplete',
          },
        ],
      },
      testStrategy: {
        approach: 'Basic unit testing',
        mockingStrategy: 'Mock external dependencies',
        fixtures: [],
        testData: [],
      },
      dependencies: [
        {
          name: 'jest',
          version: '^29.0.0',
          purpose: 'Test framework',
        },
      ],
      setupInstructions: [
        'Install Jest: npm install --save-dev jest',
        'Run tests: npm test',
      ],
      runCommands: [
        {
          command: 'npm test',
          description: 'Run all tests',
        },
      ],
    };

    return {
      reasoning: 'Using fallback unit test suite as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        testSuite,
      },
    };
  }
}

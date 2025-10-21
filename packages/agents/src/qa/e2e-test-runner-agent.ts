import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * E2E Test Scenario
 */
interface E2ETestScenario {
  id: string;
  name: string;
  description: string;
  userJourney: string;
  steps: {
    step: number;
    action: string;
    expectedResult: string;
    selector?: string;
  }[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimatedDuration: number; // seconds
}

/**
 * E2E Test File
 */
interface E2ETestFile {
  path: string;
  framework: 'Cypress' | 'Playwright' | 'Selenium' | 'TestCafe';
  content: string;
  scenarios: number;
  description: string;
}

/**
 * Test Execution Result
 */
interface TestExecutionResult {
  scenarioId: string;
  status: 'pass' | 'fail' | 'skip' | 'pending';
  duration: number;
  error?: string;
  screenshots?: string[];
  logs?: string[];
}

/**
 * E2E Test Coverage
 */
interface E2ETestCoverage {
  userJourneys: {
    journey: string;
    covered: boolean;
    scenarios: string[];
  }[];
  features: {
    feature: string;
    covered: boolean;
    scenarios: string[];
  }[];
  criticalPaths: {
    path: string;
    covered: boolean;
    description: string;
  }[];
  overallCoverage: number; // percentage
}

/**
 * E2E Test Strategy
 */
interface E2ETestStrategy {
  approach: string;
  testEnvironment: {
    baseUrl: string;
    browser: string[];
    viewport: string[];
    devices?: string[];
  };
  dataManagement: {
    seedData: string;
    cleanup: string;
    isolation: string;
  };
  parallelization: {
    enabled: boolean;
    workers: number;
    sharding: boolean;
  };
  retryStrategy: {
    maxRetries: number;
    retryDelay: number;
    retryOn: string[];
  };
}

/**
 * E2E Test Suite
 */
interface E2ETestSuite {
  summary: {
    totalScenarios: number;
    criticalScenarios: number;
    estimatedDuration: number; // seconds
    framework: string;
    coverageTarget: number;
  };
  testFiles: E2ETestFile[];
  scenarios: E2ETestScenario[];
  coverage: E2ETestCoverage;
  testStrategy: E2ETestStrategy;
  dependencies: {
    name: string;
    version: string;
    purpose: string;
  }[];
  setupInstructions: string[];
  ciIntegration: {
    platform: string;
    configuration: string;
    runCommand: string;
  };
  executionResults?: TestExecutionResult[];
}

/**
 * E2ETestRunnerAgent
 *
 * Generates comprehensive end-to-end tests for the implemented application:
 * - User journey-based test scenarios
 * - Critical path testing
 * - Cross-browser compatibility tests
 * - Regression test suite
 * - Performance benchmarks
 * - Visual regression testing integration
 *
 * Uses modern E2E frameworks (Cypress, Playwright) and follows best practices
 * for reliable, maintainable test automation.
 *
 * Input: Code implementation + User stories + PRD
 * Output: Complete E2E test suite with high journey coverage
 */
export class E2ETestRunnerAgent extends BaseAgent {
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
        'Analyze user journeys and critical paths',
        'Design E2E test scenarios',
        'Generate test automation code',
        'Calculate coverage and identify gaps',
      ],
      estimatedTotalDurationMs: 15000, // ~15 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildE2ETestPrompt(input);

      this.logger.info('Invoking LLM for E2E test generation');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const testSuite = this.parseTestSuite(content);

      return {
        reasoning: `Generated ${testSuite.summary.totalScenarios} E2E test scenarios across ${testSuite.testFiles.length} test files with ${testSuite.coverage.overallCoverage}% journey coverage.`,
        confidence: 0.85,
        intermediate: {
          testSuite,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for E2E test generation', { error });
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
        type: 'e2e-test-suite',
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

  private buildE2ETestPrompt(input: any): string {
    const { previousArtifacts } = input;

    // Extract context from previous phases
    const storyLoopComplete = previousArtifacts?.find((a: any) => a.type === 'story-loop-complete')?.content;
    const prdComplete = previousArtifacts?.find((a: any) => a.type === 'prd-complete')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const language = repoBlueprint?.overview?.language || 'TypeScript';
    const framework = repoBlueprint?.overview?.framework || 'React';
    const userJourneys = prdComplete?.prd?.userJourneys || [];
    const totalStories = storyLoopComplete?.summary?.totalStories || 0;

    return `You are a Senior QA Engineer creating comprehensive end-to-end tests.

PROJECT CONTEXT:
Language: ${language}
Framework: ${framework}
Total User Stories Implemented: ${totalStories}

USER JOURNEYS (from PRD):
${userJourneys.slice(0, 5).map((j: any, i: number) => `
Journey ${i + 1}: ${j.persona || 'User'} - ${j.scenario || 'N/A'}
Steps: ${j.steps?.slice(0, 3).join(', ') || 'N/A'}
`).join('\n') || 'No user journeys specified'}

CODE METRICS:
Total Files: ${storyLoopComplete?.summary?.totalFiles || 0}
Total Tests: ${storyLoopComplete?.summary?.totalTests || 0}
Average Coverage: ${storyLoopComplete?.summary?.averageCoverage || 0}%

TASK:
Create comprehensive end-to-end tests covering all user journeys. Your response MUST be valid JSON:

{
  "summary": {
    "totalScenarios": 25,
    "criticalScenarios": 8,
    "estimatedDuration": 420,
    "framework": "Playwright",
    "coverageTarget": 95
  },
  "testFiles": [
    {
      "path": "e2e/user-authentication.spec.ts",
      "framework": "Playwright",
      "content": "import { test, expect } from '@playwright/test';\\n\\ntest.describe('User Authentication', () => {\\n  test('user can sign up with email', async ({ page }) => {\\n    await page.goto('/signup');\\n    await page.fill('[data-testid=\\"email\\"]', 'user@example.com');\\n    await page.fill('[data-testid=\\"password\\"]', 'SecurePass123!');\\n    await page.click('[data-testid=\\"signup-button\\"]');\\n    await expect(page).toHaveURL('/dashboard');\\n    await expect(page.locator('[data-testid=\\"welcome-message\\"]')).toContainText('Welcome');\\n  });\\n\\n  test('user can login', async ({ page }) => {\\n    await page.goto('/login');\\n    await page.fill('[data-testid=\\"email\\"]', 'user@example.com');\\n    await page.fill('[data-testid=\\"password\\"]', 'SecurePass123!');\\n    await page.click('[data-testid=\\"login-button\\"]');\\n    await expect(page).toHaveURL('/dashboard');\\n  });\\n});",
      "scenarios": 5,
      "description": "User authentication and authorization flows"
    }
  ],
  "scenarios": [
    {
      "id": "E2E-001",
      "name": "Complete user registration and first task creation",
      "description": "Validates end-to-end flow from signup to creating first task",
      "userJourney": "New user onboarding",
      "steps": [
        {
          "step": 1,
          "action": "Navigate to signup page",
          "expectedResult": "Signup form is visible",
          "selector": "[data-testid='signup-form']"
        },
        {
          "step": 2,
          "action": "Fill registration form",
          "expectedResult": "Form accepts input",
          "selector": "[data-testid='email-input']"
        },
        {
          "step": 3,
          "action": "Submit registration",
          "expectedResult": "User redirected to dashboard",
          "selector": "[data-testid='submit-button']"
        }
      ],
      "priority": "critical",
      "estimatedDuration": 30
    }
  ],
  "coverage": {
    "userJourneys": [
      {
        "journey": "User registration and onboarding",
        "covered": true,
        "scenarios": ["E2E-001", "E2E-002"]
      }
    ],
    "features": [
      {
        "feature": "User authentication",
        "covered": true,
        "scenarios": ["E2E-001", "E2E-003"]
      }
    ],
    "criticalPaths": [
      {
        "path": "Signup → Onboarding → First Action",
        "covered": true,
        "description": "Critical user acquisition flow"
      }
    ],
    "overallCoverage": 90
  },
  "testStrategy": {
    "approach": "User journey-focused with critical path prioritization",
    "testEnvironment": {
      "baseUrl": "http://localhost:3000",
      "browser": ["chromium", "firefox", "webkit"],
      "viewport": ["1920x1080", "375x667"],
      "devices": ["Desktop Chrome", "iPhone 12"]
    },
    "dataManagement": {
      "seedData": "Use fixtures for test data",
      "cleanup": "Reset database after each test",
      "isolation": "Each test runs in isolated context"
    },
    "parallelization": {
      "enabled": true,
      "workers": 4,
      "sharding": false
    },
    "retryStrategy": {
      "maxRetries": 2,
      "retryDelay": 1000,
      "retryOn": ["timeout", "navigation"]
    }
  },
  "dependencies": [
    {
      "name": "@playwright/test",
      "version": "^1.40.0",
      "purpose": "E2E testing framework"
    }
  ],
  "setupInstructions": [
    "Install Playwright: npm install --save-dev @playwright/test",
    "Install browsers: npx playwright install",
    "Add test script to package.json",
    "Configure playwright.config.ts"
  ],
  "ciIntegration": {
    "platform": "GitHub Actions",
    "configuration": "Run on PR and main branch",
    "runCommand": "npm run test:e2e"
  }
}

REQUIREMENTS:
- Generate 15-30 E2E test scenarios covering all user journeys
- Include tests for:
  - Happy path scenarios (critical user flows)
  - Authentication and authorization
  - Data CRUD operations
  - Error handling and edge cases
  - Cross-browser compatibility
  - Mobile responsiveness
- Use ${this.getE2EFramework(framework)} as the testing framework
- Write actual, runnable test code (not pseudocode)
- Use data-testid selectors for reliability
- Include setup/teardown logic
- Add wait strategies for async operations
- Aim for 90%+ user journey coverage
- Prioritize critical business flows
- Include accessibility checks where relevant

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private getE2EFramework(framework: string): string {
    if (framework.toLowerCase().includes('react') || framework.toLowerCase().includes('next')) {
      return 'Playwright';
    } else if (framework.toLowerCase().includes('vue')) {
      return 'Cypress';
    } else if (framework.toLowerCase().includes('angular')) {
      return 'Protractor / Playwright';
    }
    return 'Playwright';
  }

  private parseTestSuite(text: string): E2ETestSuite {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as E2ETestSuite;
    } catch (error) {
      this.logger.error('Failed to parse E2E test suite', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback E2E test suite');

    const { previousArtifacts } = input;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;
    const framework = repoBlueprint?.overview?.framework || 'React';

    const testSuite: E2ETestSuite = {
      summary: {
        totalScenarios: 5,
        criticalScenarios: 2,
        estimatedDuration: 180,
        framework: 'Playwright',
        coverageTarget: 70,
      },
      testFiles: [
        {
          path: 'e2e/basic-flow.spec.ts',
          framework: 'Playwright',
          content: `import { test, expect } from '@playwright/test';

test.describe('Basic Application Flow', () => {
  test('application loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.*/)
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');
    // Add navigation tests
  });
});`,
          scenarios: 2,
          description: 'Basic smoke tests',
        },
      ],
      scenarios: [
        {
          id: 'E2E-001',
          name: 'Application loads',
          description: 'Verify application loads successfully',
          userJourney: 'Initial load',
          steps: [
            {
              step: 1,
              action: 'Navigate to home page',
              expectedResult: 'Page loads without errors',
            },
          ],
          priority: 'critical',
          estimatedDuration: 10,
        },
      ],
      coverage: {
        userJourneys: [
          {
            journey: 'Basic navigation',
            covered: true,
            scenarios: ['E2E-001'],
          },
        ],
        features: [
          {
            feature: 'Application load',
            covered: true,
            scenarios: ['E2E-001'],
          },
        ],
        criticalPaths: [
          {
            path: 'Home page load',
            covered: true,
            description: 'Basic application access',
          },
        ],
        overallCoverage: 60,
      },
      testStrategy: {
        approach: 'Basic smoke testing',
        testEnvironment: {
          baseUrl: 'http://localhost:3000',
          browser: ['chromium'],
          viewport: ['1920x1080'],
        },
        dataManagement: {
          seedData: 'Minimal test data',
          cleanup: 'Manual cleanup',
          isolation: 'Basic isolation',
        },
        parallelization: {
          enabled: false,
          workers: 1,
          sharding: false,
        },
        retryStrategy: {
          maxRetries: 1,
          retryDelay: 1000,
          retryOn: ['timeout'],
        },
      },
      dependencies: [
        {
          name: '@playwright/test',
          version: '^1.40.0',
          purpose: 'E2E testing framework',
        },
      ],
      setupInstructions: [
        'Install Playwright: npm install --save-dev @playwright/test',
        'Run tests: npx playwright test',
      ],
      ciIntegration: {
        platform: 'GitHub Actions',
        configuration: 'Basic CI setup',
        runCommand: 'npm test',
      },
    };

    return {
      reasoning: 'Using fallback E2E test suite as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        testSuite,
      },
    };
  }
}

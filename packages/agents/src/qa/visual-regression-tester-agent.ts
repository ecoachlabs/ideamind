import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Visual Test Scenario
 */
interface VisualTestScenario {
  id: string;
  name: string;
  description: string;
  component: string;
  url: string;
  viewport: {
    width: number;
    height: number;
    device?: string;
  };
  interactions: {
    action: string;
    selector?: string;
    value?: string;
  }[];
  baseline: string; // Path to baseline screenshot
  threshold: number; // Acceptable pixel difference percentage
}

/**
 * Visual Test File
 */
interface VisualTestFile {
  path: string;
  framework: 'Percy' | 'BackstopJS' | 'Chromatic' | 'Playwright' | 'Cypress';
  content: string;
  scenarios: number;
  description: string;
}

/**
 * Responsive Test Config
 */
interface ResponsiveTestConfig {
  breakpoint: string;
  viewport: {
    width: number;
    height: number;
  };
  scenarios: string[];
  criticalViews: string[];
}

/**
 * Component Visual State
 */
interface ComponentVisualState {
  component: string;
  states: {
    state: string;
    description: string;
    selector: string;
  }[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Visual Diff Result
 */
interface VisualDiffResult {
  scenarioId: string;
  status: 'pass' | 'fail' | 'new';
  pixelDifference: number; // percentage
  diffImage?: string;
  baselineImage: string;
  currentImage: string;
  failedOn?: string[];
}

/**
 * Visual Regression Suite
 */
interface VisualRegressionSuite {
  summary: {
    totalScenarios: number;
    criticalComponents: number;
    viewports: number;
    estimatedDuration: number; // seconds
    framework: string;
  };
  testFiles: VisualTestFile[];
  scenarios: VisualTestScenario[];
  responsiveTests: ResponsiveTestConfig[];
  componentStates: ComponentVisualState[];
  baselineGeneration: {
    command: string;
    outputDir: string;
    approved: boolean;
  };
  ciIntegration: {
    platform: string;
    autoApprove: boolean;
    notificationChannels: string[];
    failOnDifference: boolean;
  };
  dependencies: {
    name: string;
    version: string;
    purpose: string;
  }[];
  setupInstructions: string[];
  bestPractices: string[];
  visualDiffResults?: VisualDiffResult[];
}

/**
 * VisualRegressionTesterAgent
 *
 * Generates comprehensive visual regression tests including:
 * - Screenshot-based regression testing
 * - Responsive design validation
 * - Component state testing
 * - Cross-browser visual consistency
 * - Accessibility visual checks
 * - Dark mode / theme testing
 * - Animation and transition testing
 *
 * Uses modern visual testing frameworks (Percy, BackstopJS, Chromatic, Playwright)
 * to catch UI regressions before they reach production.
 *
 * Input: UI components + User stories + Design system
 * Output: Complete visual regression test suite with baselines
 */
export class VisualRegressionTesterAgent extends BaseAgent {
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
        'Identify critical UI components and views',
        'Design visual regression test scenarios',
        'Generate screenshot test automation',
        'Configure responsive and theme testing',
      ],
      estimatedTotalDurationMs: 13000, // ~13 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildVisualTestPrompt(input);

      this.logger.info('Invoking LLM for visual regression test generation');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const testSuite = this.parseTestSuite(content);

      return {
        reasoning: `Generated ${testSuite.summary.totalScenarios} visual regression scenarios across ${testSuite.summary.criticalComponents} components with ${testSuite.summary.viewports} viewport configurations.`,
        confidence: 0.85,
        intermediate: {
          testSuite,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for visual regression test generation', { error });
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
        type: 'visual-regression-suite',
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

  private buildVisualTestPrompt(input: any): string {
    const { previousArtifacts } = input;

    // Extract context
    const storyLoopComplete = previousArtifacts?.find((a: any) => a.type === 'story-loop-complete')?.content;
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;

    const framework = repoBlueprint?.overview?.framework || 'React';
    const totalFiles = storyLoopComplete?.summary?.totalFiles || 0;

    return `You are a Senior QA Engineer creating visual regression tests.

PROJECT CONTEXT:
Framework: ${framework}
Total Code Files: ${totalFiles}
Frontend Type: ${this.getFrontendType(framework)}

TASK:
Create comprehensive visual regression tests. Your response MUST be valid JSON:

{
  "summary": {
    "totalScenarios": 30,
    "criticalComponents": 12,
    "viewports": 4,
    "estimatedDuration": 420,
    "framework": "Playwright"
  },
  "testFiles": [
    {
      "path": "visual-tests/components.spec.ts",
      "framework": "Playwright",
      "content": "import { test, expect } from '@playwright/test';\\n\\ntest.describe('Button Component Visual Tests', () => {\\n  test('primary button default state', async ({ page }) => {\\n    await page.goto('/components/button');\\n    const button = page.locator('[data-testid=\\"primary-button\\"]');\\n    await expect(button).toHaveScreenshot('button-primary-default.png');\\n  });\\n\\n  test('primary button hover state', async ({ page }) => {\\n    await page.goto('/components/button');\\n    const button = page.locator('[data-testid=\\"primary-button\\"]');\\n    await button.hover();\\n    await expect(button).toHaveScreenshot('button-primary-hover.png');\\n  });\\n\\n  test('primary button disabled state', async ({ page }) => {\\n    await page.goto('/components/button?disabled=true');\\n    const button = page.locator('[data-testid=\\"primary-button\\"]');\\n    await expect(button).toHaveScreenshot('button-primary-disabled.png');\\n  });\\n});",
      "scenarios": 8,
      "description": "Visual regression tests for UI components"
    }
  ],
  "scenarios": [
    {
      "id": "VRT-001",
      "name": "Homepage desktop view",
      "description": "Capture full homepage on desktop viewport",
      "component": "Homepage",
      "url": "/",
      "viewport": {
        "width": 1920,
        "height": 1080,
        "device": "Desktop"
      },
      "interactions": [],
      "baseline": "baselines/homepage-desktop.png",
      "threshold": 0.1
    },
    {
      "id": "VRT-002",
      "name": "Homepage mobile view",
      "description": "Capture full homepage on mobile viewport",
      "component": "Homepage",
      "url": "/",
      "viewport": {
        "width": 375,
        "height": 667,
        "device": "iPhone 12"
      },
      "interactions": [],
      "baseline": "baselines/homepage-mobile.png",
      "threshold": 0.1
    },
    {
      "id": "VRT-003",
      "name": "Navigation menu hover states",
      "description": "Test navigation menu interactions",
      "component": "Navigation",
      "url": "/",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "interactions": [
        {
          "action": "hover",
          "selector": "[data-testid='nav-menu-trigger']"
        },
        {
          "action": "wait",
          "value": "300"
        }
      ],
      "baseline": "baselines/nav-hover.png",
      "threshold": 0.2
    },
    {
      "id": "VRT-004",
      "name": "Modal dialog",
      "description": "Test modal appearance and overlay",
      "component": "Modal",
      "url": "/components/modal",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "interactions": [
        {
          "action": "click",
          "selector": "[data-testid='open-modal-button']"
        },
        {
          "action": "wait",
          "value": "500"
        }
      ],
      "baseline": "baselines/modal-open.png",
      "threshold": 0.1
    }
  ],
  "responsiveTests": [
    {
      "breakpoint": "Mobile",
      "viewport": {
        "width": 375,
        "height": 667
      },
      "scenarios": ["VRT-002", "VRT-010", "VRT-015"],
      "criticalViews": ["Homepage", "Login", "Product List"]
    },
    {
      "breakpoint": "Tablet",
      "viewport": {
        "width": 768,
        "height": 1024
      },
      "scenarios": ["VRT-020", "VRT-021"],
      "criticalViews": ["Dashboard", "Settings"]
    },
    {
      "breakpoint": "Desktop",
      "viewport": {
        "width": 1920,
        "height": 1080
      },
      "scenarios": ["VRT-001", "VRT-003", "VRT-005"],
      "criticalViews": ["Homepage", "Dashboard", "Admin Panel"]
    },
    {
      "breakpoint": "Large Desktop",
      "viewport": {
        "width": 2560,
        "height": 1440
      },
      "scenarios": ["VRT-030"],
      "criticalViews": ["Dashboard"]
    }
  ],
  "componentStates": [
    {
      "component": "Button",
      "states": [
        {
          "state": "default",
          "description": "Default button appearance",
          "selector": "[data-testid='button-default']"
        },
        {
          "state": "hover",
          "description": "Button with hover effect",
          "selector": "[data-testid='button-hover']"
        },
        {
          "state": "active",
          "description": "Button in pressed state",
          "selector": "[data-testid='button-active']"
        },
        {
          "state": "disabled",
          "description": "Disabled button",
          "selector": "[data-testid='button-disabled']"
        },
        {
          "state": "loading",
          "description": "Button with loading spinner",
          "selector": "[data-testid='button-loading']"
        }
      ],
      "priority": "critical"
    },
    {
      "component": "Form Input",
      "states": [
        {
          "state": "empty",
          "description": "Empty input field",
          "selector": "[data-testid='input-empty']"
        },
        {
          "state": "filled",
          "description": "Input with value",
          "selector": "[data-testid='input-filled']"
        },
        {
          "state": "error",
          "description": "Input with validation error",
          "selector": "[data-testid='input-error']"
        },
        {
          "state": "disabled",
          "description": "Disabled input",
          "selector": "[data-testid='input-disabled']"
        }
      ],
      "priority": "high"
    }
  ],
  "baselineGeneration": {
    "command": "npm run test:visual -- --update-snapshots",
    "outputDir": "visual-tests/baselines",
    "approved": false
  },
  "ciIntegration": {
    "platform": "GitHub Actions",
    "autoApprove": false,
    "notificationChannels": ["Slack #qa-alerts"],
    "failOnDifference": true
  },
  "dependencies": [
    {
      "name": "@playwright/test",
      "version": "^1.40.0",
      "purpose": "Visual regression testing framework"
    },
    {
      "name": "playwright-expect",
      "version": "^0.8.0",
      "purpose": "Screenshot assertions"
    }
  ],
  "setupInstructions": [
    "Install Playwright: npm install --save-dev @playwright/test",
    "Install browsers: npx playwright install",
    "Generate baselines: npm run test:visual -- --update-snapshots",
    "Review and approve baselines manually",
    "Run tests: npm run test:visual"
  ],
  "bestPractices": [
    "Generate baselines on consistent environment (Docker recommended)",
    "Use data-testid selectors for stability",
    "Set appropriate threshold for each component (0.1% for static, 0.5% for dynamic)",
    "Test all interactive states (hover, focus, active, disabled)",
    "Include responsive breakpoints (mobile, tablet, desktop)",
    "Test dark mode and theme variations",
    "Ignore dynamic content (timestamps, random IDs)",
    "Use stable test data",
    "Run visual tests in headless mode in CI",
    "Review diffs manually before approving changes"
  ]
}

REQUIREMENTS:
- Generate 20-40 visual regression scenarios
- Cover all critical UI components and views
- Include tests for:
  - Component states (default, hover, focus, disabled, error, loading)
  - Responsive breakpoints (mobile, tablet, desktop)
  - Dark mode / theme variations
  - Modal dialogs and overlays
  - Form validation states
  - Data tables and lists
  - Navigation menus
  - Loading states and skeletons
  - Error states and empty states
- Use ${this.getVisualFramework(framework)} as the testing framework
- Write actual, runnable test code
- Set appropriate thresholds for pixel differences
- Include setup for baseline generation
- Add CI/CD integration
- Test cross-browser consistency where relevant

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private getFrontendType(framework: string): string {
    if (framework.toLowerCase().includes('react')) return 'React SPA';
    if (framework.toLowerCase().includes('vue')) return 'Vue SPA';
    if (framework.toLowerCase().includes('angular')) return 'Angular SPA';
    if (framework.toLowerCase().includes('next')) return 'Next.js SSR';
    return 'Web Application';
  }

  private getVisualFramework(framework: string): string {
    if (framework.toLowerCase().includes('react') || framework.toLowerCase().includes('next')) {
      return 'Playwright';
    } else if (framework.toLowerCase().includes('vue')) {
      return 'Percy';
    }
    return 'Playwright';
  }

  private parseTestSuite(text: string): VisualRegressionSuite {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as VisualRegressionSuite;
    } catch (error) {
      this.logger.error('Failed to parse visual regression test suite', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback visual regression test suite');

    const testSuite: VisualRegressionSuite = {
      summary: {
        totalScenarios: 5,
        criticalComponents: 3,
        viewports: 2,
        estimatedDuration: 120,
        framework: 'Playwright',
      },
      testFiles: [
        {
          path: 'visual-tests/basic.spec.ts',
          framework: 'Playwright',
          content: `import { test, expect } from '@playwright/test';

test.describe('Basic Visual Tests', () => {
  test('homepage screenshot', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('homepage.png');
  });
});`,
          scenarios: 1,
          description: 'Basic visual regression tests',
        },
      ],
      scenarios: [
        {
          id: 'VRT-001',
          name: 'Homepage',
          description: 'Homepage visual test',
          component: 'Homepage',
          url: '/',
          viewport: {
            width: 1920,
            height: 1080,
          },
          interactions: [],
          baseline: 'baselines/homepage.png',
          threshold: 0.1,
        },
      ],
      responsiveTests: [
        {
          breakpoint: 'Desktop',
          viewport: {
            width: 1920,
            height: 1080,
          },
          scenarios: ['VRT-001'],
          criticalViews: ['Homepage'],
        },
      ],
      componentStates: [],
      baselineGeneration: {
        command: 'npm run test:visual -- --update-snapshots',
        outputDir: 'visual-tests/baselines',
        approved: false,
      },
      ciIntegration: {
        platform: 'GitHub Actions',
        autoApprove: false,
        notificationChannels: [],
        failOnDifference: true,
      },
      dependencies: [
        {
          name: '@playwright/test',
          version: '^1.40.0',
          purpose: 'Visual testing',
        },
      ],
      setupInstructions: [
        'Install Playwright',
        'Generate baselines',
        'Run tests',
      ],
      bestPractices: [
        'Use consistent environment for baselines',
        'Review diffs manually',
      ],
    };

    return {
      reasoning: 'Using fallback visual regression test suite as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        testSuite,
      },
    };
  }
}

import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * QAAgent - Comprehensive quality assurance and testing strategy
 *
 * Creates detailed testing plans covering:
 * - Test strategy and approach
 * - Test cases and scenarios
 * - Automation framework setup
 * - Performance and load testing
 * - Security testing
 * - Quality metrics and KPIs
 */
export class QAAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('QAAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false,
      supportsBatching: true,
      supportsCheckpointing: true,
      maxInputSize: 90000,
      maxOutputSize: 110000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing QA Agent');

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

      const qaPlan = this.parseJSON(text);

      return {
        success: true,
        output: qaPlan,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          test_cases_count: qaPlan.test_cases?.length || 0,
          test_scenarios_count: qaPlan.test_scenarios?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'QA Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a QA Agent that creates comprehensive testing strategies and plans.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Create a detailed quality assurance plan covering all aspects of testing.

Include:
1. **Testing Strategy**: Overall approach and philosophy
2. **Test Types**: Unit, integration, e2e, performance, security
3. **Test Cases**: Detailed test scenarios and steps
4. **Automation**: Framework setup and automation strategy
5. **Test Data**: Data requirements and management
6. **Performance Testing**: Load, stress, and scalability tests
7. **Security Testing**: Security test scenarios
8. **Quality Metrics**: KPIs and success criteria
9. **Test Environment**: Environment setup and requirements
10. **Defect Management**: Bug tracking and workflow

Output as JSON:
{
  "testing_strategy": {
    "approach": "shift-left|agile|waterfall|hybrid",
    "philosophy": "Overall testing philosophy",
    "coverage_target": {
      "unit": "90%",
      "integration": "80%",
      "e2e": "Critical paths"
    },
    "automation_target": "80% of regression tests automated",
    "testing_pyramid": {
      "unit_tests": "70%",
      "integration_tests": "20%",
      "e2e_tests": "10%"
    },
    "continuous_testing": "CI/CD integration approach",
    "risk_based_testing": "High-risk areas get more coverage"
  },
  "test_types": [
    {
      "type": "unit",
      "description": "Test individual functions/components",
      "tools": ["Jest", "React Testing Library"],
      "responsibility": "Developers",
      "frequency": "Every commit",
      "coverage_target": "90%",
      "execution_time": "< 5 minutes"
    },
    {
      "type": "integration",
      "description": "Test component interactions",
      "tools": ["Jest", "Supertest"],
      "responsibility": "Developers + QA",
      "frequency": "Every PR",
      "coverage_target": "80%",
      "execution_time": "< 15 minutes"
    },
    {
      "type": "e2e",
      "description": "Test full user workflows",
      "tools": ["Playwright", "Cypress"],
      "responsibility": "QA",
      "frequency": "Nightly + before release",
      "coverage_target": "Critical paths",
      "execution_time": "< 1 hour"
    },
    {
      "type": "performance",
      "description": "Load and stress testing",
      "tools": ["k6", "Artillery"],
      "responsibility": "QA + DevOps",
      "frequency": "Weekly + before release",
      "coverage_target": "All API endpoints",
      "execution_time": "< 2 hours"
    },
    {
      "type": "security",
      "description": "Security vulnerability testing",
      "tools": ["OWASP ZAP", "Burp Suite"],
      "responsibility": "Security + QA",
      "frequency": "Monthly + before release",
      "coverage_target": "All attack surfaces",
      "execution_time": "< 4 hours"
    }
  ],
  "test_cases": [
    {
      "id": "TC-001",
      "title": "User registration with valid data",
      "type": "functional",
      "priority": "high",
      "category": "authentication",
      "preconditions": ["No user exists with test email"],
      "steps": [
        {
          "step": 1,
          "action": "Navigate to registration page",
          "expected": "Registration form displayed"
        },
        {
          "step": 2,
          "action": "Enter email: test@example.com",
          "expected": "Email field accepts input"
        },
        {
          "step": 3,
          "action": "Enter password: SecurePass123!",
          "expected": "Password field accepts input"
        },
        {
          "step": 4,
          "action": "Click Register button",
          "expected": "User created, redirected to dashboard"
        }
      ],
      "expected_result": "User account created successfully",
      "test_data": {
        "email": "test@example.com",
        "password": "SecurePass123!"
      },
      "automated": true,
      "automation_script": "tests/auth/registration.spec.ts"
    }
  ],
  "test_scenarios": [
    {
      "id": "TS-001",
      "scenario": "Happy path: Complete user journey",
      "description": "New user signs up, creates project, invites team, completes task",
      "steps": [
        "User registers account",
        "User logs in",
        "User creates new project",
        "User invites team member",
        "Team member accepts invite",
        "User creates task",
        "Team member completes task",
        "User views dashboard with updated stats"
      ],
      "expected_outcome": "All steps complete successfully",
      "type": "e2e",
      "priority": "critical",
      "estimated_duration": "5 minutes",
      "test_data_requirements": ["2 user accounts", "Project data", "Task data"]
    },
    {
      "id": "TS-002",
      "scenario": "Error handling: Network failure during save",
      "description": "User creates content but network fails during save",
      "steps": [
        "User logs in",
        "User creates new document",
        "User enters content",
        "Simulate network failure",
        "User clicks Save",
        "Verify error message displayed",
        "Restore network",
        "User retries save",
        "Verify content saved successfully"
      ],
      "expected_outcome": "Graceful error handling, data not lost, successful retry",
      "type": "negative",
      "priority": "high",
      "estimated_duration": "3 minutes",
      "automation_notes": "Use Playwright's route interception"
    }
  ],
  "automation_framework": {
    "unit_testing": {
      "framework": "Jest",
      "assertion_library": "Jest matchers",
      "mocking": "Jest mocks",
      "coverage_tool": "Jest coverage",
      "setup": "npm install --save-dev jest @types/jest",
      "config_file": "jest.config.js",
      "run_command": "npm test"
    },
    "e2e_testing": {
      "framework": "Playwright",
      "browsers": ["chromium", "firefox", "webkit"],
      "parallel_execution": true,
      "headless": true,
      "video_recording": "on-failure",
      "screenshot": "on-failure",
      "setup": "npm install --save-dev @playwright/test",
      "config_file": "playwright.config.ts",
      "run_command": "npx playwright test"
    },
    "api_testing": {
      "framework": "Supertest",
      "assertions": "Jest",
      "setup": "npm install --save-dev supertest",
      "run_command": "npm run test:api"
    },
    "ci_integration": {
      "platform": "GitHub Actions",
      "triggers": ["push", "pull_request"],
      "jobs": ["unit-tests", "integration-tests", "e2e-tests"],
      "parallel_jobs": 3,
      "cache_dependencies": true,
      "artifacts": ["test-results", "coverage-reports"]
    }
  },
  "test_data_management": {
    "strategy": "Test data builder pattern",
    "approaches": [
      {
        "approach": "Factories",
        "description": "Create test data using factory functions",
        "example": "UserFactory.create({ email: 'test@example.com' })",
        "use_case": "Unit and integration tests"
      },
      {
        "approach": "Fixtures",
        "description": "Static test data files",
        "location": "tests/fixtures/",
        "format": "JSON",
        "use_case": "E2E tests with consistent data"
      },
      {
        "approach": "Database seeding",
        "description": "Pre-populate test database",
        "timing": "Before each test suite",
        "cleanup": "After each test suite",
        "use_case": "Integration and E2E tests"
      }
    ],
    "data_isolation": "Each test gets clean data, no shared state",
    "sensitive_data": "Use faker.js for realistic but fake data"
  },
  "performance_testing": {
    "objectives": [
      "Validate response times meet SLA",
      "Identify bottlenecks and capacity limits",
      "Ensure system handles expected load"
    ],
    "test_types": [
      {
        "type": "load",
        "description": "Sustained load over time",
        "duration": "30 minutes",
        "virtual_users": 100,
        "ramp_up": "10 users per minute",
        "success_criteria": "95th percentile response < 500ms"
      },
      {
        "type": "stress",
        "description": "Push system beyond limits",
        "duration": "15 minutes",
        "virtual_users": "Increase until failure",
        "ramp_up": "20 users per minute",
        "success_criteria": "Identify breaking point, graceful degradation"
      },
      {
        "type": "spike",
        "description": "Sudden traffic increase",
        "pattern": "Baseline → 10x spike → baseline",
        "duration": "10 minutes",
        "success_criteria": "System recovers after spike"
      },
      {
        "type": "soak",
        "description": "Extended duration test",
        "duration": "4 hours",
        "virtual_users": 50,
        "success_criteria": "No memory leaks, stable performance"
      }
    ],
    "tool": "k6",
    "metrics": [
      {
        "metric": "Response time",
        "target": "p95 < 500ms, p99 < 1000ms"
      },
      {
        "metric": "Throughput",
        "target": "1000 requests/second"
      },
      {
        "metric": "Error rate",
        "target": "< 0.1%"
      }
    ],
    "scenarios": [
      {
        "scenario": "User login",
        "endpoint": "POST /api/auth/login",
        "weight": "30%",
        "think_time": "2-5 seconds"
      },
      {
        "scenario": "Browse projects",
        "endpoint": "GET /api/projects",
        "weight": "50%",
        "think_time": "3-8 seconds"
      },
      {
        "scenario": "Create task",
        "endpoint": "POST /api/tasks",
        "weight": "20%",
        "think_time": "5-15 seconds"
      }
    ]
  },
  "security_testing": {
    "scope": "All user inputs, API endpoints, authentication flows",
    "test_types": [
      {
        "type": "Authentication bypass",
        "tests": ["Bypass login", "Session hijacking", "Token manipulation"],
        "tools": ["Burp Suite"]
      },
      {
        "type": "Injection attacks",
        "tests": ["SQL injection", "XSS", "Command injection", "LDAP injection"],
        "tools": ["OWASP ZAP", "SQLMap"]
      },
      {
        "type": "Authorization",
        "tests": ["Privilege escalation", "IDOR", "Missing access control"],
        "tools": ["Manual testing"]
      },
      {
        "type": "Data exposure",
        "tests": ["Sensitive data in responses", "Error messages leaking info"],
        "tools": ["Burp Suite"]
      }
    ],
    "owasp_top_10": [
      {
        "vulnerability": "A01: Broken Access Control",
        "test_approach": "Attempt unauthorized actions",
        "priority": "critical"
      },
      {
        "vulnerability": "A02: Cryptographic Failures",
        "test_approach": "Check encryption, certificate validation",
        "priority": "high"
      },
      {
        "vulnerability": "A03: Injection",
        "test_approach": "Inject malicious payloads in all inputs",
        "priority": "critical"
      }
    ],
    "frequency": "Weekly automated scans, quarterly manual pentest"
  },
  "quality_metrics": {
    "code_quality": [
      {
        "metric": "Code coverage",
        "target": "80%",
        "measurement": "Jest coverage report",
        "frequency": "Every commit"
      },
      {
        "metric": "Cyclomatic complexity",
        "target": "< 10 per function",
        "measurement": "ESLint complexity rule",
        "frequency": "Every commit"
      },
      {
        "metric": "Tech debt",
        "target": "< 5% codebase",
        "measurement": "SonarQube debt ratio",
        "frequency": "Weekly"
      }
    ],
    "test_effectiveness": [
      {
        "metric": "Defect detection rate",
        "target": "> 90% caught in testing",
        "measurement": "Bugs found in test vs prod",
        "frequency": "Monthly"
      },
      {
        "metric": "Test execution time",
        "target": "Unit: < 5min, E2E: < 1hr",
        "measurement": "CI pipeline duration",
        "frequency": "Daily"
      },
      {
        "metric": "Test flakiness",
        "target": "< 2% flaky tests",
        "measurement": "Failed test re-run success rate",
        "frequency": "Weekly"
      }
    ],
    "release_quality": [
      {
        "metric": "Production defects",
        "target": "< 3 per release",
        "measurement": "Bugs reported post-release",
        "frequency": "Per release"
      },
      {
        "metric": "Mean time to detection",
        "target": "< 24 hours",
        "measurement": "Time bug introduced to discovered",
        "frequency": "Per bug"
      },
      {
        "metric": "Mean time to resolution",
        "target": "< 48 hours for critical",
        "measurement": "Time bug reported to fixed",
        "frequency": "Per bug"
      }
    ]
  },
  "test_environments": [
    {
      "environment": "local",
      "purpose": "Developer testing",
      "setup": "Docker Compose",
      "data": "Small seed dataset",
      "refresh": "On demand"
    },
    {
      "environment": "ci",
      "purpose": "Automated test execution",
      "setup": "GitHub Actions",
      "data": "Test fixtures",
      "refresh": "Every test run"
    },
    {
      "environment": "staging",
      "purpose": "Pre-production validation",
      "setup": "Kubernetes cluster",
      "data": "Sanitized production copy",
      "refresh": "Weekly"
    },
    {
      "environment": "qa",
      "purpose": "Manual exploratory testing",
      "setup": "Kubernetes cluster",
      "data": "Curated test scenarios",
      "refresh": "Daily"
    }
  ],
  "defect_management": {
    "bug_tracking_tool": "Jira",
    "workflow": [
      {
        "status": "Open",
        "description": "Bug reported",
        "next_actions": ["Triage", "Assign priority"]
      },
      {
        "status": "In Progress",
        "description": "Developer working on fix",
        "next_actions": ["Code fix", "Write test"]
      },
      {
        "status": "Code Review",
        "description": "Fix under review",
        "next_actions": ["Approve", "Request changes"]
      },
      {
        "status": "Testing",
        "description": "QA verifying fix",
        "next_actions": ["Verify fixed", "Reopen if not fixed"]
      },
      {
        "status": "Closed",
        "description": "Fix verified and deployed",
        "next_actions": ["None"]
      }
    ],
    "severity_levels": [
      {
        "severity": "Critical",
        "description": "System down or data loss",
        "sla": "Fix within 4 hours",
        "priority": 1
      },
      {
        "severity": "High",
        "description": "Major feature broken",
        "sla": "Fix within 24 hours",
        "priority": 2
      },
      {
        "severity": "Medium",
        "description": "Minor feature issue",
        "sla": "Fix within 1 week",
        "priority": 3
      },
      {
        "severity": "Low",
        "description": "Cosmetic issue",
        "sla": "Fix in next release",
        "priority": 4
      }
    ],
    "bug_template": {
      "title": "Short, descriptive title",
      "environment": "Where bug found",
      "steps_to_reproduce": ["Step 1", "Step 2"],
      "expected_behavior": "What should happen",
      "actual_behavior": "What actually happens",
      "screenshots": "Visual evidence",
      "severity": "Critical|High|Medium|Low"
    }
  },
  "testing_timeline": [
    {
      "phase": "Development",
      "testing_activities": [
        "Unit tests written with code",
        "Integration tests for new features",
        "Code review includes test review"
      ],
      "duration": "Ongoing"
    },
    {
      "phase": "Feature Complete",
      "testing_activities": [
        "Full regression test suite",
        "E2E test scenarios",
        "Exploratory testing"
      ],
      "duration": "3 days"
    },
    {
      "phase": "Pre-Release",
      "testing_activities": [
        "Performance testing",
        "Security scanning",
        "User acceptance testing"
      ],
      "duration": "2 days"
    }
  ],
  "recommendations": [
    {
      "recommendation": "Implement shift-left testing",
      "rationale": "Catch bugs earlier when they're cheaper to fix",
      "implementation": "Developers write tests before code (TDD)",
      "priority": "high"
    },
    {
      "recommendation": "Automate regression tests",
      "rationale": "Fast feedback, consistent execution",
      "implementation": "Target 80% automation of regression suite",
      "priority": "high"
    },
    {
      "recommendation": "Set up continuous testing in CI/CD",
      "rationale": "Prevent broken code from reaching production",
      "implementation": "All tests run automatically on every commit",
      "priority": "critical"
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are a QA engineering expert specializing in:
- Comprehensive test strategy and planning
- Test automation frameworks and best practices
- Performance and load testing
- Security testing and OWASP standards
- Quality metrics and KPIs
- CI/CD integration and continuous testing
- Test data management
- Defect lifecycle management

Create thorough, practical testing plans that:
- Cover all test types (unit, integration, e2e, performance, security)
- Are automation-first where appropriate
- Include specific, executable test cases
- Define clear success criteria and metrics
- Balance comprehensive coverage with execution efficiency
- Follow industry best practices`;
  }
}

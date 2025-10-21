import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Load Test Scenario
 */
interface LoadTestScenario {
  name: string;
  description: string;
  type: 'smoke' | 'load' | 'stress' | 'spike' | 'soak' | 'breakpoint';
  duration: number; // seconds
  virtualUsers: {
    min: number;
    max: number;
    rampUpTime: number; // seconds
  };
  thresholds: {
    metric: string;
    threshold: string;
    abortOnFail: boolean;
  }[];
  endpoints: string[];
}

/**
 * Performance Metric
 */
interface PerformanceMetric {
  endpoint: string;
  metric: 'response_time' | 'throughput' | 'error_rate' | 'latency';
  target: number;
  unit: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Load Test Script
 */
interface LoadTestScript {
  framework: 'k6' | 'Artillery' | 'JMeter' | 'Gatling';
  path: string;
  content: string;
  scenarios: string[];
  description: string;
}

/**
 * Performance Baseline
 */
interface PerformanceBaseline {
  endpoint: string;
  method: string;
  expectedResponseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  expectedThroughput: number; // requests per second
  maxErrorRate: number; // percentage
}

/**
 * Scalability Test
 */
interface ScalabilityTest {
  name: string;
  description: string;
  currentLoad: {
    users: number;
    rps: number; // requests per second
  };
  targetLoad: {
    users: number;
    rps: number;
  };
  scalingStrategy: string;
  estimatedResourceNeeds: {
    cpu: string;
    memory: string;
    storage: string;
  };
}

/**
 * Load Test Suite
 */
interface LoadTestSuite {
  summary: {
    totalScenarios: number;
    criticalEndpoints: number;
    estimatedDuration: number; // minutes
    framework: string;
    maxVirtualUsers: number;
  };
  scenarios: LoadTestScenario[];
  scripts: LoadTestScript[];
  performanceMetrics: PerformanceMetric[];
  performanceBaselines: PerformanceBaseline[];
  scalabilityTests: ScalabilityTest[];
  bottleneckAnalysis: {
    component: string;
    potentialBottleneck: string;
    mitigation: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }[];
  monitoringSetup: {
    metrics: string[];
    tools: string[];
    dashboards: string[];
    alerts: {
      metric: string;
      threshold: string;
      action: string;
    }[];
  };
  dependencies: {
    name: string;
    version: string;
    purpose: string;
  }[];
  setupInstructions: string[];
  ciIntegration: {
    platform: string;
    schedule: string;
    reportingFormat: string;
  };
}

/**
 * LoadTesterAgent
 *
 * Generates comprehensive load and performance tests including:
 * - Smoke tests (minimal load verification)
 * - Load tests (expected traffic patterns)
 * - Stress tests (breaking point identification)
 * - Spike tests (sudden traffic surge handling)
 * - Soak tests (memory leak detection)
 * - Scalability analysis
 * - Performance baseline establishment
 * - Bottleneck identification
 *
 * Uses modern load testing tools (k6, Artillery) and defines realistic
 * traffic patterns based on expected user behavior.
 *
 * Input: System architecture + API design + Target scale
 * Output: Complete load testing suite with performance baselines
 */
export class LoadTesterAgent extends BaseAgent {
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
        'Analyze system architecture and scale targets',
        'Design load test scenarios',
        'Generate performance test scripts',
        'Establish performance baselines and thresholds',
      ],
      estimatedTotalDurationMs: 14000, // ~14 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildLoadTestPrompt(input);

      this.logger.info('Invoking LLM for load test generation');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const testSuite = this.parseTestSuite(content);

      return {
        reasoning: `Generated ${testSuite.summary.totalScenarios} load test scenarios covering ${testSuite.summary.criticalEndpoints} critical endpoints with max ${testSuite.summary.maxVirtualUsers} virtual users.`,
        confidence: 0.85,
        intermediate: {
          testSuite,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for load test generation', { error });
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
        type: 'load-test-suite',
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

  private buildLoadTestPrompt(input: any): string {
    const { previousArtifacts, ideaSpec } = input;

    // Extract context
    const apiDesign = previousArtifacts?.find((a: any) => a.type === 'api-design')?.content;
    const systemArch = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;
    const infraPlan = previousArtifacts?.find((a: any) => a.type === 'infrastructure-plan')?.content;

    const targetUsers = ideaSpec?.successCriteria || [];
    const apiEndpoints = apiDesign?.resources?.slice(0, 5) || [];
    const targetCapacity = systemArch?.scalabilityDesign?.targetCapacity || {};

    return `You are a Senior Performance Engineer creating comprehensive load tests.

PROJECT CONTEXT:
Target Users: ${JSON.stringify(targetUsers)}
Architecture: ${systemArch?.overview?.architectureStyle || 'monolithic'}
Target Capacity: ${JSON.stringify(targetCapacity)}

API ENDPOINTS:
${apiEndpoints.map((r: any, i: number) => `
${i + 1}. ${r.name}: ${r.description || 'N/A'}
   Endpoints: ${r.endpoints?.slice(0, 3).map((e: any) => e.method + ' ' + e.path).join(', ') || 'N/A'}
`).join('\n')}

INFRASTRUCTURE:
Cloud Provider: ${infraPlan?.overview?.cloudProvider || 'AWS'}
Auto-scaling: ${infraPlan?.autoScaling?.enabled ? 'Enabled' : 'Disabled'}

TASK:
Create comprehensive load and performance tests. Your response MUST be valid JSON:

{
  "summary": {
    "totalScenarios": 6,
    "criticalEndpoints": 8,
    "estimatedDuration": 45,
    "framework": "k6",
    "maxVirtualUsers": 1000
  },
  "scenarios": [
    {
      "name": "Smoke Test",
      "description": "Verify system works under minimal load",
      "type": "smoke",
      "duration": 60,
      "virtualUsers": {
        "min": 1,
        "max": 5,
        "rampUpTime": 10
      },
      "thresholds": [
        {
          "metric": "http_req_duration",
          "threshold": "p(95) < 500",
          "abortOnFail": true
        },
        {
          "metric": "http_req_failed",
          "threshold": "rate < 0.01",
          "abortOnFail": true
        }
      ],
      "endpoints": ["/api/health", "/api/users"]
    },
    {
      "name": "Load Test - Normal Traffic",
      "description": "Simulate expected production load",
      "type": "load",
      "duration": 300,
      "virtualUsers": {
        "min": 50,
        "max": 200,
        "rampUpTime": 60
      },
      "thresholds": [
        {
          "metric": "http_req_duration",
          "threshold": "p(95) < 1000",
          "abortOnFail": false
        },
        {
          "metric": "http_req_failed",
          "threshold": "rate < 0.05",
          "abortOnFail": true
        }
      ],
      "endpoints": ["/api/users", "/api/tasks", "/api/projects"]
    },
    {
      "name": "Stress Test",
      "description": "Find breaking point of the system",
      "type": "stress",
      "duration": 600,
      "virtualUsers": {
        "min": 100,
        "max": 1000,
        "rampUpTime": 120
      },
      "thresholds": [
        {
          "metric": "http_req_duration",
          "threshold": "p(95) < 3000",
          "abortOnFail": false
        }
      ],
      "endpoints": ["/api/users", "/api/tasks"]
    }
  ],
  "scripts": [
    {
      "framework": "k6",
      "path": "load-tests/smoke-test.js",
      "content": "import http from 'k6/http';\\nimport { check, sleep } from 'k6';\\n\\nexport const options = {\\n  stages: [\\n    { duration: '10s', target: 5 },\\n    { duration: '40s', target: 5 },\\n    { duration: '10s', target: 0 },\\n  ],\\n  thresholds: {\\n    http_req_duration: ['p(95) < 500'],\\n    http_req_failed: ['rate < 0.01'],\\n  },\\n};\\n\\nexport default function () {\\n  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';\\n  \\n  // Health check\\n  let res = http.get(\`\${baseUrl}/api/health\`);\\n  check(res, {\\n    'status is 200': (r) => r.status === 200,\\n    'response time < 200ms': (r) => r.timings.duration < 200,\\n  });\\n  \\n  sleep(1);\\n}",
      "scenarios": ["Smoke Test"],
      "description": "Basic smoke test verifying system health"
    }
  ],
  "performanceMetrics": [
    {
      "endpoint": "/api/users",
      "metric": "response_time",
      "target": 200,
      "unit": "ms",
      "priority": "critical"
    },
    {
      "endpoint": "/api/tasks",
      "metric": "throughput",
      "target": 1000,
      "unit": "rps",
      "priority": "high"
    },
    {
      "endpoint": "/api/projects",
      "metric": "error_rate",
      "target": 1,
      "unit": "%",
      "priority": "critical"
    }
  ],
  "performanceBaselines": [
    {
      "endpoint": "/api/users",
      "method": "GET",
      "expectedResponseTime": {
        "p50": 100,
        "p95": 200,
        "p99": 500
      },
      "expectedThroughput": 500,
      "maxErrorRate": 1.0
    }
  ],
  "scalabilityTests": [
    {
      "name": "10x Scale Test",
      "description": "Validate system handles 10x current capacity",
      "currentLoad": {
        "users": 100,
        "rps": 500
      },
      "targetLoad": {
        "users": 1000,
        "rps": 5000
      },
      "scalingStrategy": "Horizontal pod autoscaling based on CPU/memory",
      "estimatedResourceNeeds": {
        "cpu": "8 cores",
        "memory": "16 GB",
        "storage": "100 GB"
      }
    }
  ],
  "bottleneckAnalysis": [
    {
      "component": "Database connection pool",
      "potentialBottleneck": "Limited connections under high load",
      "mitigation": "Increase pool size to 100, implement connection retry logic",
      "priority": "high"
    },
    {
      "component": "API rate limiting",
      "potentialBottleneck": "Rate limits too restrictive for legitimate traffic",
      "mitigation": "Implement tiered rate limits based on user plan",
      "priority": "medium"
    }
  ],
  "monitoringSetup": {
    "metrics": ["CPU usage", "Memory usage", "Request latency", "Error rate", "Throughput"],
    "tools": ["Prometheus", "Grafana", "New Relic"],
    "dashboards": ["Application Performance", "Infrastructure Health", "User Experience"],
    "alerts": [
      {
        "metric": "Error rate > 5%",
        "threshold": "5% for 5 minutes",
        "action": "Page on-call engineer"
      },
      {
        "metric": "P95 latency > 2s",
        "threshold": "2s for 10 minutes",
        "action": "Create incident ticket"
      }
    ]
  },
  "dependencies": [
    {
      "name": "k6",
      "version": "^0.47.0",
      "purpose": "Load testing framework"
    },
    {
      "name": "grafana",
      "version": "^10.0.0",
      "purpose": "Metrics visualization"
    }
  ],
  "setupInstructions": [
    "Install k6: brew install k6 (macOS) or apt-get install k6 (Linux)",
    "Configure environment variables (BASE_URL, API_KEY)",
    "Run smoke test: k6 run load-tests/smoke-test.js",
    "Run full test suite: k6 run --out json=results.json load-tests/all.js"
  ],
  "ciIntegration": {
    "platform": "GitHub Actions",
    "schedule": "Nightly on main branch",
    "reportingFormat": "JSON + HTML dashboard"
  }
}

REQUIREMENTS:
- Generate 5-8 load test scenarios (smoke, load, stress, spike, soak)
- Create realistic traffic patterns based on expected user behavior
- Set appropriate thresholds for:
  - Response time (p50, p95, p99)
  - Error rate (< 1% for critical endpoints)
  - Throughput (requests per second)
- Include ramp-up and ramp-down periods
- Use k6 as the testing framework
- Write actual, runnable test scripts
- Define performance baselines for all critical endpoints
- Identify potential bottlenecks
- Include monitoring and alerting recommendations
- Consider scalability from current to target capacity

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parseTestSuite(text: string): LoadTestSuite {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as LoadTestSuite;
    } catch (error) {
      this.logger.error('Failed to parse load test suite', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback load test suite');

    const testSuite: LoadTestSuite = {
      summary: {
        totalScenarios: 2,
        criticalEndpoints: 3,
        estimatedDuration: 15,
        framework: 'k6',
        maxVirtualUsers: 50,
      },
      scenarios: [
        {
          name: 'Basic Smoke Test',
          description: 'Minimal load verification',
          type: 'smoke',
          duration: 60,
          virtualUsers: {
            min: 1,
            max: 5,
            rampUpTime: 10,
          },
          thresholds: [
            {
              metric: 'http_req_duration',
              threshold: 'p(95) < 1000',
              abortOnFail: true,
            },
          ],
          endpoints: ['/api/health'],
        },
      ],
      scripts: [
        {
          framework: 'k6',
          path: 'load-tests/smoke.js',
          content: `import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 5 },
  ],
};

export default function () {
  http.get('http://localhost:3000/api/health');
}`,
          scenarios: ['Basic Smoke Test'],
          description: 'Basic smoke test',
        },
      ],
      performanceMetrics: [
        {
          endpoint: '/api/health',
          metric: 'response_time',
          target: 100,
          unit: 'ms',
          priority: 'critical',
        },
      ],
      performanceBaselines: [
        {
          endpoint: '/api/health',
          method: 'GET',
          expectedResponseTime: {
            p50: 50,
            p95: 100,
            p99: 200,
          },
          expectedThroughput: 100,
          maxErrorRate: 1.0,
        },
      ],
      scalabilityTests: [],
      bottleneckAnalysis: [],
      monitoringSetup: {
        metrics: ['Response time', 'Error rate'],
        tools: ['k6'],
        dashboards: ['Basic metrics'],
        alerts: [],
      },
      dependencies: [
        {
          name: 'k6',
          version: '^0.47.0',
          purpose: 'Load testing',
        },
      ],
      setupInstructions: [
        'Install k6',
        'Run: k6 run load-tests/smoke.js',
      ],
      ciIntegration: {
        platform: 'GitHub Actions',
        schedule: 'Manual',
        reportingFormat: 'JSON',
      },
    };

    return {
      reasoning: 'Using fallback load test suite as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        testSuite,
      },
    };
  }
}

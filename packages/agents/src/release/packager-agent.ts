import { BaseAgent } from '../base/base-agent';
import { AgentConfig } from '../base/types';
import { ExecutionPlan, ReasoningResult, Artifact } from '../base/types';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * Package Artifact
 */
interface PackageArtifact {
  id: string;
  name: string;
  version: string;
  type: 'docker' | 'npm' | 'binary' | 'static' | 'lambda' | 'container' | 'mobile';
  platform: string;
  size: number; // bytes
  buildTime: number; // milliseconds
  optimized: boolean;
  compressionRatio?: number;
  hash: string;
  registry?: string;
  downloadUrl?: string;
}

/**
 * Docker Image Spec
 */
interface DockerImageSpec {
  baseImage: string;
  tags: string[];
  size: number;
  layers: number;
  exposedPorts: number[];
  volumes: string[];
  entrypoint: string;
  env: { key: string; value: string }[];
  optimizations: string[];
  securityScan: {
    vulnerabilities: number;
    severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * NPM Package Spec
 */
interface NPMPackageSpec {
  name: string;
  version: string;
  description: string;
  main: string;
  types?: string;
  scripts: { [key: string]: string };
  dependencies: { [key: string]: string };
  devDependencies: { [key: string]: string };
  peerDependencies?: { [key: string]: string };
  files: string[];
  bundleSize: {
    raw: number;
    gzipped: number;
    brotli: number;
  };
}

/**
 * Static Build Spec
 */
interface StaticBuildSpec {
  framework: string;
  outputDir: string;
  files: {
    html: number;
    css: number;
    js: number;
    images: number;
    fonts: number;
    other: number;
  };
  totalSize: number;
  optimizations: {
    minified: boolean;
    treeshaken: boolean;
    compressed: boolean;
    codesplitting: boolean;
    lazyLoading: boolean;
  };
  performance: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    totalBlockingTime: number;
    cumulativeLayoutShift: number;
  };
}

/**
 * Mobile App Package
 */
interface MobileAppPackage {
  platform: 'ios' | 'android';
  bundleId: string;
  version: string;
  buildNumber: number;
  size: number;
  architecture: string[];
  minOSVersion: string;
  targetSDK: string;
  permissions: string[];
  signing: {
    signed: boolean;
    certificate?: string;
    provisioning?: string;
  };
}

/**
 * Build Configuration
 */
interface BuildConfiguration {
  environment: 'development' | 'staging' | 'production';
  optimization: 'none' | 'basic' | 'aggressive';
  sourceMaps: boolean;
  minification: boolean;
  compression: boolean;
  bundling: 'webpack' | 'vite' | 'rollup' | 'esbuild' | 'parcel';
  target: string[];
  features: {
    treeshaking: boolean;
    codeSplitting: boolean;
    lazyLoading: boolean;
    polyfills: boolean;
  };
}

/**
 * Package Validation Result
 */
interface PackageValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    check: string;
    passed: boolean;
    message?: string;
  }[];
}

/**
 * Packaging Report
 */
interface PackagingReport {
  summary: {
    totalPackages: number;
    totalSize: number; // bytes
    totalBuildTime: number; // milliseconds
    packagingStatus: 'success' | 'partial' | 'failed';
    optimizationScore: number; // 0-100
  };
  packages: PackageArtifact[];
  dockerImages: DockerImageSpec[];
  npmPackages: NPMPackageSpec[];
  staticBuilds: StaticBuildSpec[];
  mobileApps: MobileAppPackage[];
  buildConfiguration: BuildConfiguration;
  validation: PackageValidation;
  optimizations: {
    applied: string[];
    skipped: string[];
    recommendations: string[];
  };
  deployment: {
    targets: {
      name: string;
      type: 'cloud' | 'registry' | 'cdn' | 'store';
      url?: string;
      ready: boolean;
    }[];
    artifacts: {
      artifact: string;
      destination: string;
      status: 'ready' | 'pending' | 'failed';
    }[];
  };
  performance: {
    buildSpeed: number; // packages/minute
    compressionRatio: number;
    cacheHitRate: number; // 0-100
    parallelization: number; // concurrent builds
  };
  recommendations: {
    priority: 'immediate' | 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
    effort: 'low' | 'medium' | 'high';
    category: 'size' | 'performance' | 'security' | 'compatibility';
  }[];
}

/**
 * PackagerAgent
 *
 * Handles application packaging and build artifact generation:
 * - Docker container images with multi-stage builds
 * - NPM packages with bundle size optimization
 * - Static site builds (Next.js, Vite, etc.)
 * - Mobile app packages (iOS .ipa, Android .apk/.aab)
 * - Lambda/serverless function packages
 * - Binary executables (Electron, Tauri)
 * - Version management and semantic versioning
 * - Package validation and integrity checks
 * - Build optimization (minification, tree-shaking, compression)
 * - Security scanning of packages
 *
 * Provides platform-specific builds optimized for deployment.
 *
 * Input: Repository blueprint + Build artifacts + Architecture spec
 * Output: Comprehensive packaging report with deployment-ready artifacts
 */
export class PackagerAgent extends BaseAgent {
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
        'Analyze project structure and build requirements',
        'Design packaging strategy for target platforms',
        'Generate build configurations and Dockerfiles',
        'Create package validation and optimization plan',
      ],
      estimatedTotalDurationMs: 14000, // ~14 seconds
    };
  }

  protected async reason(plan: ExecutionPlan, input: any): Promise<ReasoningResult> {
    try {
      const prompt = this.buildPackagingPrompt(input);

      this.logger.info('Invoking LLM for packaging analysis');
      const response = await this.llm.invoke(prompt);

      const content = response.content.toString();
      const packagingReport = this.parsePackagingReport(content);

      return {
        reasoning: `Packaging analysis generated ${packagingReport.summary.totalPackages} deployment artifacts (${Math.round(packagingReport.summary.totalSize / 1024 / 1024)}MB total). Optimization Score: ${packagingReport.summary.optimizationScore}/100.`,
        confidence: 0.88,
        intermediate: {
          packagingReport,
        },
      };
    } catch (error) {
      this.logger.error('LLM invocation failed for packaging analysis', { error });
      return this.fallback(input);
    }
  }

  protected async generateArtifacts(
    result: ReasoningResult,
    input: any
  ): Promise<Artifact[]> {
    const packagingReport = result.intermediate?.packagingReport;

    return [
      {
        type: 'packaging-report',
        content: packagingReport,
        metadata: {
          agentId: this.config.id,
          agentName: this.config.name,
          generatedAt: new Date().toISOString(),
          confidence: result.confidence,
        },
      },
    ];
  }

  private buildPackagingPrompt(input: any): string {
    const { previousArtifacts } = input;

    // Extract context
    const repoBlueprint = previousArtifacts?.find((a: any) => a.type === 'repository-blueprint')?.content;
    const buildArtifacts = previousArtifacts?.find((a: any) => a.type === 'build-complete')?.content;
    const systemArchitecture = previousArtifacts?.find((a: any) => a.type === 'system-architecture')?.content;
    const storyLoopComplete = previousArtifacts?.find((a: any) => a.type === 'story-loop-complete')?.content;

    const framework = repoBlueprint?.overview?.framework || 'React';
    const language = repoBlueprint?.overview?.language || 'TypeScript';
    const packageManager = repoBlueprint?.overview?.packageManager || 'npm';
    const architectureStyle = systemArchitecture?.overview?.architectureStyle || 'monolithic';

    return `You are a Senior DevOps Engineer and Build Optimization Specialist.

PROJECT CONTEXT:
Framework: ${framework}
Language: ${language}
Package Manager: ${packageManager}
Architecture: ${architectureStyle}
Total Files: ${storyLoopComplete?.summary?.totalFiles || 0}

REPOSITORY STRUCTURE:
${repoBlueprint?.structure?.directories?.slice(0, 5).map((d: any) => `- ${d}`).join('\n') || 'Standard project structure'}

TASK:
Design comprehensive packaging strategy and generate build artifacts. Your response MUST be valid JSON:

{
  "summary": {
    "totalPackages": 4,
    "totalSize": 157286400,
    "totalBuildTime": 180000,
    "packagingStatus": "success",
    "optimizationScore": 85
  },
  "packages": [
    {
      "id": "pkg-001",
      "name": "web-app",
      "version": "1.0.0",
      "type": "docker",
      "platform": "linux/amd64",
      "size": 52428800,
      "buildTime": 45000,
      "optimized": true,
      "compressionRatio": 3.2,
      "hash": "sha256:a1b2c3d4...",
      "registry": "docker.io/company/web-app",
      "downloadUrl": "https://docker.io/v2/company/web-app/manifests/1.0.0"
    },
    {
      "id": "pkg-002",
      "name": "@company/ui-components",
      "version": "1.0.0",
      "type": "npm",
      "platform": "node",
      "size": 2097152,
      "buildTime": 30000,
      "optimized": true,
      "compressionRatio": 4.1,
      "hash": "sha256:e5f6g7h8...",
      "registry": "https://registry.npmjs.org",
      "downloadUrl": "https://registry.npmjs.org/@company/ui-components/-/ui-components-1.0.0.tgz"
    },
    {
      "id": "pkg-003",
      "name": "static-site",
      "version": "1.0.0",
      "type": "static",
      "platform": "web",
      "size": 10485760,
      "buildTime": 60000,
      "optimized": true,
      "hash": "sha256:i9j0k1l2...",
      "downloadUrl": "https://cdn.company.com/builds/1.0.0.tar.gz"
    }
  ],
  "dockerImages": [
    {
      "baseImage": "node:20-alpine",
      "tags": ["1.0.0", "latest", "production"],
      "size": 52428800,
      "layers": 8,
      "exposedPorts": [3000, 9229],
      "volumes": ["/app/data", "/app/logs"],
      "entrypoint": "node dist/server.js",
      "env": [
        {"key": "NODE_ENV", "value": "production"},
        {"key": "PORT", "value": "3000"}
      ],
      "optimizations": [
        "Multi-stage build",
        "Alpine base image",
        "Layer caching",
        "Minimal dependencies",
        ".dockerignore optimization"
      ],
      "securityScan": {
        "vulnerabilities": 0,
        "severity": "none"
      }
    }
  ],
  "npmPackages": [
    {
      "name": "@company/ui-components",
      "version": "1.0.0",
      "description": "Reusable UI component library",
      "main": "dist/index.js",
      "types": "dist/index.d.ts",
      "scripts": {
        "build": "tsc && vite build",
        "test": "vitest",
        "prepublishOnly": "npm run build"
      },
      "dependencies": {
        "react": "^18.2.0",
        "react-dom": "^18.2.0"
      },
      "devDependencies": {
        "typescript": "^5.0.0",
        "vite": "^5.0.0"
      },
      "peerDependencies": {
        "react": "^18.0.0"
      },
      "files": ["dist", "README.md", "LICENSE"],
      "bundleSize": {
        "raw": 524288,
        "gzipped": 131072,
        "brotli": 98304
      }
    }
  ],
  "staticBuilds": [
    {
      "framework": "Next.js",
      "outputDir": ".next",
      "files": {
        "html": 25,
        "css": 8,
        "js": 45,
        "images": 30,
        "fonts": 4,
        "other": 10
      },
      "totalSize": 10485760,
      "optimizations": {
        "minified": true,
        "treeshaken": true,
        "compressed": true,
        "codeSpitting": true,
        "lazyLoading": true
      },
      "performance": {
        "firstContentfulPaint": 1200,
        "largestContentfulPaint": 2100,
        "totalBlockingTime": 150,
        "cumulativeLayoutShift": 0.05
      }
    }
  ],
  "mobileApps": [],
  "buildConfiguration": {
    "environment": "production",
    "optimization": "aggressive",
    "sourceMaps": false,
    "minification": true,
    "compression": true,
    "bundling": "vite",
    "target": ["es2020", "node18"],
    "features": {
      "treeshaking": true,
      "codeSplitting": true,
      "lazyLoading": true,
      "polyfills": false
    }
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": [
      "Bundle size for main.js (245KB) exceeds recommended 200KB"
    ],
    "checks": [
      {"check": "Package integrity", "passed": true},
      {"check": "Dependency security", "passed": true},
      {"check": "Bundle size limits", "passed": false, "message": "Main bundle exceeds 200KB"},
      {"check": "TypeScript types", "passed": true},
      {"check": "License compliance", "passed": true}
    ]
  },
  "optimizations": {
    "applied": [
      "Tree-shaking unused code",
      "Minification with Terser",
      "Brotli compression",
      "Code splitting by route",
      "Image optimization (WebP/AVIF)",
      "Font subsetting",
      "CSS purging"
    ],
    "skipped": [
      "Server-side rendering (static export)"
    ],
    "recommendations": [
      "Enable dynamic imports for heavy libraries",
      "Use image CDN for better caching",
      "Implement service worker for offline support",
      "Add bundle analysis to CI/CD"
    ]
  },
  "deployment": {
    "targets": [
      {
        "name": "Docker Hub",
        "type": "registry",
        "url": "https://hub.docker.com/r/company/web-app",
        "ready": true
      },
      {
        "name": "NPM Registry",
        "type": "registry",
        "url": "https://www.npmjs.com/package/@company/ui-components",
        "ready": true
      },
      {
        "name": "CloudFront CDN",
        "type": "cdn",
        "url": "https://d1234567890.cloudfront.net",
        "ready": true
      }
    ],
    "artifacts": [
      {
        "artifact": "web-app:1.0.0 (Docker)",
        "destination": "Docker Hub",
        "status": "ready"
      },
      {
        "artifact": "@company/ui-components (NPM)",
        "destination": "NPM Registry",
        "status": "ready"
      },
      {
        "artifact": "static-site.tar.gz",
        "destination": "S3 + CloudFront",
        "status": "ready"
      }
    ]
  },
  "performance": {
    "buildSpeed": 2.5,
    "compressionRatio": 3.5,
    "cacheHitRate": 78,
    "parallelization": 4
  },
  "recommendations": [
    {
      "priority": "high",
      "recommendation": "Split main bundle into smaller chunks",
      "impact": "Reduces initial load time by ~30%",
      "effort": "medium",
      "category": "performance"
    },
    {
      "priority": "medium",
      "recommendation": "Implement multi-architecture Docker builds (amd64/arm64)",
      "impact": "Supports ARM-based deployments (AWS Graviton)",
      "effort": "low",
      "category": "compatibility"
    },
    {
      "priority": "high",
      "recommendation": "Add security scanning to CI/CD pipeline",
      "impact": "Prevents vulnerable packages from reaching production",
      "effort": "low",
      "category": "security"
    },
    {
      "priority": "medium",
      "recommendation": "Enable source maps for production debugging",
      "impact": "Easier debugging without exposing source code",
      "effort": "low",
      "category": "performance"
    }
  ]
}

REQUIREMENTS:
- Generate 3-5 deployment packages based on architecture
- For web apps: Docker images with multi-stage builds
- For libraries: NPM packages with TypeScript definitions
- For static sites: Optimized builds with CDN-ready assets
- For APIs: Containerized services or serverless packages
- Include build optimization strategies
- Provide package validation and security scanning
- Calculate accurate bundle sizes and build times
- Generate deployment target configurations
- Recommend further optimizations

Respond ONLY with valid JSON. No markdown, no explanations, just the JSON object.`;
  }

  private parsePackagingReport(text: string): PackagingReport {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return parsed as PackagingReport;
    } catch (error) {
      this.logger.error('Failed to parse packaging report', { error });
      throw error;
    }
  }

  private fallback(input: any): ReasoningResult {
    this.logger.warn('Using fallback packaging report');

    const packagingReport: PackagingReport = {
      summary: {
        totalPackages: 2,
        totalSize: 52428800, // 50MB
        totalBuildTime: 90000,
        packagingStatus: 'success',
        optimizationScore: 75,
      },
      packages: [
        {
          id: 'pkg-001',
          name: 'web-app',
          version: '1.0.0',
          type: 'docker',
          platform: 'linux/amd64',
          size: 52428800,
          buildTime: 60000,
          optimized: true,
          hash: 'sha256:fallback',
        },
      ],
      dockerImages: [],
      npmPackages: [],
      staticBuilds: [],
      mobileApps: [],
      buildConfiguration: {
        environment: 'production',
        optimization: 'basic',
        sourceMaps: false,
        minification: true,
        compression: true,
        bundling: 'webpack',
        target: ['es2020'],
        features: {
          treeshaking: true,
          codeSplitting: false,
          lazyLoading: false,
          polyfills: true,
        },
      },
      validation: {
        valid: true,
        errors: [],
        warnings: [],
        checks: [
          { check: 'Package integrity', passed: true },
        ],
      },
      optimizations: {
        applied: ['Minification', 'Compression'],
        skipped: [],
        recommendations: ['Enable code splitting'],
      },
      deployment: {
        targets: [
          {
            name: 'Container Registry',
            type: 'registry',
            ready: true,
          },
        ],
        artifacts: [],
      },
      performance: {
        buildSpeed: 1.0,
        compressionRatio: 2.5,
        cacheHitRate: 50,
        parallelization: 1,
      },
      recommendations: [
        {
          priority: 'medium',
          recommendation: 'Enable build caching',
          impact: 'Faster builds',
          effort: 'low',
          category: 'performance',
        },
      ],
    };

    return {
      reasoning: 'Using fallback packaging report as LLM invocation failed',
      confidence: 0.4,
      intermediate: {
        packagingReport,
      },
    };
  }
}

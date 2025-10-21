import { registry } from './agent-registry';
import { IntakeAgent } from './implementations/intake-agent';
import { IdeationAgent } from './implementations/ideation-agent';
import { CritiqueAgent } from './implementations/critique-agent';
import { PRDWriterAgent } from './implementations/prd-writer-agent';
import { StoryCutterAgent } from './implementations/story-cutter-agent';
import { BizDevAgent } from './implementations/bizdev-agent';
import { ArchitectureAgent } from './implementations/architecture-agent';
import { BuildAgent } from './implementations/build-agent';
import { SecurityAgent } from './implementations/security-agent';
import { QAAgent } from './implementations/qa-agent';
import { AestheticAgent } from './implementations/aesthetic-agent';
import { ReleaseAgent } from './implementations/release-agent';
import { BetaAgent } from './implementations/beta-agent';

export function registerAllAgents(): void {
  // Intake Phase
  registry.register(
    {
      name: 'IntakeAgent',
      description: 'Structures raw ideas into clear, actionable intake documents',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 20000,
        maxOutputSize: 40000,
      },
      tags: ['intake', 'structure', 'clarification'],
      phases: ['intake'],
    },
    (apiKey: string, config?: any) => new IntakeAgent(apiKey, config?.model)
  );

  // Ideation Phase
  registry.register(
    {
      name: 'IdeationAgent',
      description: 'Generates creative variations and enhancements for ideas',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: true,
        supportsCheckpointing: true,
        maxInputSize: 40000,
        maxOutputSize: 80000,
      },
      tags: ['ideation', 'creativity', 'variations'],
      phases: ['ideation'],
    },
    (apiKey: string, config?: any) => new IdeationAgent(apiKey, config?.model)
  );

  // Critique Phase
  registry.register(
    {
      name: 'CritiqueAgent',
      description: 'Evaluates ideas for feasibility, risks, and quality',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: true,
        supportsCheckpointing: true,
        maxInputSize: 60000,
        maxOutputSize: 80000,
      },
      tags: ['critique', 'evaluation', 'risk-assessment'],
      phases: ['critique'],
    },
    (apiKey: string, config?: any) => new CritiqueAgent(apiKey, config?.model)
  );

  // PRD Phase
  registry.register(
    {
      name: 'PRDWriterAgent',
      description: 'Writes comprehensive Product Requirements Documents',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 50000,
        maxOutputSize: 100000,
      },
      tags: ['prd', 'requirements', 'documentation'],
      phases: ['prd'],
    },
    (apiKey: string, config?: any) => new PRDWriterAgent(apiKey, config?.model)
  );

  registry.register(
    {
      name: 'StoryCutterAgent',
      description: 'Breaks down requirements into user stories',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: true,
        supportsCheckpointing: true,
        maxInputSize: 30000,
        maxOutputSize: 50000,
      },
      tags: ['stories', 'agile', 'planning'],
      phases: ['prd', 'ideation'],
    },
    (apiKey: string, config?: any) => new StoryCutterAgent(apiKey, config?.model)
  );

  // BizDev Phase
  registry.register(
    {
      name: 'BizDevAgent',
      description: 'Creates comprehensive business development and go-to-market strategies',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 70000,
        maxOutputSize: 100000,
      },
      tags: ['bizdev', 'gtm', 'business-strategy', 'monetization'],
      phases: ['bizdev'],
    },
    (apiKey: string, config?: any) => new BizDevAgent(apiKey, config?.model)
  );

  // Architecture Phase
  registry.register(
    {
      name: 'ArchitectureAgent',
      description: 'Designs comprehensive technical architecture',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 80000,
        maxOutputSize: 120000,
      },
      tags: ['architecture', 'system-design', 'technical'],
      phases: ['architecture'],
    },
    (apiKey: string, config?: any) => new ArchitectureAgent(apiKey, config?.model)
  );

  // Build Phase
  registry.register(
    {
      name: 'BuildAgent',
      description: 'Generates implementation plans and production-ready code',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: true,
        supportsBatching: true,
        supportsCheckpointing: true,
        maxInputSize: 100000,
        maxOutputSize: 150000,
      },
      tags: ['build', 'code-generation', 'implementation', 'scaffolding'],
      phases: ['build'],
    },
    (apiKey: string, config?: any) => new BuildAgent(apiKey, config?.model)
  );

  // Security Phase
  registry.register(
    {
      name: 'SecurityAgent',
      description: 'Performs comprehensive security analysis and threat modeling',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 80000,
        maxOutputSize: 100000,
      },
      tags: ['security', 'threat-modeling', 'compliance', 'vulnerability'],
      phases: ['security'],
    },
    (apiKey: string, config?: any) => new SecurityAgent(apiKey, config?.model)
  );

  // QA Phase
  registry.register(
    {
      name: 'QAAgent',
      description: 'Creates comprehensive quality assurance and testing strategies',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: true,
        supportsCheckpointing: true,
        maxInputSize: 90000,
        maxOutputSize: 110000,
      },
      tags: ['qa', 'testing', 'quality-assurance', 'test-strategy'],
      phases: ['qa'],
    },
    (apiKey: string, config?: any) => new QAAgent(apiKey, config?.model)
  );

  // Aesthetic Phase
  registry.register(
    {
      name: 'AestheticAgent',
      description: 'Provides UX/UI review and design recommendations',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: true,
        supportsCheckpointing: true,
        maxInputSize: 70000,
        maxOutputSize: 90000,
      },
      tags: ['ux', 'ui', 'design', 'accessibility', 'aesthetic'],
      phases: ['aesthetic'],
    },
    (apiKey: string, config?: any) => new AestheticAgent(apiKey, config?.model)
  );

  // Release Phase
  registry.register(
    {
      name: 'ReleaseAgent',
      description: 'Creates deployment and release plans with rollback procedures',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 80000,
        maxOutputSize: 100000,
      },
      tags: ['release', 'deployment', 'devops', 'rollback'],
      phases: ['release'],
    },
    (apiKey: string, config?: any) => new ReleaseAgent(apiKey, config?.model)
  );

  // Beta Phase
  registry.register(
    {
      name: 'BetaAgent',
      description: 'Designs beta testing programs and feedback collection strategies',
      version: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsBatching: false,
        supportsCheckpointing: true,
        maxInputSize: 70000,
        maxOutputSize: 90000,
      },
      tags: ['beta', 'user-testing', 'feedback', 'community'],
      phases: ['beta'],
    },
    (apiKey: string, config?: any) => new BetaAgent(apiKey, config?.model)
  );
}

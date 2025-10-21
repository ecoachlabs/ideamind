/**
 * Init Command
 *
 * Scaffolds a new IdeaMine project with configuration, templates, and directory structure.
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

export interface InitOptions {
  preset?: 'standard' | 'minimal' | 'enterprise' | 'playground';
  name?: string;
  directory?: string;
  typescript?: boolean;
  git?: boolean;
  install?: boolean;
  verbose?: boolean;
}

interface ProjectTemplate {
  files: Record<string, string>;
  directories: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

const DEFAULT_OPTIONS: InitOptions = {
  preset: 'standard',
  typescript: true,
  git: true,
  install: true,
  verbose: false,
};

/**
 * Initialize a new IdeaMine project
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const projectName = config.name || 'my-ideamine-project';
  const projectDir = path.resolve(config.directory || projectName);

  if (config.verbose) {
    console.log('IdeaMine CLI - Project Initialization');
    console.log('=====================================');
    console.log(`Project: ${projectName}`);
    console.log(`Directory: ${projectDir}`);
    console.log(`Preset: ${config.preset}`);
    console.log('');
  }

  try {
    // Step 1: Check if directory exists
    await checkDirectory(projectDir, config.verbose);

    // Step 2: Create project structure
    console.log('📁 Creating project structure...');
    await createProjectStructure(projectDir, config);

    // Step 3: Generate configuration files
    console.log('⚙️  Generating configuration files...');
    const template = getProjectTemplate(config.preset!, projectName);
    await generateConfigFiles(projectDir, template, config);

    // Step 4: Initialize git repository
    if (config.git) {
      console.log('🔧 Initializing git repository...');
      await initializeGit(projectDir, config.verbose);
    }

    // Step 5: Install dependencies
    if (config.install) {
      console.log('📦 Installing dependencies...');
      await installDependencies(projectDir, config.verbose);
    }

    console.log('');
    console.log('✅ Project initialized successfully!');
    console.log('');
    console.log('Next steps:');
    console.log(`  cd ${projectName}`);
    if (!config.install) {
      console.log('  npm install');
    }
    console.log('  npm run dev');
    console.log('');
    console.log('To run your first workflow:');
    console.log('  ideamine run "Build a todo app"');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to initialize project:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Check if directory exists and is empty
 */
async function checkDirectory(dir: string, verbose?: boolean): Promise<void> {
  try {
    const stats = await fs.stat(dir);
    if (stats.isDirectory()) {
      const files = await fs.readdir(dir);
      if (files.length > 0) {
        throw new Error(`Directory ${dir} already exists and is not empty`);
      }
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Directory doesn't exist, which is good
      if (verbose) {
        console.log(`Creating directory: ${dir}`);
      }
      await fs.mkdir(dir, { recursive: true });
    } else {
      throw error;
    }
  }
}

/**
 * Create project directory structure
 */
async function createProjectStructure(
  projectDir: string,
  config: InitOptions
): Promise<void> {
  const directories = [
    'src',
    'src/agents',
    'src/tools',
    'src/workflows',
    'src/config',
    'tests',
    'tests/integration',
    'tests/unit',
    'docs',
    'artifacts',
    '.ideamine',
  ];

  if (config.preset === 'enterprise') {
    directories.push(
      'src/phases',
      'src/coordinators',
      'src/gates',
      'infrastructure',
      'scripts'
    );
  }

  for (const dir of directories) {
    const fullPath = path.join(projectDir, dir);
    await fs.mkdir(fullPath, { recursive: true });
  }
}

/**
 * Get project template based on preset
 */
function getProjectTemplate(preset: string, projectName: string): ProjectTemplate {
  const baseTemplate: ProjectTemplate = {
    files: {},
    directories: [],
    dependencies: {
      '@ideamine/orchestrator-core': '^1.0.0',
      '@ideamine/agent-sdk': '^1.0.0',
      '@ideamine/tool-sdk': '^1.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
      '@types/node': '^20.0.0',
      'ts-node': '^10.9.0',
      vitest: '^1.0.0',
    },
    scripts: {
      dev: 'ts-node src/index.ts',
      build: 'tsc',
      test: 'vitest',
      'test:watch': 'vitest --watch',
      lint: 'eslint src/**/*.ts',
      format: 'prettier --write src/**/*.ts',
    },
  };

  switch (preset) {
    case 'minimal':
      return {
        ...baseTemplate,
        dependencies: {
          '@ideamine/orchestrator-core': '^1.0.0',
        },
        scripts: {
          dev: 'ts-node src/index.ts',
          build: 'tsc',
        },
      };

    case 'enterprise':
      return {
        ...baseTemplate,
        dependencies: {
          ...baseTemplate.dependencies,
          '@ideamine/event-bus': '^1.0.0',
          '@ideamine/schemas': '^1.0.0',
          pg: '^8.11.0',
          pino: '^8.16.0',
        },
        devDependencies: {
          ...baseTemplate.devDependencies,
          '@types/pg': '^8.10.0',
          eslint: '^8.50.0',
          prettier: '^3.0.0',
        },
        scripts: {
          ...baseTemplate.scripts,
          'db:migrate': 'node scripts/migrate.js',
          'db:seed': 'node scripts/seed.js',
          docker: 'docker-compose up -d',
        },
      };

    case 'playground':
      return {
        ...baseTemplate,
        dependencies: {
          '@ideamine/orchestrator-core': '^1.0.0',
          '@ideamine/agent-sdk': '^1.0.0',
        },
        scripts: {
          dev: 'ts-node src/index.ts',
          playground: 'ts-node src/playground.ts',
        },
      };

    case 'standard':
    default:
      return baseTemplate;
  }
}

/**
 * Generate configuration files
 */
async function generateConfigFiles(
  projectDir: string,
  template: ProjectTemplate,
  config: InitOptions
): Promise<void> {
  const projectName = path.basename(projectDir);

  // package.json
  const packageJson = {
    name: projectName,
    version: '0.1.0',
    description: 'IdeaMine project',
    main: config.typescript ? 'dist/index.js' : 'src/index.js',
    scripts: template.scripts,
    dependencies: template.dependencies,
    devDependencies: template.devDependencies,
    engines: {
      node: '>=18.0.0',
    },
  };

  await fs.writeFile(
    path.join(projectDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // tsconfig.json (if TypeScript)
  if (config.typescript) {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', 'tests'],
    };

    await fs.writeFile(
      path.join(projectDir, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2)
    );
  }

  // .gitignore
  const gitignore = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IdeaMine
artifacts/
.ideamine/cache/
`;

  await fs.writeFile(path.join(projectDir, '.gitignore'), gitignore);

  // .env.example
  const envExample = `# IdeaMine Configuration
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Database (for enterprise preset)
DATABASE_URL=postgresql://localhost:5432/ideamine

# Optional
LOG_LEVEL=info
MAX_BUDGET=100
`;

  await fs.writeFile(path.join(projectDir, '.env.example'), envExample);

  // README.md
  const readme = `# ${projectName}

IdeaMine project initialized with the **${config.preset}** preset.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Copy environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. Configure your API keys in \`.env\`

4. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

## Running a Workflow

\`\`\`bash
ideamine run "Your idea here"
\`\`\`

## Project Structure

- \`src/\` - Source code
- \`src/agents/\` - Custom agents
- \`src/tools/\` - Custom tools
- \`src/workflows/\` - Workflow definitions
- \`tests/\` - Test files
- \`docs/\` - Documentation
- \`artifacts/\` - Generated artifacts

## Documentation

Visit [IdeaMine Documentation](https://docs.ideamine.dev) for more information.
`;

  await fs.writeFile(path.join(projectDir, 'README.md'), readme);

  // src/index.ts
  const indexContent = config.typescript
    ? `import { MothershipOrchestrator } from '@ideamine/orchestrator-core';

async function main() {
  console.log('🚀 IdeaMine Project');

  // Initialize orchestrator
  const orchestrator = new MothershipOrchestrator({
    budget: { maxCost: 10 },
  });

  console.log('Orchestrator initialized successfully!');

  // Example: Run a workflow
  // const result = await orchestrator.run({
  //   idea: 'Build a simple REST API',
  //   userId: 'user-1',
  //   projectId: 'project-1',
  // });

  // console.log('Workflow completed:', result);
}

main().catch(console.error);
`
    : `const { MothershipOrchestrator } = require('@ideamine/orchestrator-core');

async function main() {
  console.log('🚀 IdeaMine Project');

  const orchestrator = new MothershipOrchestrator({
    budget: { maxCost: 10 },
  });

  console.log('Orchestrator initialized successfully!');
}

main().catch(console.error);
`;

  await fs.writeFile(
    path.join(projectDir, `src/index.${config.typescript ? 'ts' : 'js'}`),
    indexContent
  );

  // .ideamine/config.yaml
  const ideamineConfig = `# IdeaMine Configuration
version: 1.0

# Orchestrator settings
orchestrator:
  budget:
    maxCost: 100
    warningThreshold: 0.8

  phases:
    - intake
    - ideation
    - critique
    - bizdev
    - prd
    - architecture
    - qa
    - aesthetic
    - beta
    - release

# Model routing
models:
  default: gpt-4-turbo
  critique: claude-3-opus
  architecture: gpt-4-turbo

# Tool registry
tools:
  enabled:
    - claim-miner
    - source-tagger
    - contradiction-scan
    - quant-sanity
    - citation-check

# Logging
logging:
  level: info
  format: json
`;

  await fs.writeFile(path.join(projectDir, '.ideamine/config.yaml'), ideamineConfig);
}

/**
 * Initialize git repository
 */
async function initializeGit(projectDir: string, verbose?: boolean): Promise<void> {
  try {
    execSync('git init', { cwd: projectDir, stdio: verbose ? 'inherit' : 'ignore' });
    execSync('git add .', { cwd: projectDir, stdio: verbose ? 'inherit' : 'ignore' });
    execSync('git commit -m "Initial commit from IdeaMine CLI"', {
      cwd: projectDir,
      stdio: verbose ? 'inherit' : 'ignore',
    });
  } catch (error) {
    console.warn('⚠️  Git initialization failed (git may not be installed)');
  }
}

/**
 * Install npm dependencies
 */
async function installDependencies(projectDir: string, verbose?: boolean): Promise<void> {
  try {
    execSync('npm install', {
      cwd: projectDir,
      stdio: verbose ? 'inherit' : 'ignore',
    });
  } catch (error) {
    console.warn('⚠️  npm install failed. You may need to run it manually.');
  }
}

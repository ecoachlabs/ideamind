import { BaseAgent, AgentCapabilities, AgentResult } from '../base-agent';

/**
 * BuildAgent - Generates implementation plans and code
 *
 * Creates comprehensive implementation artifacts including:
 * - Project structure and scaffolding
 * - Code generation for key components
 * - Database schemas and migrations
 * - Configuration files
 * - Development setup instructions
 * - Implementation roadmap with tasks
 */
export class BuildAgent extends BaseAgent {
  constructor(apiKey: string, model?: string) {
    super('BuildAgent', apiKey, model);
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: true,
      supportsBatching: true,
      supportsCheckpointing: true,
      maxInputSize: 100000,
      maxOutputSize: 150000,
    };
  }

  async execute(input: any, context: Record<string, any>): Promise<AgentResult> {
    const startTime = Date.now();

    this.logger.info({ input }, 'Executing Build Agent');

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

      const { text, tokensUsed } = await this.callClaude(prompt, 12000, systemPrompt);

      const buildPlan = this.parseJSON(text);

      return {
        success: true,
        output: buildPlan,
        metadata: {
          tokensUsed,
          duration_ms: Date.now() - startTime,
          model: this.model,
          files_count: buildPlan.code_files?.length || 0,
          components_count: buildPlan.components?.length || 0,
        },
      };
    } catch (error: any) {
      this.logger.error({ error }, 'Build Agent execution failed');

      return {
        success: false,
        output: null,
        error: error.message,
      };
    }
  }

  private buildPrompt(input: any, context: Record<string, any>): string {
    return `You are a Build Agent that generates implementation plans and production-ready code.

## Input:
${JSON.stringify(input, null, 2)}

## Context:
${JSON.stringify(context, null, 2)}

## Your Task:
Create a comprehensive implementation plan with code generation.

Generate:
1. **Project Structure**: Complete directory layout
2. **Code Files**: Key implementation files with actual code
3. **Database Schema**: Tables, relationships, migrations
4. **Configuration**: Environment setup, build configs
5. **Dependencies**: Package.json, requirements.txt, etc.
6. **Setup Instructions**: Step-by-step developer setup
7. **Implementation Tasks**: Breakdown of development work
8. **Technical Decisions**: Key implementation choices
9. **Code Standards**: Conventions and patterns to follow
10. **Next Steps**: What to build first

Output as JSON:
{
  "project_structure": {
    "directories": [
      {
        "path": "src/components",
        "purpose": "React components",
        "files": ["Button.tsx", "Input.tsx"]
      }
    ],
    "structure_rationale": "Why this structure"
  },
  "code_files": [
    {
      "path": "src/App.tsx",
      "language": "typescript",
      "purpose": "Main application component",
      "code": "// Full file contents here\\nimport React from 'react';\\n\\nfunction App() {\\n  return <div>Hello</div>;\\n}\\n\\nexport default App;",
      "dependencies": ["react", "react-dom"],
      "notes": "Entry point for the application"
    }
  ],
  "database_schema": {
    "dialect": "postgresql|mysql|mongodb",
    "tables": [
      {
        "name": "users",
        "purpose": "User accounts",
        "columns": [
          {
            "name": "id",
            "type": "uuid",
            "constraints": "PRIMARY KEY",
            "description": "Unique identifier"
          },
          {
            "name": "email",
            "type": "varchar(255)",
            "constraints": "UNIQUE NOT NULL",
            "description": "User email"
          },
          {
            "name": "created_at",
            "type": "timestamp",
            "constraints": "DEFAULT NOW()",
            "description": "Account creation time"
          }
        ],
        "indexes": [
          {
            "name": "idx_users_email",
            "columns": ["email"],
            "type": "btree"
          }
        ],
        "relationships": [
          {
            "type": "one-to-many",
            "table": "posts",
            "foreign_key": "user_id"
          }
        ]
      }
    ],
    "migrations": [
      {
        "version": "001",
        "description": "Create users table",
        "up": "CREATE TABLE users (id UUID PRIMARY KEY...);",
        "down": "DROP TABLE users;"
      }
    ],
    "seed_data": [
      {
        "table": "users",
        "purpose": "Test accounts",
        "data": [
          {
            "email": "test@example.com",
            "name": "Test User"
          }
        ]
      }
    ]
  },
  "configuration_files": [
    {
      "path": "package.json",
      "format": "json",
      "content": "{\\n  \\"name\\": \\"my-app\\",\\n  \\"version\\": \\"1.0.0\\",\\n  \\"dependencies\\": {}\\n}",
      "purpose": "Node.js dependencies"
    },
    {
      "path": ".env.example",
      "format": "env",
      "content": "DATABASE_URL=postgresql://localhost:5432/mydb\\nAPI_KEY=your_key_here",
      "purpose": "Environment variables template"
    },
    {
      "path": "tsconfig.json",
      "format": "json",
      "content": "{\\n  \\"compilerOptions\\": {\\n    \\"target\\": \\"ES2020\\"\\n  }\\n}",
      "purpose": "TypeScript configuration"
    }
  ],
  "dependencies": {
    "frontend": [
      {
        "package": "react",
        "version": "^18.2.0",
        "purpose": "UI library",
        "dev": false
      },
      {
        "package": "typescript",
        "version": "^5.0.0",
        "purpose": "Type checking",
        "dev": true
      }
    ],
    "backend": [
      {
        "package": "express",
        "version": "^4.18.0",
        "purpose": "Web framework",
        "dev": false
      }
    ],
    "infrastructure": [
      {
        "package": "docker",
        "version": "latest",
        "purpose": "Containerization"
      }
    ]
  },
  "setup_instructions": {
    "prerequisites": [
      {
        "tool": "Node.js",
        "version": "18+",
        "installation": "https://nodejs.org/",
        "verify": "node --version"
      },
      {
        "tool": "PostgreSQL",
        "version": "14+",
        "installation": "https://www.postgresql.org/",
        "verify": "psql --version"
      }
    ],
    "steps": [
      {
        "step": 1,
        "title": "Clone repository",
        "commands": ["git clone repo-url", "cd project-name"],
        "expected_outcome": "Repository cloned locally"
      },
      {
        "step": 2,
        "title": "Install dependencies",
        "commands": ["npm install"],
        "expected_outcome": "All packages installed"
      },
      {
        "step": 3,
        "title": "Setup database",
        "commands": ["createdb mydb", "npm run migrate"],
        "expected_outcome": "Database created and migrated"
      },
      {
        "step": 4,
        "title": "Configure environment",
        "commands": ["cp .env.example .env", "# Edit .env with your values"],
        "expected_outcome": "Environment configured"
      },
      {
        "step": 5,
        "title": "Start development server",
        "commands": ["npm run dev"],
        "expected_outcome": "Server running on http://localhost:3000"
      }
    ],
    "troubleshooting": [
      {
        "issue": "Port already in use",
        "solution": "Change PORT in .env or kill process using the port"
      }
    ]
  },
  "components": [
    {
      "name": "Authentication Service",
      "type": "backend-service",
      "files": ["auth-service.ts", "auth-middleware.ts", "jwt-utils.ts"],
      "purpose": "Handle user authentication",
      "technologies": ["JWT", "bcrypt"],
      "api_endpoints": ["/api/auth/login", "/api/auth/register"],
      "dependencies": ["User model", "Database"],
      "complexity": "medium",
      "estimated_hours": 16
    },
    {
      "name": "User Dashboard",
      "type": "frontend-component",
      "files": ["Dashboard.tsx", "DashboardLayout.tsx", "widgets/"],
      "purpose": "Main user interface",
      "technologies": ["React", "TailwindCSS"],
      "routes": ["/dashboard"],
      "dependencies": ["Auth context", "API client"],
      "complexity": "high",
      "estimated_hours": 24
    }
  ],
  "implementation_tasks": [
    {
      "id": "TASK-001",
      "title": "Setup project scaffolding",
      "description": "Initialize project with build tools and configuration",
      "type": "infrastructure",
      "priority": "critical",
      "estimated_hours": 4,
      "dependencies": [],
      "acceptance_criteria": [
        "Project builds successfully",
        "Linting and formatting configured",
        "Git hooks setup"
      ],
      "implementation_notes": "Use Create React App or Vite for frontend setup"
    },
    {
      "id": "TASK-002",
      "title": "Database schema implementation",
      "description": "Create all database tables and relationships",
      "type": "backend",
      "priority": "critical",
      "estimated_hours": 8,
      "dependencies": ["TASK-001"],
      "acceptance_criteria": [
        "All tables created",
        "Migrations run successfully",
        "Seed data loaded"
      ],
      "implementation_notes": "Use migration tool like Knex or TypeORM"
    },
    {
      "id": "TASK-003",
      "title": "Authentication system",
      "description": "Implement user registration, login, and session management",
      "type": "backend",
      "priority": "high",
      "estimated_hours": 16,
      "dependencies": ["TASK-002"],
      "acceptance_criteria": [
        "Users can register",
        "Users can login",
        "JWT tokens generated and validated",
        "Password hashing works"
      ],
      "implementation_notes": "Use bcrypt for passwords, JWT for sessions"
    }
  ],
  "technical_decisions": [
    {
      "decision": "Use TypeScript instead of JavaScript",
      "rationale": "Type safety reduces bugs and improves maintainability",
      "alternatives_considered": ["JavaScript with JSDoc"],
      "trade_offs": "Slightly longer development time, better long-term maintainability",
      "impact": "All code files will use .ts/.tsx extensions"
    },
    {
      "decision": "Use PostgreSQL instead of MongoDB",
      "rationale": "Structured data with complex relationships, ACID compliance needed",
      "alternatives_considered": ["MongoDB", "MySQL"],
      "trade_offs": "More rigid schema, better data integrity",
      "impact": "Need to design normalized schema upfront"
    }
  ],
  "code_standards": {
    "style_guide": "Airbnb JavaScript/React Style Guide",
    "formatting": {
      "tool": "Prettier",
      "config": {
        "semi": true,
        "singleQuote": true,
        "tabWidth": 2,
        "trailingComma": "es5"
      }
    },
    "linting": {
      "tool": "ESLint",
      "rules": ["no-console: warn", "prefer-const: error"]
    },
    "naming_conventions": {
      "files": "kebab-case for files (user-service.ts)",
      "components": "PascalCase for components (UserProfile.tsx)",
      "functions": "camelCase for functions (getUserById)",
      "constants": "UPPER_SNAKE_CASE for constants (MAX_RETRIES)",
      "interfaces": "PascalCase with I prefix (IUser)"
    },
    "file_organization": {
      "imports_order": ["React", "Third-party", "Local components", "Types", "Styles"],
      "component_structure": ["Types", "Constants", "Component", "Styles", "Export"]
    },
    "testing": {
      "file_naming": "*.test.ts or *.spec.ts",
      "coverage_target": "80%",
      "test_structure": "Arrange-Act-Assert pattern"
    },
    "git": {
      "branch_naming": "feature/TASK-001-short-description",
      "commit_format": "type(scope): message (e.g., feat(auth): add login endpoint)"
    }
  },
  "development_workflow": {
    "branches": {
      "main": "Production-ready code",
      "develop": "Integration branch",
      "feature/*": "Feature development",
      "hotfix/*": "Production fixes"
    },
    "pr_process": [
      "Create feature branch from develop",
      "Implement feature with tests",
      "Run linting and tests locally",
      "Create PR with description",
      "Code review by 2+ team members",
      "CI/CD checks pass",
      "Merge to develop"
    ],
    "local_development": [
      "Start database: docker-compose up db",
      "Start backend: npm run dev:backend",
      "Start frontend: npm run dev:frontend",
      "Run tests: npm test",
      "Check types: npm run type-check"
    ]
  },
  "build_pipeline": {
    "stages": ["lint", "type-check", "test", "build", "deploy"],
    "ci_cd": {
      "platform": "GitHub Actions",
      "triggers": ["push to main", "pull request"],
      "environments": ["development", "staging", "production"]
    },
    "build_commands": {
      "frontend": "npm run build",
      "backend": "npm run build",
      "docker": "docker build -t app:latest ."
    },
    "deployment": {
      "development": "Auto-deploy on merge to develop",
      "staging": "Auto-deploy on merge to main",
      "production": "Manual approval required"
    }
  },
  "implementation_roadmap": [
    {
      "phase": "Phase 1: Foundation",
      "duration": "2 weeks",
      "goals": ["Project setup", "Database schema", "Authentication"],
      "tasks": ["TASK-001", "TASK-002", "TASK-003"],
      "deliverables": ["Working dev environment", "User authentication"],
      "success_criteria": ["Users can register and login"]
    },
    {
      "phase": "Phase 2: Core Features",
      "duration": "4 weeks",
      "goals": ["Main functionality", "API endpoints", "UI components"],
      "tasks": ["TASK-004", "TASK-005", "TASK-006"],
      "deliverables": ["Core features working", "API documented"],
      "success_criteria": ["All user stories from PRD implemented"]
    },
    {
      "phase": "Phase 3: Polish",
      "duration": "2 weeks",
      "goals": ["Testing", "Performance", "UX refinement"],
      "tasks": ["TASK-007", "TASK-008"],
      "deliverables": ["80%+ test coverage", "Performance optimized"],
      "success_criteria": ["All acceptance tests pass"]
    }
  ],
  "next_steps": {
    "immediate": [
      "Review and approve this implementation plan",
      "Setup development environment per instructions",
      "Begin TASK-001: Project scaffolding"
    ],
    "week_1": [
      "Complete foundation phase tasks",
      "Daily standups to track progress",
      "Address any setup blockers"
    ],
    "ongoing": [
      "Weekly sprint planning",
      "Code reviews for all PRs",
      "Update task estimates based on actual time"
    ]
  },
  "risks_and_mitigation": [
    {
      "risk": "Scope creep during implementation",
      "probability": "high",
      "impact": "high",
      "mitigation": "Strict adherence to PRD, change request process for new features"
    },
    {
      "risk": "Third-party dependency issues",
      "probability": "medium",
      "impact": "medium",
      "mitigation": "Pin dependency versions, test updates in separate branch"
    }
  ]
}`;
  }

  private getSystemPrompt(): string {
    return `You are an expert software engineer and architect specializing in:
- Full-stack development (frontend, backend, database)
- Production-ready code generation
- Project scaffolding and structure
- Build tooling and CI/CD pipelines
- Code quality and best practices
- Developer experience optimization

Generate practical, production-ready code that:
- Follows industry best practices
- Is well-documented and maintainable
- Includes error handling and validation
- Is properly typed (TypeScript)
- Has clear separation of concerns
- Is testable and modular

Provide complete, working code examples, not pseudocode or placeholders.`;
  }
}

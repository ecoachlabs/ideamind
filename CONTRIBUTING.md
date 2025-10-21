# Contributing to IdeaMine

Thank you for your interest in contributing to IdeaMine! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ideamine.git
   cd ideamine
   ```
3. **Install dependencies**:
   ```bash
   pnpm install
   ```
4. **Start infrastructure**:
   ```bash
   pnpm docker:up
   ```
5. **Build packages**:
   ```bash
   pnpm build
   ```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes
- `chore/` - Build/tooling changes

### 2. Make Changes

- Follow the existing code style
- Write clear, descriptive commit messages
- Add tests for new functionality
- Update documentation as needed

### 3. Code Quality

Before committing, ensure your code passes all checks:

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm exec prettier --write .

# Build
pnpm build

# Test
pnpm test
```

### 4. Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

**Examples**:
```bash
feat(agent-sdk): add tool retry logic with exponential backoff

fix(orchestrator): prevent workflow state transition race condition

docs(readme): add quickstart guide for local development
```

### 5. Submit Pull Request

1. Push your branch to your fork
2. Open a pull request against `main`
3. Fill out the PR template
4. Wait for review

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use descriptive variable names
- Avoid `any` - use `unknown` if type is truly unknown
- Document complex logic with comments

### Formatting

We use Prettier with the following configuration:
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2
}
```

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Classes**: `PascalCase`
- **Functions/Variables**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Interfaces**: `PascalCase` (no `I` prefix)
- **Types**: `PascalCase`

## Project Structure

```
ideamine/
├── packages/          # Shared packages
│   ├── agent-sdk/    # Agent framework
│   ├── tool-sdk/     # Tool interface
│   └── ...
├── services/         # Phase-specific services
│   ├── intake/
│   ├── reasoning/
│   └── ...
├── apps/             # Application services
│   ├── orchestrator/
│   └── ...
└── platform/         # Infrastructure
    ├── database/
    └── ...
```

## Adding New Components

### New Agent

1. Create service directory: `services/your-agent/`
2. Extend `BaseAgent` from `@ideamine/agent-sdk`
3. Implement required methods:
   - `plan()` - Create execution plan
   - `reason()` - Initial reasoning
   - `generateArtifacts()` - Create artifacts
4. Add tests
5. Update documentation

Example:
```typescript
import { BaseAgent, AgentConfig } from '@ideamine/agent-sdk';

export class YourAgent extends BaseAgent {
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    // Implementation
  }

  protected async reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult> {
    // Implementation
  }

  protected async generateArtifacts(result: ReasoningResult, input: AgentInput) {
    // Implementation
  }
}
```

### New Tool

1. Create tool directory: `tools/your-tool/`
2. Implement tool interface
3. Create Docker image
4. Register in tool registry
5. Add tests and documentation

### New Package

1. Create package directory: `packages/your-package/`
2. Add `package.json` with workspace reference
3. Add to root `package.json` workspaces
4. Update turbo.json if needed

## Testing

### Unit Tests

```bash
pnpm test
```

### Integration Tests

```bash
pnpm test:integration
```

### E2E Tests

```bash
pnpm test:e2e
```

### Coverage

```bash
pnpm test:coverage
```

Aim for >80% code coverage on new code.

## Documentation

- Add JSDoc comments to public APIs
- Update README.md for significant changes
- Add examples for new features
- Update architecture docs if design changes

## Review Process

1. **Automated Checks**: CI must pass (lint, typecheck, build, test)
2. **Code Review**: At least one approval required
3. **Documentation**: Must be updated for user-facing changes
4. **Tests**: New code must have tests
5. **No Breaking Changes**: Without prior discussion

## Release Process

Releases are automated via GitHub Actions:

1. Merge to `main` triggers CI/CD
2. Semantic versioning based on commit messages
3. Docker images published to registry
4. Changelog auto-generated
5. GitHub release created

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/ideamine/ideamine/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ideamine/ideamine/discussions)
- **Slack**: [IdeaMine Community](https://ideamine.slack.com)

## Code of Conduct

Please be respectful and constructive. We aim to maintain a welcoming community for all contributors.

## License

By contributing, you agree that your contributions will be licensed under the project's license.

## Questions?

If you have questions about contributing, please open a discussion or reach out in Slack!

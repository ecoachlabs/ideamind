# @ideamine/agents

IdeaMine agents implementing the Analyzer-inside-Agent pattern for all 12 phases of the product development pipeline.

## Overview

This package contains specialized AI agents that orchestrate the transformation of a raw idea into a production-ready application. Each agent uses Claude 3.7 Sonnet with VOI (Value-of-Information) scoring to optimize tool invocation.

## Phase 1: INTAKE (Implemented ✅)

Transform raw ideas into validated IdeaSpec artifacts.

### Agents

| Agent | Purpose | Tools | Status |
|-------|---------|-------|--------|
| **IntakeClassifierAgent** | Categorize ideas, estimate complexity | estimate-complexity, search-similar-ideas | ✅ Complete |
| **IntakeExpanderAgent** | Generate questions, extract details | validate-constraints | ✅ Complete |
| **IntakeValidatorAgent** | Validate completeness, generate IdeaSpec | validate-constraints | ✅ Complete |

### Quick Start

```typescript
import {
  IntakeClassifierAgent,
  IntakeExpanderAgent,
  IntakeValidatorAgent,
  loadIntakeAgentConfigs,
} from '@ideamine/agents';

// Load configurations
const configs = loadIntakeAgentConfigs();

// Initialize agents
const classifier = new IntakeClassifierAgent(configs[0]);
const expander = new IntakeExpanderAgent(configs[1]);
const validator = new IntakeValidatorAgent(configs[2]);

// Execute pipeline
const classifierOutput = await classifier.execute({
  data: { ideaText: 'Build a task management app...', title: 'TaskMaster' },
  context: { projectId: 'proj-123', userId: 'user-456' },
});

const expanderOutput = await expander.execute({
  data: {
    ideaText: 'Build a task management app...',
    classification: classifierOutput.artifacts[0].content,
  },
  context: { projectId: 'proj-123', userId: 'user-456' },
});

const validatorOutput = await validator.execute({
  data: { partialSpec: expanderOutput.artifacts[0].content.partialSpec },
  context: { projectId: 'proj-123', userId: 'user-456' },
});

// Final IdeaSpec
const ideaSpec = validatorOutput.artifacts.find((a) => a.type === 'idea-spec').content;
```

## Installation

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test --coverage
```

## Architecture

### Analyzer-inside-Agent Pattern

All agents follow this five-step internal pattern:

1. **PLANNER** → Creates execution plan
2. **REASONING** → Initial attempt without tools (zero-cost)
3. **ANALYZER** → Evaluates if tools would improve output (VOI scoring)
4. **EXECUTOR** → Invokes tools if VOI exceeds threshold
5. **VERIFIER** → Validates improvement, may retry

### VOI Scoring

Tools are invoked only when their value exceeds cost:

```
VOI = (expected_error_reduction × utility_weight) - (cost + latency_penalty + risk_penalty)
```

**Example:**
- Agent produces initial result with confidence 0.65
- Tool `estimate-complexity` could raise confidence to 0.85
- Expected improvement: 0.20 (20% error reduction)
- Tool cost: $0.05, latency: 2s
- VOI = (0.20 × 1.0) - (0.05 + 0.02) = 0.13 ✅ (above threshold 0.10)

## Configuration

Agent configurations are in `src/config/intake-agents.yaml`:

```yaml
agents:
  - id: "intake-classifier-agent"
    llm:
      provider: "anthropic"
      model: "claude-3-7-sonnet-20250219"
      temperature: 0.3
      maxTokens: 8000
    toolPolicy:
      maxToolInvocations: 2
      maxCostUsd: 0.50
      voiThreshold: 0.5
      confidenceThreshold: 0.7
      allowlist: ["estimate-complexity", "search-similar-ideas"]
```

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run specific agent
pnpm test classifier-agent

# Watch mode
pnpm test:watch
```

### Integration Tests

End-to-end intake pipeline test:

```bash
pnpm test intake-flow.test.ts
```

### Coverage

Minimum coverage thresholds (enforced in CI):
- Branches: 70%
- Functions: 75%
- Lines: 80%
- Statements: 80%

## Performance

### Expected Costs

| Phase | Agents | Avg Tokens | Avg Cost | Max Cost |
|-------|--------|-----------|----------|----------|
| Intake | 3 | ~12,000 | $0.24 | $0.90 |

### Expected Latency

| Agent | Typical | P95 | Timeout |
|-------|---------|-----|---------|
| Classifier | 3-5s | 8s | 30s |
| Expander | 5-8s | 12s | 40s |
| Validator | 2-4s | 6s | 20s |
| **Total Pipeline** | **10-17s** | **26s** | **90s** |

## Roadmap

### Phase 2: IDEATION (Planned)

- **StrategyAgent**: Define product strategy and vision
- **CompetitiveAnalystAgent**: Analyze competitors and market landscape
- **TechStackRecommenderAgent**: Recommend optimal technology stack
- **UserPersonaBuilderAgent**: Create detailed user personas

### Phase 3-12: Future Phases

- CRITIQUE (Red team, risk analysis)
- PRD (PRD writing, feature decomposition)
- BIZDEV (Viability, GTM, pricing)
- ARCH (Solution architecture, API design)
- BUILD (Repo creation, CI/CD)
- STORY_LOOP (Iterative coding)
- QA (Testing, security)
- AESTHETIC (UI polish, accessibility)
- RELEASE (Deployment, packaging)
- BETA (Beta testing, telemetry)

## Documentation

- **[AGENTS.md](./AGENTS.md)** - Comprehensive agent documentation
- **[Agent SDK](../agent-sdk/README.md)** - BaseAgent implementation details
- **[Tools](../tools/README.md)** - Available tools and how to create new ones
- **[Schemas](../schemas/README.md)** - IdeaSpec and other artifact schemas

## Dependencies

- `@ideamine/agent-sdk` - Base agent implementation with Analyzer pattern
- `@ideamine/schemas` - IdeaSpec and artifact schemas (Zod)
- `@ideamine/tools` - Tool implementations (estimate-complexity, validate-constraints, etc.)
- `@ideamine/event-bus` - Event publishing for observability
- `@langchain/anthropic` - Claude Sonnet LLM integration
- `uuid` - UUID v7 generation
- `yaml` - Configuration file parsing

## Contributing

### Adding a New Agent

1. Create class in `src/{phase}/my-agent.ts`
2. Extend `BaseAgent` from `@ideamine/agent-sdk`
3. Implement: `plan()`, `reason()`, `generateArtifacts()`
4. Add config to `src/config/{phase}-agents.yaml`
5. Create tests in `tests/{phase}/my-agent.test.ts`
6. Update orchestrator in `@ideamine/orchestrator-core`
7. Document in `AGENTS.md`

See [AGENTS.md](./AGENTS.md) for detailed implementation guide.

## License

Proprietary - IdeaMine Platform

## Support

For questions or issues:
- Create an issue in the monorepo
- Consult [AGENTS.md](./AGENTS.md) for detailed documentation
- Review [PRD_Unified.md](../../docs/PRD_Unified.md) for architecture overview

# Intake Service

The Intake service is responsible for the first phase of the IdeaMine pipeline: validating, classifying, and analyzing idea submissions.

## Agents

### IntakeClassifierAgent

**Purpose**: Classify and analyze incoming ideas to prepare them for the ideation phase.

**Responsibilities**:
- Parse and validate idea spec
- Classify idea type (MVP, feature, enhancement, research)
- Extract key entities (users, problems, solutions)
- Estimate complexity and timeline
- Generate intake summary artifact

**Tools Used** (via Analyzer):
- `competitive-analysis`: Research similar products/solutions
- `market-research`: Validate market demand
- `tech-stack-analyzer`: Suggest appropriate technologies

**Inputs**:
- Idea Spec artifact (from user submission)

**Outputs**:
- Intake Summary artifact

**Configuration**:
```typescript
{
  agentId: 'intake-classifier-001',
  phase: 'intake',
  toolPolicy: {
    allowedTools: ['competitive-analysis', 'market-research', 'tech-stack-analyzer'],
    maxToolInvocations: 3,
    maxToolCostUsd: 1.0,
    voiThreshold: 0.4,
  },
  llmConfig: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 2000,
  },
}
```

## Running Locally

```bash
# Build
pnpm build

# Run example
pnpm start
```

## Development

```bash
# Watch mode
pnpm dev
```

## Testing

```bash
# Run tests
pnpm test
```

## Architecture

This service demonstrates the **Analyzer-inside-Agent** pattern:

1. **Planner**: Creates execution plan with 5 steps
2. **Reasoning**: Uses LLM to perform initial classification
3. **Analyzer Loop**:
   - Calculates VoI for tools (competitive-analysis, market-research, etc.)
   - Invokes tools if VoI > threshold (0.4)
   - Verifies if tool improved confidence
   - Keeps improvement or discards
4. **Artifact Generation**: Creates structured intake summary

## Example Output

```json
{
  "success": true,
  "costUsd": 0.08,
  "tokensUsed": 1200,
  "durationMs": 3500,
  "artifacts": [
    {
      "type": "INTAKE_SUMMARY",
      "content": {
        "classification": {
          "ideaType": "MVP",
          "scope": "medium",
          "complexity": "high"
        },
        "analysis": {
          "targetUsers": ["developers", "product teams"],
          "problemDomain": "software development automation",
          "proposedSolution": "autonomous development platform",
          "keyFeatures": [
            "12-phase pipeline",
            "AI agents for each phase",
            "Quality gates"
          ]
        },
        "estimates": {
          "timelineWeeks": 38,
          "confidence": 0.85
        }
      }
    }
  ],
  "toolsInvoked": ["competitive-analysis"]
}
```

## Next Phase

After intake completion, the workflow transitions to **Ideation** phase where:
- Strategy agents develop detailed approach
- Competitive analysts research market
- Tech stack recommenders propose architecture
- User persona builders create target profiles

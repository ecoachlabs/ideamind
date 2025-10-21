# LLM Provider Configuration Guide

## Overview

IdeaMine supports **multiple LLM providers** (OpenAI, Anthropic, Google) with **per-phase configuration**. Platform admins can easily switch providers and models for each phase to optimize for performance, cost, or specific capabilities.

## Supported Providers

### Anthropic (Claude)
- **Models**: claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229
- **Best for**: Detailed reasoning, well-cited answers, structured output, validation
- **API Key**: `ANTHROPIC_API_KEY`

### OpenAI (GPT)
- **Models**: gpt-4o, gpt-4o-mini, o1-preview, o1-mini, gpt-4-turbo
- **Best for**: Deep reasoning (o1), structured analysis (GPT-4o), cost-effective tasks (mini)
- **API Key**: `OPENAI_API_KEY`

### Google (Gemini)
- **Models**: gemini-2.0-flash-exp, gemini-1.5-pro, gemini-1.5-flash
- **Best for**: High-volume phases, cost optimization, fast responses
- **API Key**: `GOOGLE_API_KEY`

## Configuration

### Option 1: JSON Configuration File (Recommended)

**File**: `/config/llm-providers.json`

```json
{
  "defaultProvider": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "maxTokens": 4096
  },
  "phaseConfigs": [
    {
      "phase": "PRD",
      "agentType": "question-agent",
      "provider": {
        "provider": "openai",
        "model": "gpt-4o",
        "temperature": 0.7,
        "maxTokens": 4096
      }
    },
    {
      "phase": "PRD",
      "agentType": "answer-agent",
      "provider": {
        "provider": "anthropic",
        "model": "claude-3-5-sonnet-20241022",
        "temperature": 0.5,
        "maxTokens": 8192
      }
    }
  ]
}
```

**Load configuration**:
```typescript
import { LLMConfigLoader } from '@ideamine/agent-sdk';

// At application startup
LLMConfigLoader.loadFromFile(); // Loads from /config/llm-providers.json

// Or specify custom path
LLMConfigLoader.loadFromFile('/path/to/custom-config.json');
```

### Option 2: Environment Variables

For containerized deployments, use environment variables:

```bash
# Format: LLM_{PHASE}_{AGENT_TYPE}={provider}:{model}:{temperature}:{maxTokens}

export LLM_PRD_QUESTION_AGENT=openai:gpt-4o:0.7:4096
export LLM_PRD_ANSWER_AGENT=anthropic:claude-3-5-sonnet-20241022:0.5:8192
export LLM_PRD_VALIDATOR=anthropic:claude-3-5-haiku-20241022:0.3:4096

export LLM_ARCH_QUESTION_AGENT=openai:o1-preview:1.0:8192
export LLM_ARCH_ANSWER_AGENT=anthropic:claude-3-5-sonnet-20241022:0.5:8192

export LLM_QA_QUESTION_AGENT=google:gemini-1.5-pro:0.7:4096
export LLM_QA_ANSWER_AGENT=google:gemini-1.5-pro:0.5:8192
```

**Load configuration**:
```typescript
LLMConfigLoader.loadFromEnv();
```

### Option 3: Programmatic Configuration

```typescript
import { LLMFactory } from '@ideamine/agent-sdk';

LLMFactory.loadConfigurations([
  {
    phase: 'PRD',
    agentType: 'question-agent',
    provider: {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 4096,
    },
  },
  {
    phase: 'PRD',
    agentType: 'answer-agent',
    provider: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.5,
      maxTokens: 8192,
    },
  },
]);
```

## Agent Types

Each phase has **3 agent types**, each can use a different provider:

1. **question-agent** (QAQ): Generates high-impact questions about phase artifacts
2. **answer-agent** (QAA): Answers questions with evidence-based responses
3. **validator** (QV): Validates Q/A pairs using rubric scoring

## Recommended Configurations

### High-Quality (Premium Cost)
```json
{
  "question-agent": "openai:o1-preview",    // Deep reasoning for questions
  "answer-agent": "anthropic:claude-3-5-sonnet",  // Detailed, cited answers
  "validator": "anthropic:claude-3-5-sonnet"       // Consistent validation
}
```

### Balanced (Recommended)
```json
{
  "question-agent": "openai:gpt-4o",                // Strong question generation
  "answer-agent": "anthropic:claude-3-5-sonnet",   // Quality answers
  "validator": "anthropic:claude-3-5-haiku"         // Fast validation
}
```

### Cost-Optimized
```json
{
  "question-agent": "google:gemini-1.5-pro",     // Cost-effective
  "answer-agent": "google:gemini-1.5-pro",       // Cost-effective
  "validator": "google:gemini-1.5-flash"         // Very cost-effective
}
```

## Phase-Specific Recommendations

### PRD Phase
- **Questions**: `gpt-4o` or `o1-mini` (structured requirements analysis)
- **Answers**: `claude-3-5-sonnet` (detailed, well-cited answers)
- **Validator**: `claude-3-5-haiku` (fast validation)

### ARCH Phase
- **Questions**: `o1-preview` (deep architectural reasoning)
- **Answers**: `claude-3-5-sonnet` (comprehensive architecture docs)
- **Validator**: `claude-3-5-sonnet` (thorough validation)

### QA Phase
- **Questions**: `gemini-1.5-pro` (cost-effective test scenario generation)
- **Answers**: `gemini-1.5-pro` (high-volume test documentation)
- **Validator**: `claude-3-5-haiku` (fast test validation)

### CODING Phase
- **Questions**: `gpt-4o` (code analysis questions)
- **Answers**: `claude-3-5-sonnet` (detailed code explanations)
- **Validator**: `claude-3-5-haiku` (code review validation)

## Validation

Validate your configuration at startup:

```typescript
import { LLMConfigLoader } from '@ideamine/agent-sdk';

const validation = await LLMConfigLoader.validateConfig();

if (!validation.valid) {
  console.error('LLM Configuration Errors:', validation.errors);
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn('LLM Configuration Warnings:', validation.warnings);
}

// Print configuration summary
LLMConfigLoader.printSummary();
```

## Example Output

```
=== LLM Provider Configuration ===

PRD:
  question-agent: openai/gpt-4o
  answer-agent: anthropic/claude-3-5-sonnet-20241022
  validator: anthropic/claude-3-5-haiku-20241022

ARCH:
  question-agent: openai/o1-preview
  answer-agent: anthropic/claude-3-5-sonnet-20241022
  validator: anthropic/claude-3-5-sonnet-20241022

QA:
  question-agent: google/gemini-1.5-pro
  answer-agent: google/gemini-1.5-pro
  validator: anthropic/claude-3-5-haiku-20241022

===================================
```

## Hot-Swapping Providers

To switch providers, simply update the configuration file:

**Before**:
```json
{
  "phase": "PRD",
  "agentType": "question-agent",
  "provider": {
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

**After**:
```json
{
  "phase": "PRD",
  "agentType": "question-agent",
  "provider": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022"
  }
}
```

**Restart the service** - configuration is loaded at startup.

## Cost Tracking

Each agent tracks costs per provider:

```typescript
const result = await questionAgent.execute(input);

console.log(`Cost: $${result.costUsd}`);
console.log(`Tokens: ${result.tokensUsed}`);
console.log(`Provider: ${result.provider}/${result.model}`);
```

## Troubleshooting

### Missing API Key

```
Warning: Provider anthropic is not available (missing API key)
```

**Solution**: Set the API key in environment variables:
```bash
export ANTHROPIC_API_KEY=your-key-here
```

### Provider Not Working

**Check availability**:
```typescript
const isAvailable = await LLMFactory.checkProviderAvailability('anthropic');
console.log('Anthropic available:', isAvailable);
```

### Fallback Behavior

If a configured provider fails, agents automatically fall back to mock/default responses rather than crashing the system.

## Best Practices

1. **Use different providers for different agent types**: e.g., o1 for questions, Claude for answers
2. **Test configurations**: Run validation before deploying
3. **Monitor costs**: Track costs per phase to optimize
4. **Update pricing**: Provider pricing changes - update `*-provider.ts` files as needed
5. **Environment-specific configs**: Use different configs for dev/staging/prod

## Advanced: Custom Provider

To add a new provider:

1. Implement `ILLMProvider` interface
2. Add to `LLMFactory.createProviderFromConfig()`
3. Update JSON schema with new provider name
4. Add pricing information

Example:
```typescript
export class MyCustomProvider implements ILLMProvider {
  readonly providerName = 'mycustom';
  readonly modelName: string;

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    // Your implementation
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.MYCUSTOM_API_KEY;
  }

  getPricing() {
    return { inputCostPerMillion: 1.0, outputCostPerMillion: 3.0 };
  }
}
```

---

**Summary**: IdeaMine's LLM provider system gives you complete flexibility to optimize for quality, cost, and performance on a per-phase, per-agent-type basis. Simply edit the JSON configuration file and restart - no code changes required.

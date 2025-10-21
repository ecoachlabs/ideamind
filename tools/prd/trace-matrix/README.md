# tool.prd.traceMatrix

Requirements Traceability Matrix (RTM) builder for IdeaMine.

## Overview

This tool analyzes user stories, use cases, and test cases to build a comprehensive Requirements Traceability Matrix. It provides bidirectional traceability links and identifies coverage gaps.

## Features

- **Semantic Similarity Matching**: Links requirements based on text similarity
- **Bidirectional Traceability**: Tracks use cases → stories → tests
- **Coverage Gap Detection**: Identifies orphaned items and missing links
- **Confidence Scoring**: Provides confidence scores for each link
- **Metrics**: Overall coverage statistics

## Usage

### Input Example

```json
{
  "use_cases": [
    {
      "id": "UC-1",
      "title": "User Authentication",
      "description": "Users should be able to log in with email and password",
      "priority": "high"
    }
  ],
  "stories": [
    {
      "id": "STORY-100",
      "title": "Implement login form",
      "description": "As a user, I want to log in with my credentials"
    }
  ],
  "tests": [
    {
      "id": "TEST-500",
      "title": "Test successful login",
      "type": "e2e"
    }
  ],
  "similarity_threshold": 0.7
}
```

### Output Example

```json
{
  "rtm": [
    {
      "use_case_id": "UC-1",
      "story_ids": ["STORY-100"],
      "test_ids": ["TEST-500"],
      "confidence_scores": {
        "STORY-100": 0.85
      },
      "coverage_percentage": 100.0
    }
  ],
  "gaps": [],
  "metrics": {
    "total_use_cases": 1,
    "total_stories": 1,
    "total_tests": 1,
    "coverage_percentage": 100.0,
    "orphaned_stories": 0,
    "uncovered_use_cases": 0
  }
}
```

## Building

```bash
docker build -t ghcr.io/ideamine/trace-matrix:1.2.0 .
```

## Testing Locally

```bash
echo '{"input": {"use_cases": [...], "stories": [...]}}' | docker run -i ghcr.io/ideamine/trace-matrix:1.2.0
```

## Security

- Runs as non-root user (UID 10001)
- Read-only filesystem
- No network access required
- No secrets needed

## Algorithm

The tool uses a simple text similarity algorithm (SequenceMatcher) for demonstration. In production, you would use more sophisticated NLP:

- Sentence transformers (SBERT)
- BERT embeddings
- Semantic search with vector databases
- Entity recognition for requirement IDs

## License

MIT

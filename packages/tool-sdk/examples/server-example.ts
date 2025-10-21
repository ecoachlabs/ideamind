/**
 * Example: Building a tool server
 */

import { runToolServer, createHandler, ToolManifest } from '@ideamine/tool-sdk';

// Define tool manifest
const manifest: ToolManifest = {
  name: 'tool.example.textAnalyzer',
  version: '1.0.0',
  summary: 'Analyze text for sentiment, keywords, and readability',
  owner: 'ideamine-examples',
  capabilities: ['text-analysis', 'nlp'],

  // Input schema
  input_schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze',
        minLength: 1,
        maxLength: 10000,
      },
      include_sentiment: {
        type: 'boolean',
        description: 'Include sentiment analysis',
        default: true,
      },
      include_keywords: {
        type: 'boolean',
        description: 'Extract keywords',
        default: true,
      },
    },
    required: ['text'],
  },

  // Output schema
  output_schema: {
    type: 'object',
    properties: {
      word_count: {
        type: 'number',
        description: 'Number of words',
      },
      sentence_count: {
        type: 'number',
        description: 'Number of sentences',
      },
      sentiment: {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: -1, maximum: 1 },
          label: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
        },
      },
      keywords: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            word: { type: 'string' },
            frequency: { type: 'number' },
          },
        },
      },
      readability: {
        type: 'object',
        properties: {
          grade_level: { type: 'number' },
          reading_ease: { type: 'number' },
        },
      },
    },
    required: ['word_count', 'sentence_count'],
  },

  // Runtime configuration
  runtime: 'docker',
  image: 'node:20-alpine',
  entrypoint: ['node', '/app/index.js'],

  timeout_ms: 30000,
  cpu: '500m',
  memory: '512Mi',

  // Security
  security: {
    run_as_non_root: true,
    filesystem: 'read_only',
    network: 'none',
  },

  egress: {
    allow: [],
  },

  guardrails: {
    grounding_required: false,
    max_tokens: 0,
  },

  tags: ['nlp', 'text', 'analysis'],
  license: 'MIT',
};

// Define handler
const handler = createHandler(async (input, context) => {
  context.logger.info('Starting text analysis', {
    text_length: input.text.length,
  });

  // Count words
  const words = input.text.split(/\s+/).filter((w) => w.length > 0);
  const word_count = words.length;

  // Count sentences
  const sentences = input.text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentence_count = sentences.length;

  context.logger.debug('Basic stats calculated', {
    word_count,
    sentence_count,
  });

  const result: any = {
    word_count,
    sentence_count,
  };

  // Sentiment analysis (simplified)
  if (input.include_sentiment !== false) {
    context.logger.debug('Analyzing sentiment');

    // Simple sentiment based on positive/negative words
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'awful', 'poor', 'horrible'];

    const lowerText = input.text.toLowerCase();
    const positiveCount = positiveWords.filter((w) => lowerText.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => lowerText.includes(w)).length;

    const score = (positiveCount - negativeCount) / Math.max(1, positiveCount + negativeCount);
    const label =
      score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral';

    result.sentiment = { score, label };

    context.logger.debug('Sentiment calculated', { score, label });
  }

  // Extract keywords (simplified)
  if (input.include_keywords !== false) {
    context.logger.debug('Extracting keywords');

    const wordFreq: Record<string, number> = {};
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);

    words.forEach((word) => {
      const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized.length > 3 && !stopWords.has(normalized)) {
        wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
      }
    });

    const keywords = Object.entries(wordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word, frequency]) => ({ word, frequency }));

    result.keywords = keywords;

    context.logger.debug('Keywords extracted', { count: keywords.length });
  }

  // Readability analysis (simplified)
  const avg_words_per_sentence = word_count / Math.max(1, sentence_count);
  const avg_chars_per_word =
    input.text.length / Math.max(1, word_count);

  // Flesch Reading Ease (simplified)
  const reading_ease = Math.max(
    0,
    Math.min(100, 206.835 - 1.015 * avg_words_per_sentence - 84.6 * (avg_chars_per_word / 5))
  );

  // Grade level (simplified)
  const grade_level = Math.max(
    1,
    Math.min(18, 0.39 * avg_words_per_sentence + 11.8 * (avg_chars_per_word / 5) - 15.59)
  );

  result.readability = {
    grade_level: Math.round(grade_level * 10) / 10,
    reading_ease: Math.round(reading_ease * 10) / 10,
  };

  context.logger.info('Analysis complete', {
    word_count,
    sentence_count,
    keywords: result.keywords?.length || 0,
  });

  return result;
});

// Run server
async function main() {
  console.error('Starting Text Analyzer Tool Server...');
  console.error(`Tool: ${manifest.name} v${manifest.version}`);

  await runToolServer({
    manifest,
    handler,
    validate_input: true,
    validate_output: true,
  });
}

// Run
main().catch((error) => {
  console.error('Server failed:', error);
  process.exit(1);
});

import { z } from 'zod';
import { QdrantClient } from '@qdrant/js-client-rest';
import { BaseTool, ToolContext, ToolMetadata } from '../base/tool-base';
import { SimilarIdea, SimilarIdeaSchema } from '@ideamine/schemas';

/**
 * Input schema for searchSimilarIdeas tool
 */
const SearchSimilarIdeasInputSchema = z.object({
  ideaText: z.string().min(50).describe('Idea description to search against'),
  maxResults: z.number().min(1).max(10).default(5).describe('Maximum number of results to return'),
  minSimilarity: z.number().min(0).max(1).default(0.7).describe('Minimum similarity threshold'),
});

type SearchSimilarIdeasInput = z.infer<typeof SearchSimilarIdeasInputSchema>;

/**
 * Output schema for searchSimilarIdeas tool
 */
const SearchSimilarIdeasOutputSchema = z.object({
  similarIdeas: z.array(SimilarIdeaSchema),
  searchDurationMs: z.number(),
  totalMatches: z.number(),
});

type SearchSimilarIdeasOutput = z.infer<typeof SearchSimilarIdeasOutputSchema>;

/**
 * SearchSimilarIdeas Tool
 *
 * Searches vector database (Qdrant) for similar past projects to learn from.
 * Uses embedding similarity to find projects with similar descriptions.
 *
 * @category research
 * @cost $0.10
 * @avgDuration 500ms
 */
export class SearchSimilarIdeasTool extends BaseTool<
  SearchSimilarIdeasInput,
  SearchSimilarIdeasOutput
> {
  private qdrantClient: QdrantClient;
  private collectionName: string = 'ideas';

  constructor(qdrantConfig?: { url?: string; apiKey?: string }) {
    const metadata: ToolMetadata = {
      id: 'search-similar-ideas',
      name: 'searchSimilarIdeas',
      description:
        'Search vector database for similar past projects. Returns top matches with similarity scores and learnings.',
      version: '1.0.0',
      category: 'research',
      costEstimate: 0.1,
      avgDurationMs: 500,
      requiresApproval: false,
      resourceLimits: {
        maxDurationMs: 5000, // 5 seconds max
      },
    };

    super(metadata, SearchSimilarIdeasInputSchema, SearchSimilarIdeasOutputSchema);

    // Initialize Qdrant client
    this.qdrantClient = new QdrantClient({
      url: qdrantConfig?.url ?? process.env.QDRANT_URL ?? 'http://localhost:6333',
      apiKey: qdrantConfig?.apiKey ?? process.env.QDRANT_API_KEY,
    });
  }

  /**
   * Execute search for similar ideas
   */
  protected async executeImpl(
    input: SearchSimilarIdeasInput,
    context: ToolContext
  ): Promise<SearchSimilarIdeasOutput> {
    const startTime = Date.now();

    try {
      // Generate embedding for the idea text
      // TODO: Replace with actual embedding model (OpenAI text-embedding-3-large)
      const embedding = await this.generateEmbedding(input.ideaText);

      // Search Qdrant
      const searchResults = await this.qdrantClient.search(this.collectionName, {
        vector: embedding,
        limit: input.maxResults,
        score_threshold: input.minSimilarity,
        with_payload: true,
      });

      // Transform results to SimilarIdea format
      const similarIdeas: SimilarIdea[] = searchResults.map((result) => {
        const payload = result.payload as Record<string, unknown>;

        return {
          projectId: String(payload.projectId ?? result.id),
          title: String(payload.title ?? 'Unknown'),
          description: String(payload.description ?? ''),
          similarity: result.score ?? 0,
          outcome: this.mapOutcome(String(payload.outcome ?? 'in-progress')),
          learnings: Array.isArray(payload.learnings)
            ? payload.learnings.map(String)
            : [],
        };
      });

      const searchDurationMs = Date.now() - startTime;

      return {
        similarIdeas,
        searchDurationMs,
        totalMatches: searchResults.length,
      };
    } catch (error) {
      // If collection doesn't exist yet, return empty results
      if (error instanceof Error && error.message.includes('Not found')) {
        console.warn(`[SearchSimilarIdeas] Collection ${this.collectionName} not found, returning empty results`);
        return {
          similarIdeas: [],
          searchDurationMs: Date.now() - startTime,
          totalMatches: 0,
        };
      }

      throw error;
    }
  }

  /**
   * Generate embedding for text using OpenAI API
   *
   * Uses text-embedding-3-large model for high-quality semantic embeddings.
   * Falls back to simple hash-based embedding if API key not configured.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;

    // Use OpenAI API if key is configured
    if (apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-3-large',
            input: text,
            encoding_format: 'float',
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.warn('[SearchSimilarIdeas] OpenAI API error, falling back to hash:', error);
          return this.generateHashEmbedding(text);
        }

        const data = await response.json();
        return data.data[0].embedding;
      } catch (error) {
        console.warn('[SearchSimilarIdeas] Failed to generate embedding, falling back to hash:', error);
        return this.generateHashEmbedding(text);
      }
    }

    // Fallback to hash-based embedding if no API key
    console.warn('[SearchSimilarIdeas] OPENAI_API_KEY not configured, using hash-based embedding (less accurate)');
    return this.generateHashEmbedding(text);
  }

  /**
   * Generate simple hash-based embedding (fallback)
   */
  private generateHashEmbedding(text: string): number[]  {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(1536).fill(0);

    // Simple hash function for fallback
    words.forEach((word) => {
      const hash = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      embedding[hash % 1536] += 1;
    });

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * Map outcome string to valid enum value
   */
  private mapOutcome(outcome: string): 'success' | 'failed' | 'in-progress' {
    const normalized = outcome.toLowerCase();
    if (normalized === 'success' || normalized === 'completed') return 'success';
    if (normalized === 'failed' || normalized === 'cancelled') return 'failed';
    return 'in-progress';
  }

  /**
   * Ensure collection exists (for initialization)
   */
  async ensureCollection(): Promise<void> {
    try {
      await this.qdrantClient.getCollection(this.collectionName);
    } catch (error) {
      // Collection doesn't exist, create it
      await this.qdrantClient.createCollection(this.collectionName, {
        vectors: {
          size: 1536, // text-embedding-3-large dimension
          distance: 'Cosine',
        },
      });

      console.log(`[SearchSimilarIdeas] Created collection: ${this.collectionName}`);
    }
  }
}

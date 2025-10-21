/**
 * refine.cluster
 *
 * Groups similar answers by topic for fusion processing.
 *
 * Features:
 * - Vector-based clustering (cosine similarity)
 * - Automatic cluster count detection
 * - Quality metrics (purity, silhouette score)
 * - Topic labeling via LLM
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class ClusterTool implements Tool {
    readonly metadata: ToolMetadata;
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Build cosine similarity matrix
     */
    private buildSimilarityMatrix;
    /**
     * Cosine similarity between two vectors
     */
    private cosineSimilarity;
    /**
     * Hierarchical clustering using single-linkage
     */
    private hierarchicalClustering;
    /**
     * Calculate similarity between two clusters (average linkage)
     */
    private clusterSimilarity;
    /**
     * Generate topic labels using LLM
     */
    private labelClusters;
    /**
     * Calculate average cluster purity
     */
    private calculateAvgPurity;
}
export interface Cluster {
    id: string;
    answerIds: string[];
    texts: string[];
    topic: string;
    purity: number;
}
export declare function createClusterTool(): Tool;
//# sourceMappingURL=cluster.d.ts.map
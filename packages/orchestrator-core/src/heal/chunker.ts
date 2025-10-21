import path from 'path';
import pino from 'pino';

const logger = pino({ name: 'spec-shrinker' });

/**
 * Code chunk
 */
export interface CodeChunk {
  files: string[];
  estimatedLOC: number;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Spec Shrink / Chunking - Split massive work into smaller chunks
 *
 * Features:
 * - Chunk large codebases by directory/module
 * - Estimate LOC (lines of code) per chunk
 * - Respect max chunk size
 * - Preserve module boundaries
 *
 * Spec: orchestrator.txt:142-144, phase.txt:88
 */
export class SpecShrinker {
  private readonly DEFAULT_MAX_CHUNK_LOC = 10000; // 10k LOC default
  private readonly AVG_LOC_PER_FILE = 100; // Rough estimate

  /**
   * Chunk large codebase into smaller pieces
   *
   * @param codebase - Codebase with files and total LOC
   * @param maxChunkLOC - Maximum LOC per chunk (default: 10000)
   * @returns Array of chunks
   */
  async chunkLargeCodebase(
    codebase: { files: string[]; totalLOC?: number },
    maxChunkLOC: number = this.DEFAULT_MAX_CHUNK_LOC
  ): Promise<CodeChunk[]> {
    const totalLOC = codebase.totalLOC || this.estimateTotalLOC(codebase.files);

    logger.info(
      {
        fileCount: codebase.files.length,
        totalLOC,
        maxChunkLOC,
      },
      'Chunking large codebase'
    );

    if (totalLOC <= maxChunkLOC) {
      logger.debug('Codebase is small enough, no chunking needed');
      return [
        {
          files: codebase.files,
          estimatedLOC: totalLOC,
          chunkIndex: 0,
          totalChunks: 1,
        },
      ];
    }

    // Split by stories/services/modules (directories)
    const chunks: CodeChunk[] = [];

    // Group files by directory
    const filesByDir = this.groupFilesByDirectory(codebase.files);

    let currentChunk: string[] = [];
    let currentLOC = 0;

    for (const [dir, files] of Object.entries(filesByDir)) {
      const estimatedDirLOC = this.estimateLOC(files);

      // If adding this dir would exceed limit AND we have files in current chunk
      if (currentLOC + estimatedDirLOC > maxChunkLOC && currentChunk.length > 0) {
        // Flush current chunk
        chunks.push({
          files: currentChunk,
          estimatedLOC: currentLOC,
          chunkIndex: chunks.length,
          totalChunks: 0, // Will be set after all chunks created
        });

        logger.debug(
          { chunkIndex: chunks.length - 1, fileCount: currentChunk.length, loc: currentLOC },
          'Created chunk'
        );

        currentChunk = [];
        currentLOC = 0;
      }

      // Add directory files to current chunk
      currentChunk.push(...files);
      currentLOC += estimatedDirLOC;
    }

    // Flush remaining files
    if (currentChunk.length > 0) {
      chunks.push({
        files: currentChunk,
        estimatedLOC: currentLOC,
        chunkIndex: chunks.length,
        totalChunks: 0,
      });

      logger.debug(
        { chunkIndex: chunks.length - 1, fileCount: currentChunk.length, loc: currentLOC },
        'Created final chunk'
      );
    }

    // Update totalChunks for all chunks
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalChunks = totalChunks;
    });

    logger.info(
      {
        originalFileCount: codebase.files.length,
        chunkCount: chunks.length,
        avgFilesPerChunk: Math.round(codebase.files.length / chunks.length),
      },
      'Chunking complete'
    );

    return chunks;
  }

  /**
   * Group files by directory
   *
   * @param files - Array of file paths
   * @returns Map of directory → files
   */
  private groupFilesByDirectory(files: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    for (const file of files) {
      const dir = path.dirname(file);

      if (!groups[dir]) {
        groups[dir] = [];
      }

      groups[dir].push(file);
    }

    logger.debug({ directoryCount: Object.keys(groups).length }, 'Grouped files by directory');

    return groups;
  }

  /**
   * Estimate total LOC for file list
   *
   * @param files - Array of file paths
   * @returns Estimated LOC
   */
  private estimateTotalLOC(files: string[]): number {
    return this.estimateLOC(files);
  }

  /**
   * Estimate LOC for file list
   *
   * Uses simple heuristic: AVG_LOC_PER_FILE * file count
   *
   * @param files - Array of file paths
   * @returns Estimated LOC
   */
  private estimateLOC(files: string[]): number {
    return files.length * this.AVG_LOC_PER_FILE;
  }

  /**
   * Chunk questions or items list
   *
   * Generic method for chunking any large list
   *
   * @param items - Array of items to chunk
   * @param maxItemsPerChunk - Maximum items per chunk
   * @returns Array of item chunks
   */
  chunkItems<T>(items: T[], maxItemsPerChunk: number): T[][] {
    if (items.length <= maxItemsPerChunk) {
      return [items];
    }

    const chunks: T[][] = [];

    for (let i = 0; i < items.length; i += maxItemsPerChunk) {
      const chunk = items.slice(i, i + maxItemsPerChunk);
      chunks.push(chunk);
    }

    logger.debug(
      {
        itemCount: items.length,
        maxItemsPerChunk,
        chunkCount: chunks.length,
      },
      'Chunked items'
    );

    return chunks;
  }

  /**
   * Chunk by file size (requires actual file reading)
   *
   * More accurate than estimation, but requires file I/O
   *
   * @param fileLocMap - Map of file path → actual LOC
   * @param maxChunkLOC - Maximum LOC per chunk
   * @returns Array of chunks
   */
  chunkByActualSize(
    fileLocMap: Record<string, number>,
    maxChunkLOC: number = this.DEFAULT_MAX_CHUNK_LOC
  ): CodeChunk[] {
    const files = Object.keys(fileLocMap);
    const totalLOC = Object.values(fileLocMap).reduce((a, b) => a + b, 0);

    logger.info(
      { fileCount: files.length, totalLOC, maxChunkLOC },
      'Chunking by actual file sizes'
    );

    if (totalLOC <= maxChunkLOC) {
      return [
        {
          files,
          estimatedLOC: totalLOC,
          chunkIndex: 0,
          totalChunks: 1,
        },
      ];
    }

    const chunks: CodeChunk[] = [];
    let currentChunk: string[] = [];
    let currentLOC = 0;

    for (const file of files) {
      const fileLOC = fileLocMap[file];

      if (currentLOC + fileLOC > maxChunkLOC && currentChunk.length > 0) {
        chunks.push({
          files: currentChunk,
          estimatedLOC: currentLOC,
          chunkIndex: chunks.length,
          totalChunks: 0,
        });

        currentChunk = [];
        currentLOC = 0;
      }

      currentChunk.push(file);
      currentLOC += fileLOC;
    }

    if (currentChunk.length > 0) {
      chunks.push({
        files: currentChunk,
        estimatedLOC: currentLOC,
        chunkIndex: chunks.length,
        totalChunks: 0,
      });
    }

    // Update totalChunks
    const totalChunks = chunks.length;
    chunks.forEach((chunk) => {
      chunk.totalChunks = totalChunks;
    });

    logger.info({ chunkCount: chunks.length }, 'Chunking by actual size complete');

    return chunks;
  }
}

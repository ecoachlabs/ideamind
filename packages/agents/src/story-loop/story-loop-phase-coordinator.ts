import { BaseAgent } from '../base/base-agent';
import { PhaseCoordinator, PhaseInput, PhaseResult } from '../base/phase-coordinator';
import { PhaseCoordinatorConfig } from '../base/phase-coordinator-config';
import { Artifact } from '../base/types';
import { StoryCoderAgent } from './story-coder-agent';
import { CodeReviewerAgent } from './code-reviewer-agent';
import { UnitTestWriterAgent } from './unit-test-writer-agent';
import { loadAgentConfig } from '../config/config-loader';

/**
 * StoryLoopPhaseCoordinator
 *
 * Coordinates the Story Loop (STORY_LOOP) phase by iteratively implementing user stories.
 * Unlike other phases, this coordinator runs SEQUENTIALLY through user stories, executing
 * all 3 agents for each story before moving to the next.
 *
 * For each user story:
 * 1. StoryCoderAgent - Implements the code
 * 2. CodeReviewerAgent - Reviews the implementation
 * 3. UnitTestWriterAgent - Generates comprehensive tests
 *
 * Phase Requirements:
 * - Processes user stories from PRD phase
 * - Sequential execution (not parallel across stories)
 * - All 3 agents must succeed for each story
 * - Accumulates artifacts across all stories
 *
 * Performance:
 * - Per story: ~37 seconds (15s code + 10s review + 12s tests)
 * - Total time: ~37s × number of stories
 * - Can be optimized with story batching in future
 *
 * Input Requirements:
 * - User stories from PRD phase (feature-decomposition)
 * - Repository blueprint, architecture, API design, data model
 * - Acceptance criteria from PRD
 *
 * Output Artifacts:
 * - code-implementation: Generated code for each story
 * - code-review: Review findings for each implementation
 * - unit-test-suite: Tests for each implementation
 * - story-loop-complete: Aggregated results across all stories
 */
export class StoryLoopPhaseCoordinator extends PhaseCoordinator {
  private storyCoderAgent?: StoryCoderAgent;
  private codeReviewerAgent?: CodeReviewerAgent;
  private unitTestWriterAgent?: UnitTestWriterAgent;

  constructor(config?: Partial<PhaseCoordinatorConfig>) {
    super({
      phaseName: 'STORY_LOOP',
      budget: config?.budget || {
        maxCostUsd: 10.0, // Higher budget for iterative execution
        maxTokens: 200000,
      },
      minRequiredAgents: 3, // All 3 agents required per story
      maxConcurrency: 1, // Sequential story processing
      eventPublisher: config?.eventPublisher,
    });
  }

  /**
   * Initialize all 3 STORY_LOOP agents
   */
  protected async initializeAgents(): Promise<BaseAgent[]> {
    const agents: BaseAgent[] = [];

    try {
      // Load agent configurations
      const storyCoderConfig = await loadAgentConfig('story-loop', 'story-coder');
      const codeReviewerConfig = await loadAgentConfig('story-loop', 'code-reviewer');
      const unitTestWriterConfig = await loadAgentConfig('story-loop', 'unit-test-writer');

      // Initialize agents
      this.storyCoderAgent = new StoryCoderAgent(storyCoderConfig);
      agents.push(this.storyCoderAgent);

      this.codeReviewerAgent = new CodeReviewerAgent(codeReviewerConfig);
      agents.push(this.codeReviewerAgent);

      this.unitTestWriterAgent = new UnitTestWriterAgent(unitTestWriterConfig);
      agents.push(this.unitTestWriterAgent);

      this.logger.info(`Initialized ${agents.length} STORY_LOOP agents for sequential execution`);
    } catch (error) {
      this.logger.error('Failed to initialize STORY_LOOP agents', { error });
      throw error;
    }

    return agents;
  }

  /**
   * Execute the story loop phase - iterates through user stories
   */
  async execute(input: PhaseInput): Promise<PhaseResult> {
    const startTime = Date.now();

    try {
      // Initialize agents
      await this.initializeAgents();

      // Extract user stories from PRD phase
      const userStories = this.extractUserStories(input.previousArtifacts);

      if (!userStories || userStories.length === 0) {
        throw new Error('No user stories found from PRD phase');
      }

      this.logger.info(`Processing ${userStories.length} user stories`);

      // Determine how many stories to implement (respect budget/time constraints)
      const storiesToImplement = this.selectStoriesToImplement(userStories, input);

      this.logger.info(`Implementing ${storiesToImplement.length} of ${userStories.length} stories`);

      // Process each story sequentially
      const allArtifacts: Artifact[] = [];
      const storyResults: any[] = [];
      let totalCost = 0;

      for (let i = 0; i < storiesToImplement.length; i++) {
        const story = storiesToImplement[i];

        this.logger.info(`Processing story ${i + 1}/${storiesToImplement.length}: ${story.id} - ${story.title}`);

        const storyResult = await this.processStory(story, input);

        if (storyResult.success) {
          allArtifacts.push(...storyResult.artifacts);
          storyResults.push({
            storyId: story.id,
            success: true,
            artifacts: storyResult.artifacts.length,
          });
          totalCost += storyResult.cost || 0;
        } else {
          storyResults.push({
            storyId: story.id,
            success: false,
            error: storyResult.error,
          });
          this.logger.warn(`Story ${story.id} failed: ${storyResult.error}`);
        }

        // Check if we're exceeding budget
        if (totalCost >= (this.config.budget?.maxCostUsd || 10)) {
          this.logger.warn('Budget limit reached, stopping story processing');
          break;
        }
      }

      // Generate aggregated results
      const aggregatedArtifacts = await this.aggregateResults(
        storyResults,
        allArtifacts,
        input
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        artifacts: aggregatedArtifacts,
        cost: totalCost,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('Story loop phase failed', { error: errorMessage });

      return {
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a single user story through all 3 agents
   */
  private async processStory(story: any, input: PhaseInput): Promise<PhaseResult> {
    const storyStartTime = Date.now();
    const artifacts: Artifact[] = [];
    let totalCost = 0;

    try {
      // Step 1: Implement the story
      this.logger.info(`[${story.id}] Step 1: Implementing code...`);
      const codeResult = await this.storyCoderAgent!.execute({
        userStory: story,
        previousArtifacts: input.previousArtifacts,
        projectId: input.projectId,
        workflowRunId: input.workflowRunId,
        userId: input.userId,
      });

      if (!codeResult.success) {
        throw new Error(`Code implementation failed: ${codeResult.error}`);
      }

      artifacts.push(...codeResult.artifacts);
      totalCost += codeResult.cost || 0;

      const codeImplementation = codeResult.artifacts[0]?.content;

      // Step 2: Review the code
      this.logger.info(`[${story.id}] Step 2: Reviewing code...`);
      const reviewResult = await this.codeReviewerAgent!.execute({
        codeImplementation,
        previousArtifacts: input.previousArtifacts,
        projectId: input.projectId,
        workflowRunId: input.workflowRunId,
        userId: input.userId,
      });

      if (!reviewResult.success) {
        throw new Error(`Code review failed: ${reviewResult.error}`);
      }

      artifacts.push(...reviewResult.artifacts);
      totalCost += reviewResult.cost || 0;

      const codeReview = reviewResult.artifacts[0]?.content;

      // Step 3: Generate tests
      this.logger.info(`[${story.id}] Step 3: Generating tests...`);
      const testResult = await this.unitTestWriterAgent!.execute({
        codeImplementation,
        codeReview,
        previousArtifacts: input.previousArtifacts,
        projectId: input.projectId,
        workflowRunId: input.workflowRunId,
        userId: input.userId,
      });

      if (!testResult.success) {
        throw new Error(`Test generation failed: ${testResult.error}`);
      }

      artifacts.push(...testResult.artifacts);
      totalCost += testResult.cost || 0;

      const duration = Date.now() - storyStartTime;

      this.logger.info(`[${story.id}] Completed in ${duration}ms (${artifacts.length} artifacts, $${totalCost.toFixed(2)})`);

      return {
        success: true,
        artifacts,
        cost: totalCost,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - storyStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        duration,
        artifacts,
        cost: totalCost,
      };
    }
  }

  /**
   * Extract user stories from PRD artifacts
   */
  private extractUserStories(previousArtifacts: any[]): any[] {
    const decomposition = previousArtifacts?.find((a) => a.type === 'feature-decomposition')?.content;

    if (!decomposition?.userStories) {
      return [];
    }

    return decomposition.userStories;
  }

  /**
   * Select which stories to implement based on priority and constraints
   */
  private selectStoriesToImplement(allStories: any[], input: PhaseInput): any[] {
    // Sort by priority (must-have first, then should-have, then nice-to-have)
    const priorityOrder = { 'must-have': 0, 'should-have': 1, 'nice-to-have': 2 };

    const sorted = [...allStories].sort((a, b) => {
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // If same priority, sort by story points (smaller first for quick wins)
      return (a.storyPoints || 0) - (b.storyPoints || 0);
    });

    // Take top stories based on budget constraints
    // Estimate: ~37 seconds and ~$0.20 per story
    const maxBudget = this.config.budget?.maxCostUsd || 10;
    const estimatedCostPerStory = 0.20;
    const maxStories = Math.floor(maxBudget / estimatedCostPerStory);

    // Also respect must-have stories
    const mustHaveStories = sorted.filter((s) => s.priority === 'must-have');
    const shouldHaveStories = sorted.filter((s) => s.priority === 'should-have');

    let selected: any[] = [];

    // Always include all must-have stories (up to max)
    selected.push(...mustHaveStories.slice(0, maxStories));

    // Add should-have if budget allows
    if (selected.length < maxStories) {
      const remaining = maxStories - selected.length;
      selected.push(...shouldHaveStories.slice(0, remaining));
    }

    return selected;
  }

  /**
   * Aggregate results from all processed stories
   */
  private async aggregateResults(
    storyResults: any[],
    allArtifacts: Artifact[],
    input: PhaseInput
  ): Promise<Artifact[]> {
    const aggregatedArtifacts = [...allArtifacts];

    // Calculate summary metrics
    const successfulStories = storyResults.filter((r) => r.success).length;
    const failedStories = storyResults.filter((r) => !r.success).length;

    const codeImplementations = allArtifacts.filter((a) => a.type === 'code-implementation');
    const codeReviews = allArtifacts.filter((a) => a.type === 'code-review');
    const testSuites = allArtifacts.filter((a) => a.type === 'unit-test-suite');

    // Calculate aggregate metrics
    const totalFiles = codeImplementations.reduce((sum, impl) => {
      return sum + (impl.content?.files?.length || 0);
    }, 0);

    const totalTests = testSuites.reduce((sum, suite) => {
      return sum + (suite.content?.summary?.totalTests || 0);
    }, 0);

    const averageCoverage = testSuites.length > 0
      ? testSuites.reduce((sum, suite) => sum + (suite.content?.summary?.estimatedCoverage || 0), 0) / testSuites.length
      : 0;

    const averageQualityScore = codeReviews.length > 0
      ? codeReviews.reduce((sum, review) => sum + (review.content?.qualityMetrics?.overallScore || 0), 0) / codeReviews.length
      : 0;

    const criticalIssues = codeReviews.reduce((sum, review) => {
      return sum + (review.content?.summary?.criticalIssues || 0);
    }, 0);

    // Create aggregated story-loop-complete artifact
    const storyLoopComplete: Artifact = {
      type: 'story-loop-complete',
      content: {
        summary: {
          totalStories: storyResults.length,
          successfulStories,
          failedStories,
          totalFiles,
          totalTests,
          averageCoverage: Math.round(averageCoverage),
          averageQualityScore: Math.round(averageQualityScore),
          criticalIssues,
        },
        storyResults: storyResults.map((r) => ({
          storyId: r.storyId,
          success: r.success,
          error: r.error,
        })),
        codeMetrics: {
          totalLinesOfCode: codeImplementations.reduce((sum, impl) => {
            return sum + (impl.content?.files?.reduce((s: number, f: any) => s + (f.linesOfCode || 0), 0) || 0);
          }, 0),
          totalFiles,
          languagesUsed: this.extractLanguages(codeImplementations),
        },
        qualityMetrics: {
          averageScore: Math.round(averageQualityScore),
          criticalIssues,
          majorIssues: codeReviews.reduce((sum, r) => sum + (r.content?.summary?.majorIssues || 0), 0),
          minorIssues: codeReviews.reduce((sum, r) => sum + (r.content?.summary?.minorIssues || 0), 0),
        },
        testingMetrics: {
          totalTests,
          averageCoverage: Math.round(averageCoverage),
          testFiles: testSuites.reduce((sum, s) => sum + (s.content?.summary?.testFiles || 0), 0),
        },
      },
      metadata: {
        phaseId: 'STORY_LOOP',
        projectId: input.projectId,
        workflowRunId: input.workflowRunId,
        generatedAt: new Date().toISOString(),
        generatedBy: 'StoryLoopPhaseCoordinator',
        artifactsGenerated: allArtifacts.length,
      },
    };

    aggregatedArtifacts.push(storyLoopComplete);

    this.logger.info('STORY_LOOP phase aggregation complete', {
      totalStories: storyResults.length,
      successfulStories,
      failedStories,
      totalFiles,
      totalTests,
      averageCoverage: Math.round(averageCoverage),
    });

    return aggregatedArtifacts;
  }

  /**
   * Extract unique languages used across implementations
   */
  private extractLanguages(implementations: Artifact[]): string[] {
    const languages = new Set<string>();

    implementations.forEach((impl) => {
      impl.content?.files?.forEach((file: any) => {
        if (file.language) {
          languages.add(file.language);
        }
      });
    });

    return Array.from(languages);
  }

  /**
   * This coordinator doesn't use the standard parallel aggregation pattern
   */
  protected async aggregateResults(
    successes: Array<{ agent: BaseAgent; artifacts: Artifact[] }>,
    failures: Array<{ agent: BaseAgent; error: Error }>,
    phaseInput: PhaseInput
  ): Promise<Artifact[]> {
    // Not used - we override execute() for sequential processing
    return [];
  }
}

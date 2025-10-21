/**
 * Answer Agent (QAA) - Autonomous Answering Component
 *
 * Answers questions using artifacts, Knowledge Map, and allowlisted tools.
 * Returns 'UNKNOWN' when confidence < 0.6 (becomes ASSUMPTION).
 *
 * Spec References:
 * - orchestrator.txt:24-25 (autonomous clarification, never user)
 * - orchestrator.txt:172-175 (QAA answers questions)
 * - UNIFIED_IMPLEMENTATION_SPEC.md Section 2.1
 */

import { BaseAgent } from '../../../agent-sdk/src/base-agent';
import type {
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
} from '../../../agent-sdk/src/types';
import type {
  Question,
  Answer,
  AnswerGenerationInput,
  Citation,
} from './types';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

/**
 * AnswerAgent - Generates evidence-based answers to questions
 *
 * Algorithm:
 * 1. For each question:
 *    a. Search artifacts for relevant information (RAG)
 *    b. If insufficient, try allowlisted tools
 *    c. If still insufficient, return UNKNOWN
 * 2. Generate answer with citations
 * 3. Score confidence (0-1)
 * 4. Return Answer (or UNKNOWN if confidence < 0.6)
 */
export class AnswerAgent extends BaseAgent {
  private anthropic: Anthropic;
  private confidenceThreshold = 0.6; // Below this → UNKNOWN

  constructor(config?: any) {
    super({
      agentId: 'answer-agent-qaa',
      phase: config?.phase || 'UNKNOWN',
      toolPolicy: {
        allowedTools: config?.allowlisted_tools || [],
        maxToolInvocations: 5,
        voiThreshold: 0.7,
      },
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Main execution: Answer questions using artifacts + tools
   */
  async execute(input: AnswerGenerationInput): Promise<Answer[]> {
    const startTime = Date.now();
    console.log(`[QAA] Answering ${input.questions.length} questions for phase ${input.phase}`);

    const answers: Answer[] = [];

    try {
      for (const question of input.questions) {
        const answer = await this.answerQuestion(question, input);
        answers.push(answer);
      }

      const unknownCount = answers.filter((a) => a.answer === 'UNKNOWN').length;
      const durationMs = Date.now() - startTime;

      console.log(
        `[QAA] Generated ${answers.length} answers (${unknownCount} UNKNOWN) in ${durationMs}ms`
      );

      return answers;
    } catch (error) {
      console.error('[QAA] Answer generation failed:', error);
      throw error;
    }
  }

  /**
   * PLANNER: Create execution plan
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      steps: [
        { id: 'search_artifacts', description: 'Search artifacts for answers' },
        { id: 'invoke_tools', description: 'Use tools if artifacts insufficient' },
        { id: 'generate_answers', description: 'Generate answers with citations' },
      ],
      estimatedDurationMs: 60000, // 60s
      estimatedCostUsd: 0.10,
    };
  }

  /**
   * REASONING: Initial reasoning without tools
   */
  protected async reason(plan: ExecutionPlan, input: AgentInput): Promise<ReasoningResult> {
    return {
      content: 'Answer generation complete',
      confidence: 0.9,
      needsImprovement: false,
    };
  }

  /**
   * Generate artifacts (answers array)
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<Array<{ type: string; content: unknown }>> {
    return [
      {
        type: 'answers',
        content: { answers: [] }, // Populated in execute()
      },
    ];
  }

  /**
   * Answer a single question using artifacts + tools
   */
  private async answerQuestion(
    question: Question,
    input: AnswerGenerationInput
  ): Promise<Answer> {
    const answerId = `A-${input.phase}-${crypto.randomBytes(8).toString('hex')}`;

    try {
      // Step 1: Search artifacts for evidence
      const artifactEvidence = await this.searchArtifacts(question, input.artifacts);

      // Step 2: If artifact evidence is strong enough, generate answer
      if (artifactEvidence.confidence >= 0.7) {
        return await this.generateAnswerFromEvidence(
          answerId,
          question,
          artifactEvidence.citations,
          artifactEvidence.content,
          artifactEvidence.confidence,
          input.phase
        );
      }

      // Step 3: Try allowlisted tools for additional evidence
      console.log(
        `[QAA] Artifact confidence ${artifactEvidence.confidence.toFixed(2)} < 0.7, trying tools...`
      );

      const toolEvidence = await this.searchWithTools(question, input.allowlisted_tools, input.phase);

      // Combine artifact + tool evidence
      const combinedCitations = [...artifactEvidence.citations, ...toolEvidence.citations];
      const combinedContent = `${artifactEvidence.content}\n\n${toolEvidence.content}`;
      const combinedConfidence = Math.max(artifactEvidence.confidence, toolEvidence.confidence);

      // Step 4: Generate answer or return UNKNOWN
      if (combinedConfidence >= this.confidenceThreshold) {
        return await this.generateAnswerFromEvidence(
          answerId,
          question,
          combinedCitations,
          combinedContent,
          combinedConfidence,
          input.phase
        );
      }

      // Confidence too low → UNKNOWN
      return this.generateUnknownAnswer(answerId, question, combinedCitations, input.phase);
    } catch (error) {
      console.error(`[QAA] Failed to answer question ${question.id}:`, error);

      // Return UNKNOWN on error
      return this.generateUnknownAnswer(answerId, question, [], input.phase);
    }
  }

  /**
   * Search artifacts for relevant information (simple RAG)
   */
  private async searchArtifacts(
    question: Question,
    artifacts: any[]
  ): Promise<{ citations: Citation[]; content: string; confidence: number }> {
    const citations: Citation[] = [];
    let content = '';
    let confidence = 0;

    try {
      // Prepare artifacts for search
      const artifactsText = artifacts
        .map((a, idx) => {
          const artifactId = a.id || `artifact-${idx}`;
          const artifactContent = this.extractArtifactContent(a);
          return { id: artifactId, content: artifactContent };
        })
        .filter((a) => a.content.length > 0);

      if (artifactsText.length === 0) {
        return { citations: [], content: '', confidence: 0 };
      }

      // Use LLM to search artifacts for relevant information
      const prompt = `You are searching through artifacts to answer a specific question.

QUESTION:
${question.text}

ARTIFACTS:
${artifactsText.map((a) => `[${a.id}]\n${a.content.substring(0, 1000)}`).join('\n\n---\n\n')}

Task:
1. Search the artifacts for information relevant to the question
2. Extract relevant excerpts from artifacts
3. Rate your confidence in answering this question (0.0-1.0)

Respond in JSON format:
{
  "relevant_artifacts": [
    {
      "artifact_id": "...",
      "excerpt": "relevant text from artifact (max 200 chars)",
      "relevance": 0.0-1.0
    }
  ],
  "synthesis": "A brief synthesis of what you found (2-3 sentences)",
  "confidence": 0.0-1.0
}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        temperature: 0.3,
        system: 'You are an expert at searching documents for specific information.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseContent = response.content[0];
      if (responseContent.type === 'text') {
        const jsonMatch = responseContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const searchResult = JSON.parse(jsonMatch[0]);

          // Build citations
          for (const artifact of searchResult.relevant_artifacts || []) {
            citations.push({
              type: 'artifact',
              id: artifact.artifact_id,
              excerpt: artifact.excerpt,
              confidence: artifact.relevance,
            });
          }

          content = searchResult.synthesis || '';
          confidence = searchResult.confidence || 0;
        }
      }
    } catch (error) {
      console.error('[QAA] Artifact search failed:', error);
      // Return empty results on error
    }

    return { citations, content, confidence };
  }

  /**
   * Search using allowlisted tools
   */
  private async searchWithTools(
    question: Question,
    allowlistedTools: string[],
    phase: string
  ): Promise<{ citations: Citation[]; content: string; confidence: number }> {
    // Placeholder: Tool invocation would happen via ToolExecutor
    // For MVP, return empty results
    console.log(`[QAA] Tool search not yet implemented (${allowlistedTools.length} tools available)`);

    return { citations: [], content: '', confidence: 0 };
  }

  /**
   * Generate answer from evidence
   */
  private async generateAnswerFromEvidence(
    answerId: string,
    question: Question,
    citations: Citation[],
    evidenceContent: string,
    confidence: number,
    phase: string
  ): Promise<Answer> {
    try {
      // Use LLM to synthesize final answer from evidence
      const prompt = `You are answering a specific question based on provided evidence.

QUESTION:
${question.text}

EVIDENCE:
${evidenceContent}

Task: Provide a clear, concise answer to the question based ONLY on the evidence provided.
If the evidence is insufficient, say so explicitly.
Keep your answer to 2-3 sentences.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        temperature: 0.2,
        system: 'You are a precise question-answering system.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const answerContent = response.content[0];
      const answerText = answerContent.type === 'text' ? answerContent.text : 'ERROR';

      return {
        answer_id: answerId,
        question_id: question.id,
        answer: answerText,
        citations,
        confidence,
        generated_by: `QAA-${phase}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[QAA] Answer synthesis failed:', error);
      throw error;
    }
  }

  /**
   * Generate UNKNOWN answer when confidence too low
   */
  private generateUnknownAnswer(
    answerId: string,
    question: Question,
    citations: Citation[],
    phase: string
  ): Answer {
    const nextSteps = this.suggestNextSteps(question);

    return {
      answer_id: answerId,
      question_id: question.id,
      answer: 'UNKNOWN',
      citations,
      confidence: 0,
      reasoning: `Insufficient evidence to answer this question with confidence >= ${this.confidenceThreshold}`,
      next_steps: nextSteps,
      generated_by: `QAA-${phase}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Suggest next steps for UNKNOWN answers
   */
  private suggestNextSteps(question: Question): string[] {
    const steps: string[] = [];

    // Category-specific suggestions
    switch (question.category) {
      case 'clarification':
        steps.push('Add clarification to requirements documentation');
        steps.push('Consult with stakeholders in next sync');
        break;
      case 'assumption':
        steps.push('Document this as an assumption for validation');
        steps.push('Schedule assumption review session');
        break;
      case 'risk':
        steps.push('Add to risk register for mitigation planning');
        steps.push('Perform deeper risk analysis in next phase');
        break;
      case 'completeness':
        steps.push('Identify missing information sources');
        steps.push('Add data collection task to backlog');
        break;
      default:
        steps.push('Revisit this question in next phase with more context');
    }

    return steps;
  }

  /**
   * Extract content from artifact
   */
  private extractArtifactContent(artifact: any): string {
    if (typeof artifact === 'string') {
      return artifact;
    }

    if (artifact.content) {
      return typeof artifact.content === 'string'
        ? artifact.content
        : JSON.stringify(artifact.content);
    }

    return JSON.stringify(artifact);
  }
}

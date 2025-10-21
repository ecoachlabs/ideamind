import { ChatAnthropic } from '@langchain/anthropic';
import {
  BaseAgent,
  AgentInput,
  AgentOutput,
  ExecutionPlan,
  ReasoningResult,
  AgentConfig,
} from '@ideamine/agent-sdk';
import { ValidateConstraintsTool } from '@ideamine/tools';
import { IdeaSpecSchema } from '@ideamine/schemas';
import { z } from 'zod';

/**
 * Clarifying question
 */
interface ClarifyingQuestion {
  id: string;
  question: string;
  category: 'users' | 'problem' | 'solution' | 'constraints' | 'success';
  priority: 'high' | 'medium' | 'low';
  optional: boolean;
}

/**
 * Extracted idea information
 */
interface ExtractedInfo {
  title?: string;
  description?: string;
  targetUsers?: string[];
  problemStatement?: string;
  successCriteria?: string[];
  constraints?: {
    budget?: { min: number; max: number; currency: string };
    timeline?: { min: number; max: number; unit: string };
    technicalPreferences?: string[];
    complianceRequirements?: string[];
  };
}

/**
 * Partial IdeaSpec (before validation)
 */
type PartialIdeaSpec = Partial<z.infer<typeof IdeaSpecSchema>>;

/**
 * IntakeExpanderAgent
 *
 * Second agent in the intake phase. Responsible for:
 * 1. Generating 5-10 clarifying questions to ask the user
 * 2. Extracting structured information from the idea text
 * 3. Validating constraints (budget, timeline, compliance)
 * 4. Creating a partial IdeaSpec artifact
 *
 * Extends BaseAgent with Analyzer-inside-Agent pattern.
 */
export class IntakeExpanderAgent extends BaseAgent {
  private llm: ChatAnthropic;
  private validateConstraintsTool: ValidateConstraintsTool;

  constructor(config: AgentConfig) {
    super(config);

    // Initialize Claude LLM from config
    this.llm = new ChatAnthropic({
      modelName: config.llm.model,
      temperature: config.llm.temperature, // 0.4 for more creative questions
      maxTokens: config.llm.maxTokens,
      topP: config.llm.topP,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize tools
    this.validateConstraintsTool = new ValidateConstraintsTool();

    // Register tools with the agent
    this.registerTool(this.validateConstraintsTool);
  }

  /**
   * STEP 1: PLANNER
   * Create execution plan for expansion
   */
  protected async plan(input: AgentInput): Promise<ExecutionPlan> {
    return {
      agentId: this.config.id,
      steps: [
        {
          stepId: 'extract-information',
          description: 'Extract structured information from idea text',
          estimatedDurationMs: 3000,
          requiredTools: [],
        },
        {
          stepId: 'generate-questions',
          description: 'Generate 5-10 clarifying questions for the user',
          estimatedDurationMs: 4000,
          requiredTools: [],
        },
        {
          stepId: 'validate-constraints',
          description: 'Validate budget, timeline, and compliance constraints',
          estimatedDurationMs: 2000,
          requiredTools: ['validate-constraints'],
        },
        {
          stepId: 'create-partial-spec',
          description: 'Create partial IdeaSpec artifact',
          estimatedDurationMs: 1000,
          requiredTools: [],
        },
      ],
      estimatedTotalDurationMs: 10000,
      confidence: 0.85,
    };
  }

  /**
   * STEP 2: REASONING
   * Extract information and generate questions using Claude
   */
  protected async reason(
    plan: ExecutionPlan,
    input: AgentInput
  ): Promise<ReasoningResult> {
    const ideaText = this.extractIdeaText(input);
    const classification = this.extractClassification(input);

    try {
      // Step 1: Extract structured information
      const extractedInfo = await this.extractInformation(ideaText);

      // Step 2: Generate clarifying questions
      const questions = await this.generateQuestions(ideaText, extractedInfo, classification);

      return {
        reasoning: `Extracted ${Object.keys(extractedInfo).filter(k => extractedInfo[k as keyof ExtractedInfo]).length} fields and generated ${questions.length} clarifying questions`,
        confidence: this.calculateConfidence(extractedInfo),
        intermediate: {
          extractedInfo,
          questions,
          needsConstraintValidation: true,
        },
      };
    } catch (error) {
      console.warn('[IntakeExpanderAgent] LLM failed, using heuristic fallback:', error);
      return this.heuristicExpansion(ideaText);
    }
  }

  /**
   * STEP 3: Generate expansion artifacts
   */
  protected async generateArtifacts(
    result: ReasoningResult,
    input: AgentInput
  ): Promise<AgentOutput['artifacts']> {
    const extractedInfo: ExtractedInfo = result.intermediate.extractedInfo;
    const questions: ClarifyingQuestion[] = result.intermediate.questions;

    // Create partial IdeaSpec
    const partialSpec: PartialIdeaSpec = {
      version: '1.0.0',
      title: extractedInfo.title,
      description: extractedInfo.description,
      targetUsers: extractedInfo.targetUsers,
      problemStatement: extractedInfo.problemStatement,
      successCriteria: extractedInfo.successCriteria,
      constraints: extractedInfo.constraints as any,
    };

    return [
      {
        type: 'intake-expansion',
        version: '1.0.0',
        content: {
          partialSpec,
          questions,
          extractionConfidence: result.confidence,
          missingFields: this.identifyMissingFields(extractedInfo),
        },
        generatedAt: new Date().toISOString(),
        agentId: this.config.id,
      },
    ];
  }

  /**
   * Extract idea text from input
   */
  private extractIdeaText(input: AgentInput): string {
    if (typeof input.data === 'string') {
      return input.data;
    }
    if (input.data && typeof input.data === 'object') {
      return (input.data as any).ideaText || (input.data as any).description || '';
    }
    return '';
  }

  /**
   * Extract classification from previous agent's output
   */
  private extractClassification(input: AgentInput): any {
    if (input.data && typeof input.data === 'object') {
      return (input.data as any).classification;
    }
    return null;
  }

  /**
   * Extract structured information using Claude
   */
  private async extractInformation(ideaText: string): Promise<ExtractedInfo> {
    const prompt = this.buildExtractionPrompt(ideaText);

    const response = await this.llm.invoke(prompt);
    const analysisText = response.content.toString();

    return this.parseExtraction(analysisText);
  }

  /**
   * Build extraction prompt for Claude
   */
  private buildExtractionPrompt(ideaText: string): string {
    return `You are an expert business analyst. Extract structured information from the following software idea.

Idea Description:
${ideaText}

Extract the following information and provide it in JSON format:

{
  "title": "<short project title, 5-50 chars>",
  "description": "<detailed description, 100-500 chars>",
  "targetUsers": ["<user group 1>", "<user group 2>"],
  "problemStatement": "<what problem does this solve, 50-200 chars>",
  "successCriteria": ["<success metric 1>", "<success metric 2>"],
  "constraints": {
    "budget": { "min": <number>, "max": <number>, "currency": "USD" },
    "timeline": { "min": <number>, "max": <number>, "unit": "days" },
    "technicalPreferences": ["<tech 1>", "<tech 2>"],
    "complianceRequirements": ["<compliance 1>", "<compliance 2>"]
  }
}

Guidelines:
- **title**: Infer a concise, descriptive title if not explicitly mentioned
- **description**: Expand on the idea with more detail
- **targetUsers**: Identify who will use this (e.g., "developers", "small businesses", "students")
- **problemStatement**: What specific problem or pain point does this address?
- **successCriteria**: How will we measure success? (e.g., "1000 active users", "90% uptime")
- **constraints.budget**: Extract if mentioned, otherwise omit
- **constraints.timeline**: Extract if mentioned, otherwise omit
- **technicalPreferences**: Technologies mentioned (e.g., "React", "Python", "AWS")
- **complianceRequirements**: GDPR, HIPAA, SOC2, PCI-DSS, etc. if mentioned

IMPORTANT:
- Only include fields where information is explicitly stated or can be clearly inferred
- Omit fields entirely if no information is available (don't guess)
- For arrays, provide at least 1 item if the field is included

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse extraction from Claude response
   */
  private parseExtraction(analysisText: string): ExtractedInfo {
    try {
      // Extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize and validate extracted data
      const extracted: ExtractedInfo = {};

      if (parsed.title && typeof parsed.title === 'string') {
        extracted.title = parsed.title.slice(0, 200);
      }

      if (parsed.description && typeof parsed.description === 'string') {
        extracted.description = parsed.description.slice(0, 5000);
      }

      if (Array.isArray(parsed.targetUsers) && parsed.targetUsers.length > 0) {
        extracted.targetUsers = parsed.targetUsers.slice(0, 10);
      }

      if (parsed.problemStatement && typeof parsed.problemStatement === 'string') {
        extracted.problemStatement = parsed.problemStatement.slice(0, 2000);
      }

      if (Array.isArray(parsed.successCriteria) && parsed.successCriteria.length > 0) {
        extracted.successCriteria = parsed.successCriteria.slice(0, 10);
      }

      if (parsed.constraints) {
        extracted.constraints = {};

        if (parsed.constraints.budget) {
          extracted.constraints.budget = {
            min: Math.max(100, parsed.constraints.budget.min || 100),
            max: Math.min(10000, parsed.constraints.budget.max || 10000),
            currency: 'USD',
          };
        }

        if (parsed.constraints.timeline) {
          extracted.constraints.timeline = {
            min: Math.max(3, parsed.constraints.timeline.min || 3),
            max: Math.min(90, parsed.constraints.timeline.max || 90),
            unit: 'days',
          };
        }

        if (Array.isArray(parsed.constraints.technicalPreferences)) {
          extracted.constraints.technicalPreferences =
            parsed.constraints.technicalPreferences.slice(0, 10);
        }

        if (Array.isArray(parsed.constraints.complianceRequirements)) {
          extracted.constraints.complianceRequirements =
            parsed.constraints.complianceRequirements.slice(0, 5);
        }
      }

      return extracted;
    } catch (error) {
      console.warn('[IntakeExpanderAgent] Failed to parse extraction:', error);
      return {};
    }
  }

  /**
   * Generate clarifying questions using Claude
   */
  private async generateQuestions(
    ideaText: string,
    extractedInfo: ExtractedInfo,
    classification: any
  ): Promise<ClarifyingQuestion[]> {
    const prompt = this.buildQuestionsPrompt(ideaText, extractedInfo, classification);

    const response = await this.llm.invoke(prompt);
    const analysisText = response.content.toString();

    return this.parseQuestions(analysisText);
  }

  /**
   * Build questions prompt for Claude
   */
  private buildQuestionsPrompt(
    ideaText: string,
    extractedInfo: ExtractedInfo,
    classification: any
  ): string {
    const missingFields = this.identifyMissingFields(extractedInfo);
    const categoryContext =
      classification?.category ? `Category: ${classification.category}` : '';

    return `You are a product discovery expert. Generate 5-10 clarifying questions to help fully understand this software idea.

${categoryContext}

Idea Description:
${ideaText}

Already Extracted:
${JSON.stringify(extractedInfo, null, 2)}

Missing Fields:
${missingFields.join(', ')}

Generate clarifying questions in the following JSON format:

{
  "questions": [
    {
      "id": "q1",
      "question": "<the question to ask>",
      "category": "<users|problem|solution|constraints|success>",
      "priority": "<high|medium|low>",
      "optional": <true|false>
    }
  ]
}

Guidelines:
- **Focus on missing or unclear information** from the extraction
- **High priority**: Critical for understanding the idea (users, problem, core solution)
- **Medium priority**: Important but can be inferred (success metrics, constraints)
- **Low priority**: Nice to have details (edge cases, future features)
- **Categories**:
  - users: Who are the users? What are their roles?
  - problem: What problem are we solving? Why does it matter?
  - solution: How should this work? What features are essential?
  - constraints: Budget, timeline, tech stack, compliance?
  - success: How do we measure success? What are the KPIs?
- **Make questions specific and actionable**, not vague
- Generate 5-10 questions total
- Mark optional=true for low priority questions

Examples of GOOD questions:
- "Who is the primary user: software developers, designers, or product managers?"
- "What is the approximate budget range for this project (e.g., $500, $2000, $5000+)?"
- "Which platforms should we target first: web, iOS, Android, or all three?"

Examples of BAD questions:
- "Can you tell me more about the idea?" (too vague)
- "Is this important?" (not actionable)

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse questions from Claude response
   */
  private parseQuestions(analysisText: string): ClarifyingQuestion[] {
    try {
      // Extract JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (!Array.isArray(parsed.questions)) {
        throw new Error('No questions array found');
      }

      // Normalize and validate questions
      const questions: ClarifyingQuestion[] = parsed.questions
        .slice(0, 10)
        .map((q: any, index: number) => ({
          id: q.id || `q${index + 1}`,
          question: q.question || '',
          category: this.normalizeQuestionCategory(q.category),
          priority: this.normalizeQuestionPriority(q.priority),
          optional: q.optional === true,
        }))
        .filter((q: ClarifyingQuestion) => q.question.length > 0);

      return questions;
    } catch (error) {
      console.warn('[IntakeExpanderAgent] Failed to parse questions:', error);
      return this.generateDefaultQuestions();
    }
  }

  /**
   * Normalize question category
   */
  private normalizeQuestionCategory(
    category: string
  ): 'users' | 'problem' | 'solution' | 'constraints' | 'success' {
    const normalized = category?.toLowerCase();
    if (normalized === 'users') return 'users';
    if (normalized === 'problem') return 'problem';
    if (normalized === 'solution') return 'solution';
    if (normalized === 'constraints') return 'constraints';
    if (normalized === 'success') return 'success';
    return 'solution'; // default
  }

  /**
   * Normalize question priority
   */
  private normalizeQuestionPriority(priority: string): 'high' | 'medium' | 'low' {
    const normalized = priority?.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium'; // default
  }

  /**
   * Generate default questions (fallback)
   */
  private generateDefaultQuestions(): ClarifyingQuestion[] {
    return [
      {
        id: 'q1',
        question: 'Who are the primary users of this application?',
        category: 'users',
        priority: 'high',
        optional: false,
      },
      {
        id: 'q2',
        question: 'What is the main problem this application solves?',
        category: 'problem',
        priority: 'high',
        optional: false,
      },
      {
        id: 'q3',
        question: 'What is your budget range for this project?',
        category: 'constraints',
        priority: 'medium',
        optional: false,
      },
      {
        id: 'q4',
        question: 'What is your desired timeline for completion?',
        category: 'constraints',
        priority: 'medium',
        optional: false,
      },
      {
        id: 'q5',
        question: 'How will you measure the success of this project?',
        category: 'success',
        priority: 'medium',
        optional: false,
      },
    ];
  }

  /**
   * Heuristic expansion (fallback when LLM unavailable)
   */
  private heuristicExpansion(ideaText: string): ReasoningResult {
    // Extract basic information using simple heuristics
    const extractedInfo: ExtractedInfo = {
      description: ideaText.slice(0, 500),
      title: ideaText.split('\n')[0].slice(0, 100) || 'Untitled Project',
    };

    const questions = this.generateDefaultQuestions();

    return {
      reasoning: 'Heuristic-based expansion (LLM unavailable). Using default questions.',
      confidence: 0.5,
      intermediate: {
        extractedInfo,
        questions,
        needsConstraintValidation: true,
      },
    };
  }

  /**
   * Calculate confidence based on extracted information
   */
  private calculateConfidence(extractedInfo: ExtractedInfo): number {
    let score = 0;
    let maxScore = 7;

    if (extractedInfo.title) score += 1;
    if (extractedInfo.description) score += 1;
    if (extractedInfo.targetUsers && extractedInfo.targetUsers.length > 0) score += 1;
    if (extractedInfo.problemStatement) score += 1;
    if (extractedInfo.successCriteria && extractedInfo.successCriteria.length > 0) score += 1;
    if (extractedInfo.constraints?.budget) score += 0.5;
    if (extractedInfo.constraints?.timeline) score += 0.5;
    if (extractedInfo.constraints?.technicalPreferences) score += 0.5;
    if (extractedInfo.constraints?.complianceRequirements) score += 0.5;

    return Math.min(0.95, score / maxScore);
  }

  /**
   * Identify missing required fields
   */
  private identifyMissingFields(extractedInfo: ExtractedInfo): string[] {
    const missing: string[] = [];

    if (!extractedInfo.title) missing.push('title');
    if (!extractedInfo.description) missing.push('description');
    if (!extractedInfo.targetUsers || extractedInfo.targetUsers.length === 0)
      missing.push('targetUsers');
    if (!extractedInfo.problemStatement) missing.push('problemStatement');
    if (!extractedInfo.successCriteria || extractedInfo.successCriteria.length === 0)
      missing.push('successCriteria');
    if (!extractedInfo.constraints?.budget) missing.push('constraints.budget');
    if (!extractedInfo.constraints?.timeline) missing.push('constraints.timeline');

    return missing;
  }
}

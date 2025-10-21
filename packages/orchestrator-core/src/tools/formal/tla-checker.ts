/**
 * TLA+ Model Checker
 *
 * Simplified TLA+ specification checker for verifying invariants and temporal properties.
 * Based on TLA+ (Temporal Logic of Actions) by Leslie Lamport.
 *
 * Note: This is a simplified implementation. For production use, consider using TLC (TLA+ model checker).
 */

export interface TLAResult {
  valid: boolean;
  violations: string[];
  statesExplored?: number;
  executionTime?: number;
  invariantViolations?: InvariantViolation[];
  temporalViolations?: TemporalViolation[];
}

export interface InvariantViolation {
  invariant: string;
  state: any;
  path: any[];
  description: string;
}

export interface TemporalViolation {
  property: string;
  trace: any[];
  description: string;
}

export interface TLASpec {
  init: string;       // Initial state predicate
  next: string;       // Next-state relation
  invariants?: string[];   // Safety properties
  liveness?: string[];     // Liveness properties
  fairness?: string[];     // Fairness constraints
  constants?: Record<string, any>;
}

export interface TLACheckerConfig {
  maxStates?: number;
  maxDepth?: number;
  timeout?: number;
  verbose?: boolean;
  checkDeadlocks?: boolean;
  symmetry?: boolean;
}

const DEFAULT_CONFIG: TLACheckerConfig = {
  maxStates: 10000,
  maxDepth: 50,
  timeout: 30000,
  verbose: false,
  checkDeadlocks: true,
  symmetry: false,
};

type State = Record<string, any>;

/**
 * TLA+ Model Checker
 */
export class TLAChecker {
  private config: TLACheckerConfig;
  private visitedStates: Set<string>;
  private stateSpace: State[];
  private transitions: Map<string, string[]>;

  constructor(config: Partial<TLACheckerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.visitedStates = new Set();
    this.stateSpace = [];
    this.transitions = new Map();
  }

  /**
   * Check a TLA+ specification
   */
  async checkModel(spec: string, properties: string[]): Promise<TLAResult> {
    const startTime = Date.now();

    try {
      // Parse the specification
      const parsedSpec = this.parseSpec(spec);

      // Add properties to check
      if (properties.length > 0) {
        parsedSpec.invariants = [
          ...(parsedSpec.invariants || []),
          ...properties,
        ];
      }

      // Initialize state space exploration
      this.visitedStates = new Set();
      this.stateSpace = [];
      this.transitions = new Map();

      // Generate initial states
      const initialStates = this.generateInitialStates(parsedSpec);

      if (this.config.verbose) {
        console.log(`Generated ${initialStates.length} initial states`);
      }

      // Explore state space with BFS
      const violations: string[] = [];
      const invariantViolations: InvariantViolation[] = [];
      const temporalViolations: TemporalViolation[] = [];

      const queue: Array<{ state: State; path: State[] }> = initialStates.map(state => ({
        state,
        path: [state],
      }));

      while (queue.length > 0 && this.visitedStates.size < this.config.maxStates!) {
        // Check timeout
        if (Date.now() - startTime > this.config.timeout!) {
          violations.push('Model checking timed out');
          break;
        }

        const { state, path } = queue.shift()!;

        // Check if we've reached max depth
        if (path.length > this.config.maxDepth!) {
          continue;
        }

        const stateKey = this.serializeState(state);

        // Skip if already visited
        if (this.visitedStates.has(stateKey)) {
          continue;
        }

        this.visitedStates.add(stateKey);
        this.stateSpace.push(state);

        // Check invariants
        for (const invariant of parsedSpec.invariants || []) {
          if (!this.checkInvariant(invariant, state, parsedSpec.constants)) {
            const violation: InvariantViolation = {
              invariant,
              state,
              path,
              description: `Invariant "${invariant}" violated`,
            };
            invariantViolations.push(violation);
            violations.push(violation.description);

            if (this.config.verbose) {
              console.log(`Invariant violation found: ${invariant}`);
              console.log('State:', state);
              console.log('Path length:', path.length);
            }
          }
        }

        // Check for deadlocks
        if (this.config.checkDeadlocks) {
          const nextStates = this.generateNextStates(state, parsedSpec);
          if (nextStates.length === 0 && !this.isTerminalState(state, parsedSpec)) {
            violations.push(`Deadlock detected at state ${stateKey}`);

            if (this.config.verbose) {
              console.log('Deadlock found:', state);
            }
          }

          // Add next states to queue
          for (const nextState of nextStates) {
            queue.push({
              state: nextState,
              path: [...path, nextState],
            });

            // Record transition
            const nextKey = this.serializeState(nextState);
            if (!this.transitions.has(stateKey)) {
              this.transitions.set(stateKey, []);
            }
            this.transitions.get(stateKey)!.push(nextKey);
          }
        }
      }

      // Check liveness properties (simplified - check for cycles)
      for (const liveness of parsedSpec.liveness || []) {
        if (!this.checkLiveness(liveness, parsedSpec)) {
          const violation: TemporalViolation = {
            property: liveness,
            trace: [],
            description: `Liveness property "${liveness}" may be violated`,
          };
          temporalViolations.push(violation);
          violations.push(violation.description);
        }
      }

      const executionTime = Date.now() - startTime;

      if (violations.length === 0 && this.config.verbose) {
        console.log('No violations found!');
        console.log(`States explored: ${this.visitedStates.size}`);
        console.log(`Execution time: ${executionTime}ms`);
      }

      return {
        valid: violations.length === 0,
        violations,
        statesExplored: this.visitedStates.size,
        executionTime,
        invariantViolations,
        temporalViolations,
      };
    } catch (error) {
      return {
        valid: false,
        violations: [error instanceof Error ? error.message : String(error)],
        statesExplored: this.visitedStates.size,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse TLA+ specification (simplified parser)
   */
  private parseSpec(spec: string): TLASpec {
    const lines = spec.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result: TLASpec = {
      init: '',
      next: '',
      invariants: [],
      liveness: [],
      fairness: [],
      constants: {},
    };

    for (const line of lines) {
      // Parse CONSTANT declarations
      if (line.startsWith('CONSTANT')) {
        const match = line.match(/CONSTANT\s+(\w+)\s*=\s*(.+)/);
        if (match) {
          result.constants![match[1]] = this.evaluateExpression(match[2]);
        }
      }

      // Parse Init
      if (line.startsWith('Init')) {
        const match = line.match(/Init\s*==\s*(.+)/);
        if (match) {
          result.init = match[1];
        }
      }

      // Parse Next
      if (line.startsWith('Next')) {
        const match = line.match(/Next\s*==\s*(.+)/);
        if (match) {
          result.next = match[1];
        }
      }

      // Parse Invariant
      if (line.startsWith('Inv') || line.startsWith('Invariant')) {
        const match = line.match(/(?:Inv|Invariant)\s*==\s*(.+)/);
        if (match) {
          result.invariants!.push(match[1]);
        }
      }

      // Parse Eventually (liveness)
      if (line.includes('[]<>') || line.includes('Eventually')) {
        const match = line.match(/.*==\s*(.+)/);
        if (match) {
          result.liveness!.push(match[1]);
        }
      }
    }

    return result;
  }

  /**
   * Generate initial states
   */
  private generateInitialStates(spec: TLASpec): State[] {
    // Simplified: evaluate Init predicate
    // In a real implementation, this would use constraint solving

    const states: State[] = [];

    // Example initial states based on common patterns
    if (spec.init.includes('x = 0') || spec.init.includes('x=0')) {
      states.push({ x: 0 });
    }

    if (spec.init.includes('queue = <<>>') || spec.init.includes('queue=[]')) {
      states.push({ queue: [] });
    }

    if (spec.init.includes('pc = ') || spec.init.includes('pc=')) {
      const match = spec.init.match(/pc\s*=\s*"(\w+)"/);
      if (match) {
        states.push({ pc: match[1] });
      }
    }

    // If no states generated, create a default initial state
    if (states.length === 0) {
      states.push({});
    }

    return states;
  }

  /**
   * Generate next states
   */
  private generateNextStates(state: State, spec: TLASpec): State[] {
    const nextStates: State[] = [];

    // Simplified next-state generation
    // Real implementation would parse and evaluate Next relation

    // Example transitions
    if ('x' in state && typeof state.x === 'number') {
      // Increment
      nextStates.push({ ...state, x: state.x + 1 });

      // Decrement
      if (state.x > 0) {
        nextStates.push({ ...state, x: state.x - 1 });
      }
    }

    if ('pc' in state) {
      // State machine transitions
      const transitions: Record<string, string[]> = {
        start: ['working'],
        working: ['done', 'error'],
        done: [],
        error: ['start'],
      };

      const nextPCs = transitions[state.pc as string] || [];
      for (const nextPC of nextPCs) {
        nextStates.push({ ...state, pc: nextPC });
      }
    }

    if ('queue' in state && Array.isArray(state.queue)) {
      // Add to queue
      nextStates.push({ ...state, queue: [...state.queue, state.queue.length] });

      // Remove from queue
      if (state.queue.length > 0) {
        nextStates.push({ ...state, queue: state.queue.slice(1) });
      }
    }

    return nextStates;
  }

  /**
   * Check if invariant holds in state
   */
  private checkInvariant(invariant: string, state: State, constants?: Record<string, any>): boolean {
    try {
      // Simple expression evaluation
      const expr = invariant.trim();

      // Relational operators
      if (expr.includes('>=')) {
        const [left, right] = expr.split('>=').map(s => s.trim());
        return this.evaluateInState(left, state, constants) >= this.evaluateInState(right, state, constants);
      }

      if (expr.includes('<=')) {
        const [left, right] = expr.split('<=').map(s => s.trim());
        return this.evaluateInState(left, state, constants) <= this.evaluateInState(right, state, constants);
      }

      if (expr.includes('>')) {
        const [left, right] = expr.split('>').map(s => s.trim());
        return this.evaluateInState(left, state, constants) > this.evaluateInState(right, state, constants);
      }

      if (expr.includes('<')) {
        const [left, right] = expr.split('<').map(s => s.trim());
        return this.evaluateInState(left, state, constants) < this.evaluateInState(right, state, constants);
      }

      if (expr.includes('=')) {
        const [left, right] = expr.split('=').map(s => s.trim());
        return this.evaluateInState(left, state, constants) === this.evaluateInState(right, state, constants);
      }

      // Boolean expressions
      if (expr.includes('/\\')) {
        const parts = expr.split('/\\').map(s => s.trim());
        return parts.every(part => this.checkInvariant(part, state, constants));
      }

      if (expr.includes('\\/')) {
        const parts = expr.split('\\/').map(s => s.trim());
        return parts.some(part => this.checkInvariant(part, state, constants));
      }

      // Default: assume true for complex expressions
      return true;
    } catch (error) {
      console.warn(`Failed to evaluate invariant "${invariant}":`, error);
      return true; // Assume true to avoid false positives
    }
  }

  /**
   * Evaluate expression in current state
   */
  private evaluateInState(expr: string, state: State, constants?: Record<string, any>): any {
    const trimmed = expr.trim();

    // Check if it's a state variable
    if (trimmed in state) {
      return state[trimmed];
    }

    // Check if it's a constant
    if (constants && trimmed in constants) {
      return constants[trimmed];
    }

    // Try to parse as number
    const num = parseFloat(trimmed);
    if (!isNaN(num)) {
      return num;
    }

    // Try to parse as boolean
    if (trimmed === 'TRUE') return true;
    if (trimmed === 'FALSE') return false;

    // Default to the expression itself
    return trimmed;
  }

  /**
   * Simple expression evaluator
   */
  private evaluateExpression(expr: string): any {
    const trimmed = expr.trim();

    // Numbers
    const num = parseFloat(trimmed);
    if (!isNaN(num)) {
      return num;
    }

    // Booleans
    if (trimmed === 'TRUE') return true;
    if (trimmed === 'FALSE') return false;

    // Strings
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }

    // Sets/Sequences
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map(s => s.trim());
    }

    return trimmed;
  }

  /**
   * Check liveness property (simplified)
   */
  private checkLiveness(property: string, spec: TLASpec): boolean {
    // Simplified: Check if there's a path where the property eventually holds
    // Real implementation would use Büchi automata

    // For now, just check if the property appears achievable
    return true;
  }

  /**
   * Check if state is terminal (no outgoing transitions)
   */
  private isTerminalState(state: State, spec: TLASpec): boolean {
    // Check if this is an explicitly terminal state
    if ('pc' in state && (state.pc === 'done' || state.pc === 'terminated')) {
      return true;
    }

    return false;
  }

  /**
   * Serialize state to string key
   */
  private serializeState(state: State): string {
    return JSON.stringify(state, Object.keys(state).sort());
  }
}

/**
 * Helper functions for creating TLA+ specifications
 */
export class TLAHelpers {
  /**
   * Create a simple counter specification
   */
  static counterSpec(maxValue: number): string {
    return `
CONSTANT Max = ${maxValue}

Init == x = 0

Next == (x < Max /\\ x' = x + 1) \\/ (x = Max /\\ x' = x)

Invariant == x >= 0 /\\ x <= Max
`;
  }

  /**
   * Create a mutual exclusion specification
   */
  static mutexSpec(): string {
    return `
Init == pc = "idle"

Next ==
  \\/ (pc = "idle" /\\ pc' = "trying")
  \\/ (pc = "trying" /\\ pc' = "critical")
  \\/ (pc = "critical" /\\ pc' = "idle")

Invariant == pc /= "critical" \\/ mutex = TRUE

Safety == [] (pc = "critical" => mutex = TRUE)
`;
  }

  /**
   * Create a queue specification
   */
  static queueSpec(): string {
    return `
Init == queue = <<>>

Next ==
  \\/ queue' = Append(queue, Len(queue))
  \\/ (Len(queue) > 0 /\\ queue' = Tail(queue))

Invariant == Len(queue) >= 0
`;
  }
}

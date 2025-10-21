/**
 * Property-Based Testing (QuickCheck-style)
 *
 * Automatically generates test cases to verify properties hold for all inputs.
 * Inspired by QuickCheck (Haskell) and fast-check (TypeScript).
 */

export interface PropertyResult {
  passed: boolean;
  counterexample?: any;
  shrunkCounterexample?: any;
  numTests?: number;
  seed?: number;
  failedAfter?: number;
  error?: string;
}

export interface PropertyConfig {
  numTests?: number;
  maxSize?: number;
  seed?: number;
  timeout?: number;
  verbose?: boolean;
  shrink?: boolean;
}

export type Arbitrary<T> = {
  generate(rng: RandomGenerator, size: number): T;
  shrink(value: T): T[];
};

export type Property<T> = (value: T) => boolean | Promise<boolean>;

const DEFAULT_CONFIG: PropertyConfig = {
  numTests: 100,
  maxSize: 100,
  seed: Date.now(),
  timeout: 5000,
  verbose: false,
  shrink: true,
};

/**
 * Simple Random Number Generator
 */
class RandomGenerator {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Linear congruential generator
   */
  next(): number {
    this.state = (this.state * 1103515245 + 12345) % 2147483648;
    return this.state / 2147483648;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

/**
 * Built-in Arbitrary Generators
 */
export class Arbitraries {
  /**
   * Generate arbitrary integers
   */
  static integer(min: number = -1000, max: number = 1000): Arbitrary<number> {
    return {
      generate(rng: RandomGenerator, size: number): number {
        const actualMax = Math.min(max, size);
        const actualMin = Math.max(min, -size);
        return rng.nextInt(actualMin, actualMax);
      },
      shrink(value: number): number[] {
        if (value === 0) return [];
        const candidates: number[] = [0];

        // Shrink towards zero
        if (Math.abs(value) > 1) {
          candidates.push(Math.floor(value / 2));
          candidates.push(Math.ceil(value / 2));
        }
        if (value > 0) {
          candidates.push(value - 1);
        } else if (value < 0) {
          candidates.push(value + 1);
        }

        return candidates.filter(c => Math.abs(c) < Math.abs(value));
      },
    };
  }

  /**
   * Generate arbitrary strings
   */
  static string(minLength: number = 0, maxLength: number = 20): Arbitrary<string> {
    return {
      generate(rng: RandomGenerator, size: number): string {
        const actualMaxLength = Math.min(maxLength, size);
        const length = rng.nextInt(minLength, actualMaxLength);
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
          result += chars[rng.nextInt(0, chars.length - 1)];
        }
        return result;
      },
      shrink(value: string): string[] {
        if (value.length === 0) return [];
        const candidates: string[] = [];

        // Empty string
        candidates.push('');

        // Remove half
        if (value.length > 1) {
          candidates.push(value.substring(0, Math.floor(value.length / 2)));
          candidates.push(value.substring(Math.floor(value.length / 2)));
        }

        // Remove one character
        if (value.length > 1) {
          for (let i = 0; i < value.length; i++) {
            candidates.push(value.substring(0, i) + value.substring(i + 1));
          }
        }

        return candidates.filter(c => c.length < value.length);
      },
    };
  }

  /**
   * Generate arbitrary arrays
   */
  static array<T>(element: Arbitrary<T>, minLength: number = 0, maxLength: number = 10): Arbitrary<T[]> {
    return {
      generate(rng: RandomGenerator, size: number): T[] {
        const actualMaxLength = Math.min(maxLength, size);
        const length = rng.nextInt(minLength, actualMaxLength);
        const result: T[] = [];
        for (let i = 0; i < length; i++) {
          result.push(element.generate(rng, size));
        }
        return result;
      },
      shrink(value: T[]): T[][] {
        if (value.length === 0) return [];
        const candidates: T[][] = [];

        // Empty array
        candidates.push([]);

        // Remove half
        if (value.length > 1) {
          candidates.push(value.slice(0, Math.floor(value.length / 2)));
          candidates.push(value.slice(Math.floor(value.length / 2)));
        }

        // Remove one element
        if (value.length > 1) {
          for (let i = 0; i < value.length; i++) {
            candidates.push([...value.slice(0, i), ...value.slice(i + 1)]);
          }
        }

        return candidates.filter(c => c.length < value.length);
      },
    };
  }

  /**
   * Generate arbitrary booleans
   */
  static boolean(): Arbitrary<boolean> {
    return {
      generate(rng: RandomGenerator, size: number): boolean {
        return rng.next() < 0.5;
      },
      shrink(value: boolean): boolean[] {
        return value ? [false] : [];
      },
    };
  }

  /**
   * Generate arbitrary objects
   */
  static object<T extends Record<string, any>>(
    schema: { [K in keyof T]: Arbitrary<T[K]> }
  ): Arbitrary<T> {
    return {
      generate(rng: RandomGenerator, size: number): T {
        const result: any = {};
        for (const [key, arbitrary] of Object.entries(schema)) {
          result[key] = arbitrary.generate(rng, size);
        }
        return result;
      },
      shrink(value: T): T[] {
        // Simplified shrinking for objects
        return [];
      },
    };
  }

  /**
   * One of several arbitraries
   */
  static oneOf<T>(...arbitraries: Arbitrary<T>[]): Arbitrary<T> {
    return {
      generate(rng: RandomGenerator, size: number): T {
        const chosen = rng.choice(arbitraries);
        return chosen.generate(rng, size);
      },
      shrink(value: T): T[] {
        // Try shrinking with each arbitrary
        const results: T[] = [];
        for (const arb of arbitraries) {
          results.push(...arb.shrink(value));
        }
        return results;
      },
    };
  }
}

/**
 * Property Tester
 */
export class PropertyTester {
  private config: PropertyConfig;

  constructor(config: Partial<PropertyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Test a property with generated values
   */
  async testProperty<T>(
    property: Property<T>,
    generator: Arbitrary<T>
  ): Promise<PropertyResult> {
    const rng = new RandomGenerator(this.config.seed!);
    let failedValue: T | undefined;
    let testNumber = 0;

    try {
      for (let i = 0; i < this.config.numTests!; i++) {
        testNumber = i + 1;

        // Generate test value with increasing size
        const size = Math.min(i, this.config.maxSize!);
        const value = generator.generate(rng, size);

        if (this.config.verbose) {
          console.log(`Test ${testNumber}:`, value);
        }

        // Test property with timeout
        const passed = await this.runWithTimeout(property, value);

        if (!passed) {
          failedValue = value;
          break;
        }
      }

      // If all tests passed
      if (!failedValue) {
        return {
          passed: true,
          numTests: this.config.numTests,
          seed: this.config.seed,
        };
      }

      // Property failed - try to shrink counterexample
      let shrunkValue = failedValue;
      if (this.config.shrink) {
        shrunkValue = await this.shrink(property, failedValue!, generator);
      }

      return {
        passed: false,
        counterexample: failedValue,
        shrunkCounterexample: shrunkValue,
        numTests: this.config.numTests,
        seed: this.config.seed,
        failedAfter: testNumber,
      };
    } catch (error) {
      return {
        passed: false,
        counterexample: failedValue,
        numTests: this.config.numTests,
        seed: this.config.seed,
        failedAfter: testNumber,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run property with timeout
   */
  private async runWithTimeout<T>(property: Property<T>, value: T): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Property test timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      Promise.resolve(property(value))
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Shrink a failing test case to find minimal counterexample
   */
  private async shrink<T>(
    property: Property<T>,
    failingValue: T,
    generator: Arbitrary<T>
  ): Promise<T> {
    let current = failingValue;
    let shrinkAttempts = 0;
    const maxShrinkAttempts = 100;

    while (shrinkAttempts < maxShrinkAttempts) {
      const candidates = generator.shrink(current);

      if (candidates.length === 0) {
        break; // No more shrinking possible
      }

      let foundSmaller = false;
      for (const candidate of candidates) {
        try {
          const passed = await this.runWithTimeout(property, candidate);
          if (!passed) {
            // Found a smaller failing case
            current = candidate;
            foundSmaller = true;
            if (this.config.verbose) {
              console.log('Shrunk to:', candidate);
            }
            break;
          }
        } catch (error) {
          // Candidate also fails
          current = candidate;
          foundSmaller = true;
          break;
        }
      }

      if (!foundSmaller) {
        break; // No smaller failing case found
      }

      shrinkAttempts++;
    }

    return current;
  }

  /**
   * Convenience method for common properties
   */
  async forAll<T>(
    generator: Arbitrary<T>,
    property: Property<T>
  ): Promise<PropertyResult> {
    return this.testProperty(property, generator);
  }
}

/**
 * Common property assertions
 */
export class PropertyAssertions {
  /**
   * Assert idempotence: f(f(x)) === f(x)
   */
  static idempotent<T>(fn: (x: T) => T): Property<T> {
    return (value: T) => {
      const once = fn(value);
      const twice = fn(once);
      return JSON.stringify(once) === JSON.stringify(twice);
    };
  }

  /**
   * Assert commutativity: f(a, b) === f(b, a)
   */
  static commutative<T, R>(fn: (a: T, b: T) => R): Property<[T, T]> {
    return ([a, b]: [T, T]) => {
      const result1 = fn(a, b);
      const result2 = fn(b, a);
      return JSON.stringify(result1) === JSON.stringify(result2);
    };
  }

  /**
   * Assert associativity: f(f(a, b), c) === f(a, f(b, c))
   */
  static associative<T>(fn: (a: T, b: T) => T): Property<[T, T, T]> {
    return ([a, b, c]: [T, T, T]) => {
      const result1 = fn(fn(a, b), c);
      const result2 = fn(a, fn(b, c));
      return JSON.stringify(result1) === JSON.stringify(result2);
    };
  }

  /**
   * Assert round-trip: decode(encode(x)) === x
   */
  static roundTrip<T, E>(encode: (x: T) => E, decode: (e: E) => T): Property<T> {
    return (value: T) => {
      const encoded = encode(value);
      const decoded = decode(encoded);
      return JSON.stringify(value) === JSON.stringify(decoded);
    };
  }
}

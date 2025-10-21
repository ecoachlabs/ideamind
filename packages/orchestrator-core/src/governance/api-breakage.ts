/**
 * API Breakage Detection
 *
 * Roadmap: M2 - Governance I
 *
 * Guard: guard.api.breakage
 * Tool: tool.api.diffTest
 *
 * Detects breaking API changes and runs differential tests.
 *
 * Acceptance:
 * - All breaking changes caught on test repo
 * - Gate blocks release
 */

import pino from 'pino';
import { Pool } from 'pg';
import * as yaml from 'yaml';
import { promises as fs } from 'fs';

const logger = pino({ name: 'api-breakage' });

// ============================================================================
// Types
// ============================================================================

export interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    responses?: Record<string, any>;
    parameters?: Record<string, any>;
  };
}

export interface BreakingChange {
  type:
    | 'endpoint_removed'
    | 'method_removed'
    | 'required_param_added'
    | 'param_type_changed'
    | 'response_format_changed'
    | 'status_code_removed'
    | 'auth_requirement_added';
  severity: 'critical' | 'major' | 'minor';
  path: string;
  details: string;
  oldValue?: any;
  newValue?: any;
}

export interface APIBreakageResult {
  hasBreakingChanges: boolean;
  breakingChanges: BreakingChange[];
  nonBreakingChanges: string[];
  diffTestResults?: DiffTestResult[];
}

export interface DiffTestResult {
  endpoint: string;
  method: string;
  passed: boolean;
  oldResponse?: any;
  newResponse?: any;
  diff?: any;
}

// ============================================================================
// API Breakage Guard
// ============================================================================

export class APIBreakageGuard {
  constructor(private db: Pool) {}

  /**
   * Check for breaking changes between two OpenAPI specs
   */
  async check(oldSpec: OpenAPISpec, newSpec: OpenAPISpec): Promise<APIBreakageResult> {
    logger.info(
      { oldVersion: oldSpec.info.version, newVersion: newSpec.info.version },
      'Checking for API breaking changes'
    );

    const breakingChanges: BreakingChange[] = [];
    const nonBreakingChanges: string[] = [];

    // Check for removed endpoints
    for (const path in oldSpec.paths) {
      if (!(path in newSpec.paths)) {
        breakingChanges.push({
          type: 'endpoint_removed',
          severity: 'critical',
          path,
          details: `Endpoint ${path} was removed`,
        });
      } else {
        // Check for removed methods
        const oldMethods = Object.keys(oldSpec.paths[path]);
        const newMethods = Object.keys(newSpec.paths[path]);

        for (const method of oldMethods) {
          if (!newMethods.includes(method)) {
            breakingChanges.push({
              type: 'method_removed',
              severity: 'critical',
              path: `${method.toUpperCase()} ${path}`,
              details: `Method ${method.toUpperCase()} was removed from ${path}`,
            });
          } else {
            // Check parameters
            const paramChanges = this.checkParameters(
              path,
              method,
              oldSpec.paths[path][method],
              newSpec.paths[path][method]
            );
            breakingChanges.push(...paramChanges.breaking);
            nonBreakingChanges.push(...paramChanges.nonBreaking);

            // Check responses
            const responseChanges = this.checkResponses(
              path,
              method,
              oldSpec.paths[path][method],
              newSpec.paths[path][method]
            );
            breakingChanges.push(...responseChanges.breaking);
            nonBreakingChanges.push(...responseChanges.nonBreaking);
          }
        }
      }
    }

    // Check for new endpoints (non-breaking)
    for (const path in newSpec.paths) {
      if (!(path in oldSpec.paths)) {
        nonBreakingChanges.push(`New endpoint: ${path}`);
      }
    }

    logger.info(
      {
        breaking: breakingChanges.length,
        nonBreaking: nonBreakingChanges.length,
      },
      'API breakage check complete'
    );

    return {
      hasBreakingChanges: breakingChanges.length > 0,
      breakingChanges,
      nonBreakingChanges,
    };
  }

  /**
   * Check parameter changes
   */
  private checkParameters(
    path: string,
    method: string,
    oldOp: any,
    newOp: any
  ): {
    breaking: BreakingChange[];
    nonBreaking: string[];
  } {
    const breaking: BreakingChange[] = [];
    const nonBreaking: string[] = [];

    const oldParams = oldOp.parameters || [];
    const newParams = newOp.parameters || [];

    // Check for new required parameters (breaking)
    for (const newParam of newParams) {
      const oldParam = oldParams.find((p: any) => p.name === newParam.name);

      if (!oldParam && newParam.required) {
        breaking.push({
          type: 'required_param_added',
          severity: 'major',
          path: `${method.toUpperCase()} ${path}`,
          details: `Required parameter '${newParam.name}' was added`,
          newValue: newParam,
        });
      } else if (!oldParam && !newParam.required) {
        nonBreaking.push(
          `Optional parameter '${newParam.name}' added to ${method.toUpperCase()} ${path}`
        );
      }

      // Check for parameter type changes
      if (oldParam && oldParam.schema?.type !== newParam.schema?.type) {
        breaking.push({
          type: 'param_type_changed',
          severity: 'major',
          path: `${method.toUpperCase()} ${path}`,
          details: `Parameter '${newParam.name}' type changed from ${oldParam.schema?.type} to ${newParam.schema?.type}`,
          oldValue: oldParam.schema?.type,
          newValue: newParam.schema?.type,
        });
      }
    }

    // Check for removed required parameters (breaking)
    for (const oldParam of oldParams) {
      const newParam = newParams.find((p: any) => p.name === oldParam.name);

      if (!newParam && oldParam.required) {
        breaking.push({
          type: 'required_param_added', // Reusing type
          severity: 'major',
          path: `${method.toUpperCase()} ${path}`,
          details: `Required parameter '${oldParam.name}' was removed`,
          oldValue: oldParam,
        });
      }
    }

    return { breaking, nonBreaking };
  }

  /**
   * Check response changes
   */
  private checkResponses(
    path: string,
    method: string,
    oldOp: any,
    newOp: any
  ): {
    breaking: BreakingChange[];
    nonBreaking: string[];
  } {
    const breaking: BreakingChange[] = [];
    const nonBreaking: string[] = [];

    const oldResponses = oldOp.responses || {};
    const newResponses = newOp.responses || {};

    // Check for removed success responses (breaking)
    for (const status in oldResponses) {
      if (parseInt(status) < 400 && !(status in newResponses)) {
        breaking.push({
          type: 'status_code_removed',
          severity: 'major',
          path: `${method.toUpperCase()} ${path}`,
          details: `Success response ${status} was removed`,
          oldValue: status,
        });
      }
    }

    // Check for response schema changes
    for (const status in oldResponses) {
      if (status in newResponses) {
        const oldSchema = oldResponses[status].content?.['application/json']?.schema;
        const newSchema = newResponses[status].content?.['application/json']?.schema;

        if (oldSchema && newSchema) {
          const schemaChanges = this.checkSchemaCompatibility(oldSchema, newSchema);
          if (schemaChanges.length > 0) {
            breaking.push({
              type: 'response_format_changed',
              severity: 'major',
              path: `${method.toUpperCase()} ${path}`,
              details: `Response ${status} schema changed: ${schemaChanges.join(', ')}`,
            });
          }
        }
      }
    }

    return { breaking, nonBreaking };
  }

  /**
   * Check schema compatibility
   */
  private checkSchemaCompatibility(oldSchema: any, newSchema: any): string[] {
    const changes: string[] = [];

    // Check for removed required properties
    const oldRequired = oldSchema.required || [];
    const newRequired = newSchema.required || [];

    for (const prop of oldRequired) {
      if (!newRequired.includes(prop)) {
        changes.push(`required property '${prop}' removed`);
      }
    }

    // Check for property type changes
    const oldProps = oldSchema.properties || {};
    const newProps = newSchema.properties || {};

    for (const prop in oldProps) {
      if (prop in newProps) {
        if (oldProps[prop].type !== newProps[prop].type) {
          changes.push(`property '${prop}' type changed`);
        }
      } else if (oldRequired.includes(prop)) {
        changes.push(`required property '${prop}' removed from response`);
      }
    }

    return changes;
  }

  /**
   * Load OpenAPI spec from file
   */
  async loadSpec(filePath: string): Promise<OpenAPISpec> {
    const content = await fs.readFile(filePath, 'utf-8');

    if (filePath.endsWith('.json')) {
      return JSON.parse(content);
    } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      return yaml.parse(content);
    } else {
      throw new Error(`Unsupported spec format: ${filePath}`);
    }
  }
}

// ============================================================================
// API Diff Test Tool
// ============================================================================

export class APIDiffTestTool {
  constructor(private db: Pool) {}

  /**
   * Run differential tests between old and new API implementations
   */
  async runDiffTests(
    oldBaseUrl: string,
    newBaseUrl: string,
    spec: OpenAPISpec,
    testCases?: any[]
  ): Promise<DiffTestResult[]> {
    logger.info({ oldBaseUrl, newBaseUrl }, 'Running API diff tests');

    const results: DiffTestResult[] = [];

    // Generate test cases from spec if not provided
    const cases = testCases || this.generateTestCases(spec);

    for (const testCase of cases) {
      const result = await this.runSingleTest(oldBaseUrl, newBaseUrl, testCase);
      results.push(result);
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;

    logger.info({ passed: passedCount, failed: failedCount }, 'Diff tests complete');

    return results;
  }

  /**
   * Run a single differential test
   */
  private async runSingleTest(
    oldBaseUrl: string,
    newBaseUrl: string,
    testCase: any
  ): Promise<DiffTestResult> {
    const { path, method, params, body } = testCase;

    try {
      // Call old API
      const oldResponse = await this.makeRequest(oldBaseUrl, path, method, params, body);

      // Call new API
      const newResponse = await this.makeRequest(newBaseUrl, path, method, params, body);

      // Compare responses
      const diff = this.compareResponses(oldResponse, newResponse);

      const passed = diff.length === 0;

      return {
        endpoint: path,
        method,
        passed,
        oldResponse: oldResponse.data,
        newResponse: newResponse.data,
        diff: passed ? undefined : diff,
      };
    } catch (err: any) {
      logger.error({ path, method, err }, 'Diff test failed');

      return {
        endpoint: path,
        method,
        passed: false,
        diff: [{ error: err.message }],
      };
    }
  }

  /**
   * Make HTTP request
   */
  private async makeRequest(
    baseUrl: string,
    path: string,
    method: string,
    params?: any,
    body?: any
  ): Promise<{ status: number; data: any }> {
    // TODO: Implement actual HTTP request using axios or fetch
    logger.debug({ baseUrl, path, method }, 'Making request (stub)');

    // Stub implementation
    return {
      status: 200,
      data: { stub: true },
    };
  }

  /**
   * Compare two responses for differences
   */
  private compareResponses(oldResp: any, newResp: any): any[] {
    const diffs: any[] = [];

    // Status code
    if (oldResp.status !== newResp.status) {
      diffs.push({
        field: 'status',
        old: oldResp.status,
        new: newResp.status,
      });
    }

    // Data structure
    const dataDiffs = this.deepCompare(oldResp.data, newResp.data);
    diffs.push(...dataDiffs);

    return diffs;
  }

  /**
   * Deep compare two objects
   */
  private deepCompare(
    old: any,
    newVal: any,
    path: string = ''
  ): Array<{ field: string; old: any; new: any }> {
    const diffs: any[] = [];

    if (typeof old !== typeof newVal) {
      diffs.push({ field: path || 'root', old, new: newVal });
      return diffs;
    }

    if (typeof old === 'object' && old !== null) {
      // Check for removed keys
      for (const key in old) {
        if (!(key in newVal)) {
          diffs.push({ field: path ? `${path}.${key}` : key, old: old[key], new: undefined });
        } else {
          diffs.push(...this.deepCompare(old[key], newVal[key], path ? `${path}.${key}` : key));
        }
      }

      // Check for added keys (informational, not necessarily a diff)
      for (const key in newVal) {
        if (!(key in old)) {
          diffs.push({ field: path ? `${path}.${key}` : key, old: undefined, new: newVal[key] });
        }
      }
    } else if (old !== newVal) {
      diffs.push({ field: path || 'root', old, new: newVal });
    }

    return diffs;
  }

  /**
   * Generate test cases from OpenAPI spec
   */
  private generateTestCases(spec: OpenAPISpec): any[] {
    const cases: any[] = [];

    for (const path in spec.paths) {
      for (const method in spec.paths[path]) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
          cases.push({
            path,
            method: method.toUpperCase(),
            params: {}, // TODO: Generate from spec
            body: method !== 'get' ? {} : undefined,
          });
        }
      }
    }

    return cases;
  }
}

// ============================================================================
// API Breakage Gate
// ============================================================================

export class APIBreakageGate {
  private guard: APIBreakageGuard;
  private diffTool: APIDiffTestTool;

  constructor(db: Pool) {
    this.guard = new APIBreakageGuard(db);
    this.diffTool = new APIDiffTestTool(db);
  }

  /**
   * Evaluate API changes (gate check)
   */
  async evaluate(
    oldSpecPath: string,
    newSpecPath: string,
    runDiffTests: boolean = true,
    oldBaseUrl?: string,
    newBaseUrl?: string
  ): Promise<{
    passed: boolean;
    breakageResult: APIBreakageResult;
    diffTestResults?: DiffTestResult[];
  }> {
    logger.info({ oldSpecPath, newSpecPath }, 'Evaluating API breakage gate');

    // Load specs
    const oldSpec = await this.guard.loadSpec(oldSpecPath);
    const newSpec = await this.guard.loadSpec(newSpecPath);

    // Check for breaking changes
    const breakageResult = await this.guard.check(oldSpec, newSpec);

    // Run diff tests if requested
    let diffTestResults: DiffTestResult[] | undefined;
    if (runDiffTests && oldBaseUrl && newBaseUrl) {
      diffTestResults = await this.diffTool.runDiffTests(oldBaseUrl, newBaseUrl, newSpec);
    }

    // Gate passes if no breaking changes and all diff tests pass
    const diffTestsPassed = !diffTestResults || diffTestResults.every((r) => r.passed);
    const passed = !breakageResult.hasBreakingChanges && diffTestsPassed;

    logger.info({ passed, breaking: breakageResult.breakingChanges.length }, 'Gate evaluated');

    return {
      passed,
      breakageResult,
      diffTestResults,
    };
  }
}

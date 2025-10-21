/**
 * IdeaMine Tools SDK - Stdin/Stdout Handler
 * Handles JSON protocol over stdin/stdout for tool execution
 */

import * as readline from 'readline';
import { ToolLogger } from '../types';

// ============================================================================
// STDIN/STDOUT PROTOCOL
// ============================================================================

/**
 * Input message format: { "input": {...} }
 */
export interface StdinMessage {
  input: Record<string, any>;
}

/**
 * Output message format (success): { "ok": true, "output": {...} }
 */
export interface StdoutSuccessMessage {
  ok: true;
  output: Record<string, any>;
}

/**
 * Output message format (error): { "ok": false, "error": {...} }
 */
export interface StdoutErrorMessage {
  ok: false;
  error: {
    type: string;
    message: string;
    stack?: string;
    retryable: boolean;
  };
}

export type StdoutMessage = StdoutSuccessMessage | StdoutErrorMessage;

// ============================================================================
// STDIN HANDLER
// ============================================================================

export class StdinHandler {
  private rl: readline.Interface;
  private logger?: ToolLogger;

  constructor(logger?: ToolLogger) {
    this.logger = logger;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // Use stderr for handler logs to avoid polluting stdout
      terminal: false,
    });
  }

  /**
   * Read single message from stdin
   */
  async readMessage(): Promise<StdinMessage> {
    return new Promise((resolve, reject) => {
      this.rl.once('line', (line: string) => {
        try {
          this.logger?.debug('Received stdin message', { length: line.length });

          const message = JSON.parse(line);

          if (!message.input) {
            reject(new Error('Invalid message format: missing "input" field'));
            return;
          }

          resolve(message as StdinMessage);
        } catch (error) {
          reject(new Error(`Failed to parse stdin message: ${error}`));
        }
      });

      this.rl.once('close', () => {
        reject(new Error('Stdin closed before message received'));
      });
    });
  }

  /**
   * Read all messages from stdin (streaming mode)
   */
  async *readMessages(): AsyncIterableIterator<StdinMessage> {
    for await (const line of this.rl) {
      try {
        this.logger?.debug('Received stdin message', { length: line.length });

        const message = JSON.parse(line);

        if (!message.input) {
          this.logger?.error('Invalid message format: missing "input" field');
          continue;
        }

        yield message as StdinMessage;
      } catch (error) {
        this.logger?.error('Failed to parse stdin message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Close stdin handler
   */
  close(): void {
    this.rl.close();
  }
}

// ============================================================================
// STDOUT WRITER
// ============================================================================

export class StdoutWriter {
  private logger?: ToolLogger;

  constructor(logger?: ToolLogger) {
    this.logger = logger;
  }

  /**
   * Write success message to stdout
   */
  writeSuccess(output: Record<string, any>): void {
    const message: StdoutSuccessMessage = {
      ok: true,
      output,
    };

    this.writeMessage(message);
  }

  /**
   * Write error message to stdout
   */
  writeError(error: {
    type: string;
    message: string;
    stack?: string;
    retryable: boolean;
  }): void {
    const message: StdoutErrorMessage = {
      ok: false,
      error,
    };

    this.writeMessage(message);
  }

  /**
   * Write raw message to stdout
   */
  private writeMessage(message: StdoutMessage): void {
    try {
      const json = JSON.stringify(message);

      this.logger?.debug('Writing stdout message', { length: json.length });

      // Write to stdout with newline
      process.stdout.write(json + '\n');
    } catch (error) {
      this.logger?.error('Failed to write stdout message', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Write a minimal error message
      process.stdout.write(
        JSON.stringify({
          ok: false,
          error: {
            type: 'unknown',
            message: 'Failed to serialize output',
            retryable: false,
          },
        }) + '\n'
      );
    }
  }

  /**
   * Flush stdout
   */
  flush(): void {
    // Node.js stdout is typically auto-flushing, but we can force it
    if (process.stdout.write('')) {
      // Successfully flushed
      this.logger?.debug('Stdout flushed');
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create stdin handler
 */
export function createStdinHandler(logger?: ToolLogger): StdinHandler {
  return new StdinHandler(logger);
}

/**
 * Create stdout writer
 */
export function createStdoutWriter(logger?: ToolLogger): StdoutWriter {
  return new StdoutWriter(logger);
}

/**
 * Process single stdin/stdout request
 */
export async function processStdinRequest(
  handler: (input: Record<string, any>) => Promise<Record<string, any>>,
  logger?: ToolLogger
): Promise<void> {
  const stdinHandler = createStdinHandler(logger);
  const stdoutWriter = createStdoutWriter(logger);

  try {
    // Read input
    const message = await stdinHandler.readMessage();

    // Process input
    const output = await handler(message.input);

    // Write output
    stdoutWriter.writeSuccess(output);
  } catch (error) {
    // Write error
    stdoutWriter.writeError({
      type: 'runtime',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      retryable: false,
    });
  } finally {
    stdinHandler.close();
    stdoutWriter.flush();
  }
}

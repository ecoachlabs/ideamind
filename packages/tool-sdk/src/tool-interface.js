"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseTool = void 0;
exports.runToolCLI = runToolCLI;
const zod_1 = require("zod");
/**
 * Base class for TypeScript tools
 */
class BaseTool {
    /**
     * Validate input against schema
     */
    validateInput(input, schema) {
        try {
            return schema.parse(input);
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const formattedErrors = error.errors
                    .map((err) => `${err.path.join('.')}: ${err.message}`)
                    .join(', ');
                throw new Error(`Input validation failed: ${formattedErrors}`);
            }
            throw error;
        }
    }
    /**
     * Log to stderr
     */
    log(message) {
        console.error(`[Tool] ${message}`);
    }
}
exports.BaseTool = BaseTool;
/**
 * CLI wrapper for running tools
 *
 * Usage: node tool.js < input.json > output.json
 */
async function runToolCLI(tool) {
    try {
        // Read input from stdin
        const inputChunks = [];
        for await (const chunk of process.stdin) {
            inputChunks.push(chunk);
        }
        const inputStr = Buffer.concat(inputChunks).toString('utf-8');
        const input = JSON.parse(inputStr);
        // Execute tool
        const result = await tool.execute(input);
        // Write output to stdout
        console.log(JSON.stringify(result.output, null, 2));
        // Exit with appropriate code
        process.exit(result.success ? 0 : 1);
    }
    catch (error) {
        console.error('Tool execution failed:', error);
        console.log(JSON.stringify({ error: String(error) }, null, 2));
        process.exit(1);
    }
}
//# sourceMappingURL=tool-interface.js.map
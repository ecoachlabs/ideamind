/**
 * guard.PII_redactor
 *
 * Detects and redacts Personally Identifiable Information (PII) from text.
 *
 * Features:
 * - Detects: emails, phone numbers, SSNs, credit cards, API keys, IP addresses
 * - Redacts with appropriate placeholders
 * - Audit log of redactions
 * - Configurable sensitivity levels
 */
import { Tool, ToolInput, ToolOutput, ToolMetadata } from '../../types';
export declare class PIIRedactorTool implements Tool {
    readonly metadata: ToolMetadata;
    private patterns;
    execute(input: ToolInput): Promise<ToolOutput>;
    /**
     * Determine if match should be redacted based on sensitivity
     */
    private shouldRedact;
    /**
     * Redact value based on mode
     */
    private redact;
    /**
     * Partial redaction (shows first/last chars)
     */
    private partialRedact;
}
export declare function createPIIRedactorTool(): Tool;
//# sourceMappingURL=pii-redactor.d.ts.map
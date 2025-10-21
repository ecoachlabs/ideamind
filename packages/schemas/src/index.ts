/**
 * IdeaMine Schemas Package
 *
 * JSON schemas and TypeScript types for the orchestrator
 */

// Phase schemas
export * from './phase';

// Event schemas
export * from './events';

// Re-export schemas for validation
import { PhaseContextSchema } from './phase/phase-context';
import { TaskSpecSchema } from './phase/task-spec';
import { EvidencePackSchema } from './phase/evidence-pack';
import { EventSchemas } from './events';

export const Schemas = {
  PhaseContext: PhaseContextSchema,
  TaskSpec: TaskSpecSchema,
  EvidencePack: EvidencePackSchema,
  Events: EventSchemas,
};

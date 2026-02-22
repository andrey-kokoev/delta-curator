/**
 * Schema registry and semantic core extraction
 * Per AGENT_BRIEF.md section 3 & 4
 *
 * Semantic core includes only required fields from first version of schema
 * Optional forward-compatible fields are excluded
 * observed_at (audit-only) is always excluded
 */
/**
 * Schema definition
 */
export interface SchemaDefinition {
    version: string;
    requiredFields: string[];
    auditOnlyFields?: string[];
}
/**
 * Schema registry - one entry per event type
 */
export declare const SCHEMA_REGISTRY: Record<string, SchemaDefinition>;
/**
 * Gets required fields for an event type
 */
export declare function getRequiredFields(eventType: string): string[];
/**
 * Extracts semantic core from event payload
 * Used in eventId computation per AGENT_BRIEF.md section 3
 */
export declare function extractSemanticCoreForEvent(eventType: string, payload: unknown): unknown;
/**
 * Checks if a field is audit-only (excluded from event_id)
 */
export declare function isAuditOnlyField(eventType: string, fieldName: string): boolean;
//# sourceMappingURL=index.d.ts.map
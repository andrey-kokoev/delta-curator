/**
 * Schema registry and semantic core extraction
 * Per AGENT_BRIEF.md section 3 & 4
 *
 * Semantic core includes only required fields from first version of schema
 * Optional forward-compatible fields are excluded
 * observed_at (audit-only) is always excluded
 */
import { semanticCore as extractSemanticCore } from '../canonicalization.js';
/**
 * Schema registry - one entry per event type
 */
export const SCHEMA_REGISTRY = {
    // Stage 1: Item observed
    item_observed: {
        version: '1.0',
        requiredFields: ['source_item_id', 'payload'],
        auditOnlyFields: ['observed_at']
    },
    // Stage 2: Item assessed (comparison result)
    item_assessed: {
        version: '1.0',
        requiredFields: ['source_item_id', 'novelty', 'confidence'],
        auditOnlyFields: ['observed_at', 'rationale']
    },
    // Stage 3: Item decided (policy decision)
    item_decided: {
        version: '1.0',
        requiredFields: ['source_item_id', 'decision'],
        auditOnlyFields: ['observed_at', 'reason', 'targetId']
    },
    // Stage 4: Item merged (merger result)
    item_merged: {
        version: '1.0',
        requiredFields: ['source_item_id', 'merged_payload'],
        auditOnlyFields: ['observed_at']
    },
    // Plan: mutations planned (audit-only event)
    mutations_planned: {
        version: '1.0',
        requiredFields: ['source_item_id'],
        auditOnlyFields: ['observed_at', 'mutations']
    }
};
/**
 * Gets required fields for an event type
 */
export function getRequiredFields(eventType) {
    const schema = SCHEMA_REGISTRY[eventType];
    if (!schema) {
        throw new Error(`Unknown event type: ${eventType}`);
    }
    return schema.requiredFields;
}
/**
 * Extracts semantic core from event payload
 * Used in eventId computation per AGENT_BRIEF.md section 3
 */
export function extractSemanticCoreForEvent(eventType, payload) {
    const schema = SCHEMA_REGISTRY[eventType];
    if (!schema) {
        throw new Error(`Unknown event type: ${eventType}`);
    }
    return extractSemanticCore(payload, schema.requiredFields);
}
/**
 * Checks if a field is audit-only (excluded from event_id)
 */
export function isAuditOnlyField(eventType, fieldName) {
    const schema = SCHEMA_REGISTRY[eventType];
    if (!schema) {
        return false;
    }
    const auditFields = schema.auditOnlyFields || [];
    return auditFields.includes(fieldName);
}
//# sourceMappingURL=index.js.map
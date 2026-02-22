/**
 * JSON Merger Plugin
 * Merges JSON payloads with conflict resolution
 */

import type { Merger, CandidateDoc, MergeResult } from '@delta-curator/protocol';

/**
 * JSONMerger: Simple JSON merging
 * Strategy: Deep merge, newer values override older
 */
export class JSONMerger implements Merger {
  id = 'json_merger';
  version = '0.1.0';
  description = 'JSON payload merger with conflict resolution';

  /**
   * Merge candidate into base document
   */
  async merge(candidate: CandidateDoc, baseDoc: CandidateDoc): Promise<MergeResult> {
    // Deep merge payloads
    const merged = this.deepMerge(baseDoc.payload, candidate.payload);

    // Create merged candidate
    const mergedCandidate: CandidateDoc = {
      trace_id: candidate.trace_id,
      source_item_id: candidate.source_item_id,
      candidate_seq: candidate.candidate_seq,
      observed_at: new Date().toISOString(),
      payload: merged
    };

    return {
      merged: mergedCandidate,
      artifacts: undefined
    };
  }

  /**
   * Deep merge two objects
   * Values from source override values in target
   */
  private deepMerge(target: unknown, source: unknown): unknown {
    // If source is null/undefined, keep target
    if (source === null || source === undefined) {
      return target;
    }

    // If source is not an object, use source
    if (typeof source !== 'object' || Array.isArray(source)) {
      return source;
    }

    // If target is not an object, use source
    if (typeof target !== 'object' || target === null || Array.isArray(target)) {
      return source;
    }

    // Both are objects: merge recursively
    const result = { ...target };
    const sourceObj = source as Record<string, unknown>;
    const targetObj = target as Record<string, unknown>;

    for (const key of Object.keys(sourceObj)) {
      result[key] = this.deepMerge(targetObj[key], sourceObj[key]);
    }

    return result;
  }
}

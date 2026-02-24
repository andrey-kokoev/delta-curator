/**
 * Inline Plugin Implementations
 * Comparator and Decider for the Worker
 */

import type { CandidateDoc, BaseView, ComparisonResult, DecisionResult } from '@delta-curator/protocol';

/**
 * Fingerprint Comparator - detects duplicates by payload hash
 */
export class FingerprintComparator {
  id = 'fingerprint_comparator';
  version = '0.1.0';
  description = 'Hash-based duplicate detection via payload fingerprinting';

  /**
   * Compute simple hash of payload
   */
  private computeHash(payload: unknown): string {
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  async compare(candidate: CandidateDoc, baseViews: BaseView[]): Promise<ComparisonResult> {
    const candidateFingerprint = this.computeHash(candidate.payload);
    
    // Check fingerprint index
    const fingerprintView = baseViews.find(v => v.viewName === 'fingerprint_index');
    let isDuplicate = false;
    
    if (fingerprintView?.state && Array.isArray(fingerprintView.state)) {
      isDuplicate = (fingerprintView.state as any[]).some(
        (f: any) => f.payload_hash === candidateFingerprint
      );
    }
    
    return {
      source_item_id: candidate.source_item_id,
      novelty: isDuplicate ? 'duplicate' : 'novel',
      confidence: 1.0,
      rationale: isDuplicate 
        ? `Duplicate detected (fingerprint: ${candidateFingerprint.slice(0, 8)})`
        : `Novel item (fingerprint: ${candidateFingerprint.slice(0, 8)})`
    };
  }
}

/**
 * Rules Decider - makes decisions based on novelty and rules
 */
export class RulesDecider {
  id = 'rules_decider';
  version = '0.1.0';
  description = 'Rule-based decision engine';

  async decide(
    candidate: CandidateDoc,
    comparison: ComparisonResult
  ): Promise<DecisionResult> {
    // Simple rule: append if novel, reject if duplicate
    if (comparison.novelty === 'duplicate') {
      return {
        source_item_id: candidate.source_item_id,
        decision: 'reject',
        reason: 'Duplicate item detected',
        targetId: candidate.source_item_id
      };
    }
    
    // Check if payload has required fields
    const payload = candidate.payload as any;
    if (!payload || (!payload.title && !payload.description)) {
      return {
        source_item_id: candidate.source_item_id,
        decision: 'reject',
        reason: 'Insufficient content (no title or description)',
        targetId: candidate.source_item_id
      };
    }
    
    return {
      source_item_id: candidate.source_item_id,
      decision: 'append',
      reason: 'Novel item with sufficient content',
      targetId: candidate.source_item_id
    };
  }
}

/**
 * Simple Merger - creates mutations for accepted items
 */
export class SimpleMerger {
  id = 'simple_merger';
  version = '0.1.0';
  description = 'Simple merge strategy for curated docs';

  async planMutations(
    decision: DecisionResult,
    candidate: CandidateDoc
  ): Promise<{ view: string; operation: string; key: string; data: any }[]> {
    if (decision.decision !== 'append') {
      return []; // No mutations for rejected items
    }
    
    const mutations = [];
    
    // Add to curated_docs
    mutations.push({
      view: 'curated_docs',
      operation: 'insert',
      key: candidate.source_item_id,
      data: {
        doc_id: candidate.source_item_id,
        source_item_id: candidate.source_item_id,
        payload: JSON.stringify(candidate.payload),
        last_event_id: `evt_${Date.now()}`
      }
    });
    
    // Add to fingerprint index
    const fingerprint = this.computeHash(candidate.payload);
    mutations.push({
      view: 'fingerprint_index',
      operation: 'insert',
      key: fingerprint,
      data: {
        fingerprint,
        source_item_id: candidate.source_item_id,
        payload_hash: fingerprint,
        first_event_id: `evt_${Date.now()}`
      }
    });
    
    return mutations;
  }
  
  private computeHash(payload: unknown): string {
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

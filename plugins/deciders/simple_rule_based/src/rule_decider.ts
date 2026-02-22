/**
 * Rule-Based Decider Plugin
 * Applies simple policy rules based on comparison results
 */

import type { Decider, CandidateAnalysis, DecisionResult } from '@delta-curator/protocol';

/**
 * RuleBasedDecider: Simple decision rules
 * - Novel items → append
 * - Duplicates → hold
 * - Similar → hold for manual review
 */
export class RuleBasedDecider implements Decider {
  id = 'rule_based_decider';
  version = '0.1.0';
  description = 'Simple rule-based decision policy';

  /**
   * Apply rules to decide action
   */
  async decide(analysis: CandidateAnalysis): Promise<DecisionResult> {
    const { candidate, comparison } = analysis;

    // Rule 1: Novel items → append
    if (comparison.novelty === 'novel') {
      return {
        source_item_id: candidate.source_item_id,
        decision: 'append',
        reason: 'Novel item meets criteria for inclusion'
      };
    }

    // Rule 2: Exact duplicates → hold for review
    if (comparison.novelty === 'duplicate') {
      return {
        source_item_id: candidate.source_item_id,
        decision: 'hold',
        reason: `Duplicate detected: ${comparison.rationale}`
      };
    }

    // Rule 3: Similar items → hold for review
    if (comparison.novelty === 'similar') {
      return {
        source_item_id: candidate.source_item_id,
        decision: 'hold',
        reason: `Similar item requires review (confidence: ${(comparison.confidence * 100).toFixed(0)}%)`
      };
    }

    // Default: reject unknown
    return {
      source_item_id: candidate.source_item_id,
      decision: 'reject',
      reason: 'Unknown novelty status'
    };
  }
}

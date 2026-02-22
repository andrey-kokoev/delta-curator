/**
 * Rule-Based Decider Plugin
 * Applies simple policy rules based on comparison results
 */
import type { CandidateAnalysis, DecisionResult } from '@delta-curator/protocol';
import type { Decider } from '@delta-curator/runtime';
/**
 * RuleBasedDecider: Simple decision rules
 * - Novel items → append
 * - Duplicates → hold
 * - Similar → hold for manual review
 */
export declare class RuleBasedDecider implements Decider {
    id: string;
    version: string;
    description: string;
    /**
     * Apply rules to decide action
     */
    decide(analysis: CandidateAnalysis): Promise<DecisionResult>;
}
//# sourceMappingURL=rule_decider.d.ts.map
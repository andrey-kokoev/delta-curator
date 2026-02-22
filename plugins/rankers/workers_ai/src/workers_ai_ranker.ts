/**
 * Workers AI Reranker Plugin
 * Uses Cloudflare Workers AI to score passages via bge-reranker-base
 * Per AGENT_BRIEF2.md section 3.2
 */

import type { Ranker } from '@delta-curator/runtime';

declare global {
  interface Ai {
    run(model: string, input: unknown): Promise<{ data: { score: number }[] }>;
  }
}

/**
 * WorkersAIRanker: Score passages using Cloudflare Workers AI
 */
export class WorkersAIRanker implements Ranker {
  id = 'workers_ai_rerank';
  version = '0.1.0';
  description = 'Cloudflare Workers AI reranker (bge-reranker-base)';

  /**
   * Constructor
   * @param ai - Cloudflare AI binding from Worker environment
   * @param query - Query string for reranking context
   * @param model - Model identifier (default: @cf/baai/bge-reranker-base)
   * @param maxPassageChars - Maximum characters to include per passage (default: 4000)
   */
  constructor(
    private ai: Ai,
    private query: string,
    private model = '@cf/baai/bge-reranker-base',
    private maxPassageChars = 4000
  ) {}

  /**
   * Score passages using Workers AI reranker
   *
   * @param passages - Array of passages with id and text
   * @returns Array of {id, score} tuples in same order as input
   */
  async score(passages: { id: string; text: string }[]): Promise<{ id: string; score: number }[]> {
    if (passages.length === 0) {
      return [];
    }

    // Truncate passages to max length
    const truncated = passages.map(p => ({
      id: p.id,
      text: p.text.slice(0, this.maxPassageChars)
    }));

    try {
      // Call Workers AI reranker
      const result = await this.ai.run(this.model, {
        query: this.query,
        passages: truncated.map(p => p.text)
      }) as { data: { score: number }[] };

      // Map scores back to original passage IDs
      return truncated.map((p, i) => ({
        id: p.id,
        score: result.data[i]?.score ?? 0
      }));
    } catch (err) {
      // On error, return zero scores
      console.error(`Workers AI ranking failed: ${err}`);
      return truncated.map(p => ({
        id: p.id,
        score: 0
      }));
    }
  }
}

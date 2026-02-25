/**
 * Workers AI Reranker Plugin
 * Uses Cloudflare Workers AI to score passages via bge-reranker-base
 * Per AGENT_BRIEF2.md section 3.2
 */

import type { Ranker } from '@delta-curator/runtime';

declare global {
  interface Ai {
    run(model: string, input: unknown): Promise<unknown>;
  }
}

/**
 * WorkersAIRanker: Score passages using Cloudflare Workers AI
 */
export class WorkersAIRanker implements Ranker {
  id = 'workers_ai_rerank';
  version = '0.1.0';
  description = 'Cloudflare Workers AI reranker (bge-reranker-base)';
  private maxContextsPerRequest = 20;
  private maxQueryChars = 512;

  private async runScoreBatch(
    query: string,
    batch: { id: string; text: string }[]
  ): Promise<Map<string, number>> {
    const result = await this.ai.run(this.model, {
      query,
      contexts: batch.map((p) => ({ text: p.text })),
      top_k: batch.length
    }) as {
      response?: { id?: number; score?: number }[];
      data?: { id?: number; score?: number }[];
      result?: { id?: number; score?: number }[];
      scores?: number[];
    };

    const scoreById = new Map<string, number>();

    const scoredRows = Array.isArray(result?.response)
      ? result.response
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.result)
          ? result.result
          : null;

    if (scoredRows) {
      for (const row of scoredRows) {
        if (!row || typeof row !== 'object') continue;
        const idx = typeof row.id === 'number' && Number.isInteger(row.id) ? row.id : -1;
        if (idx < 0 || idx >= batch.length) continue;
        scoreById.set(batch[idx].id, row.score ?? 0);
      }
    } else if (Array.isArray(result?.scores)) {
      for (let i = 0; i < Math.min(result.scores.length, batch.length); i++) {
        scoreById.set(batch[i].id, result.scores[i] ?? 0);
      }
    }

    for (const item of batch) {
      if (!scoreById.has(item.id)) {
        scoreById.set(item.id, 0);
      }
    }

    return scoreById;
  }

  private async runScoreBatchAdaptive(
    query: string,
    batch: { id: string; text: string }[]
  ): Promise<{ scores: Map<string, number>; successfulCalls: number }> {
    try {
      const scores = await this.runScoreBatch(query, batch);
      return { scores, successfulCalls: 1 };
    } catch (err) {
      if (batch.length <= 1) {
        console.warn(`Workers AI ranking single-context fallback: ${err}`);
        return { scores: new Map([[batch[0].id, 0]]), successfulCalls: 0 };
      }

      const mid = Math.floor(batch.length / 2);
      const left = await this.runScoreBatchAdaptive(query, batch.slice(0, mid));
      const right = await this.runScoreBatchAdaptive(query, batch.slice(mid));

      return {
        scores: new Map([...left.scores, ...right.scores]),
        successfulCalls: left.successfulCalls + right.successfulCalls
      };
    }
  }

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

    const normalizedQuery = this.query
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, this.maxQueryChars);

    if (!normalizedQuery) {
      return [];
    }

    // Truncate passages to max length
    const truncated = passages.map(p => ({
      id: p.id,
      text: p.text
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, this.maxPassageChars)
        .trim()
    }));

    const valid = truncated.filter((p) => p.text.length > 0);

    if (valid.length === 0) {
      return [];
    }

    try {
      const scoreById = new Map<string, number>();
      let successfulCalls = 0;

      for (let start = 0; start < valid.length; start += this.maxContextsPerRequest) {
        const batch = valid.slice(start, start + this.maxContextsPerRequest);
        const scored = await this.runScoreBatchAdaptive(normalizedQuery, batch);
        successfulCalls += scored.successfulCalls;
        for (const [id, score] of scored.scores) {
          scoreById.set(id, score);
        }
      }

      if (successfulCalls === 0) {
        throw new Error('No successful Workers AI scoring calls');
      }

      // Map scores back to original passage IDs
      return truncated.map((p, i) => ({
        id: p.id,
        score: scoreById.get(p.id) ?? 0
      }));
    } catch (err) {
      // On error, return empty scores so caller can fallback safely
      console.error(`Workers AI ranking failed: ${err}; model=${this.model}; query_chars=${normalizedQuery.length}; contexts=${valid.length}`);
      return [];
    }
  }
}

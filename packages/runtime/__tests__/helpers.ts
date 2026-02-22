/**
 * Test helpers for Delta-Curator runtime tests
 * Provides deterministic time source, in-memory database factory, and mock source
 */

import { SQLiteCommitter } from '../src/commit/sqlite_committer.js';
import type { Source, SourceState } from '../src/interfaces/plugin.js';
import type { RawDocObserved } from '@delta-curator/protocol';

/**
 * FrozenClock: Deterministic time source for I3 tests
 * Provides a fixed timestamp that never changes, enabling event_id determinism
 */
export class FrozenClock {
  private frozenAt: Date;

  constructor(frozenAt: Date = new Date('2024-01-01T00:00:00Z')) {
    this.frozenAt = frozenAt;
  }

  now(): Date {
    return new Date(this.frozenAt.getTime());
  }
}

/**
 * InMemorySource: Mutable injectable source for testing
 * Holds a pre-configured list of items and returns them in batches on readBatch()
 */
export class InMemorySource implements Source {
  id = 'test_source';
  version = '0.0.0';
  description = 'In-memory test source';

  private items: RawDocObserved[];
  private batchCount = 0;

  constructor(items: RawDocObserved[]) {
    // Make a copy to avoid mutating caller's array
    this.items = [...items];
  }

  async readBatch(
    state: SourceState,
    maxItems: number
  ): Promise<{ items: RawDocObserved[]; newState: SourceState } | null> {
    // No more items
    if (this.items.length === 0) {
      return null;
    }

    // Take up to maxItems
    const batch = this.items.splice(0, maxItems);
    this.batchCount++;

    return {
      items: batch,
      newState: {
        batchCount: this.batchCount,
        itemsProcessed: (state?.itemsProcessed ?? 0) + batch.length
      }
    };
  }
}

/**
 * Factory: Create an in-memory SQLiteCommitter for testing
 * Uses :memory: database and auto-initializes schema
 */
export async function makeInMemoryCommitter(): Promise<SQLiteCommitter> {
  const committer = new SQLiteCommitter(':memory:');
  await committer.init();
  return committer;
}

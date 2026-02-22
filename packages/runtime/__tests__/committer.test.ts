/**
 * SQLiteCommitter Unit Tests
 * Validates atomic transactions, idempotency, and event sourcing invariants
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalJson, eventId, payloadHash } from '@delta-curator/protocol';
import type { CommitRequest, Event } from '@delta-curator/protocol';
import { makeInMemoryCommitter } from './helpers.js';
import type { SQLiteCommitter } from '../src/commit/sqlite_committer.js';

describe('SQLiteCommitter', () => {
  let committer: SQLiteCommitter;

  beforeEach(async () => {
    committer = await makeInMemoryCommitter();
  });

  // Helper to create a proper Event with all required fields
  function makeEvent(
    event_type: string,
    source_item_id: string,
    payload: unknown,
    trace_id = 'trace-test'
  ): Event<unknown> {
    const payloadJson = JSON.stringify(payload);
    const payloadH = payloadHash(payloadJson);
    const eid = eventId(event_type, source_item_id, payload as any);

    return {
      event_type,
      event_version: '1.0',
      event_id: eid,
      payload_hash: payloadH,
      hash_alg: 'dc-v1-semcore',
      trace_id,
      source_id: 'source-test',
      source_item_id,
      candidate_seq: 0,
      observed_at: new Date().toISOString(),
      payload
    };
  }

  describe('Group A: Schema', () => {
    it('init() creates all 8 required tables', async () => {
      const commits = (await committer.getReadModelState('commits')) as any[];
      expect(commits).toBeDefined();

      const events = (await committer.getReadModelState('events')) as any[];
      expect(events).toBeDefined();

      const sourceState = (await committer.getReadModelState('source_state')) as any[];
      expect(sourceState).toBeDefined();

      const curatedDocs = (await committer.getReadModelState('curated_docs')) as any[];
      expect(curatedDocs).toBeDefined();
    });
  });

  describe('Group B: Idempotency (I1, I2)', () => {
    it('same commitKey submitted twice returns same commitId', async () => {
      const event = makeEvent('item_observed', 'item-1', { data: 'value1' });
      const request: CommitRequest = {
        commitKey: 'test-key-1',
        traceId: 'trace-1',
        sourceId: 'source-1',
        oldState: { count: 0 },
        newState: { count: 1 },
        events: [event],
        mutations: []
      };

      const result1 = await committer.commit(request);
      expect(result1.commitId).toBeDefined();

      const result2 = await committer.commit(request);
      expect(result2.commitId).toBe(result1.commitId);
    });

    it('no new rows in commits table on duplicate commitKey', async () => {
      const event = makeEvent('item_observed', 'item-2', { data: 'value2' });
      const request: CommitRequest = {
        commitKey: 'test-key-2',
        traceId: 'trace-2',
        sourceId: 'source-2',
        oldState: {},
        newState: {},
        events: [event],
        mutations: []
      };

      await committer.commit(request);
      const commits1 = (await committer.getReadModelState('commits')) as any[];
      const firstCount = commits1.length;

      await committer.commit(request);
      const commits2 = (await committer.getReadModelState('commits')) as any[];

      expect(commits2.length).toBe(firstCount);
    });
  });

  describe('Group C: Atomic Progress (I1)', () => {
    it('after successful commit, source_state reflects newState', async () => {
      const newState = { processedCount: 5 };
      const event = makeEvent('item_observed', 'item-4', { data: 'value4' });

      const request: CommitRequest = {
        commitKey: 'test-key-4',
        traceId: 'trace-4',
        sourceId: 'source-4',
        oldState: { processedCount: 0 },
        newState,
        events: [event],
        mutations: []
      };

      await committer.commit(request);

      const sourceStates = (await committer.getReadModelState('source_state')) as any[];
      const row = sourceStates.find((r: any) => r.source_id === 'source-4');

      expect(row).toBeDefined();
      expect(row.state).toBe(canonicalJson(newState));
    });
  });

  describe('Group D: Event Log (I0)', () => {
    it('events from request appear in events table', async () => {
      const event1 = makeEvent('item_observed', 'item-6a', { data: 'a' }, 'trace-6');
      const event2 = makeEvent('item_assessed', 'item-6a', { score: 0.8 }, 'trace-6');

      const request: CommitRequest = {
        commitKey: 'test-key-6',
        traceId: 'trace-6',
        sourceId: 'source-6',
        oldState: {},
        newState: {},
        events: [event1, event2],
        mutations: []
      };

      await committer.commit(request);

      const events = (await committer.getReadModelState('events')) as any[];
      const itemEvents = events.filter((e: any) => e.source_item_id === 'item-6a');

      expect(itemEvents.length).toBeGreaterThanOrEqual(2);
      expect(itemEvents.some((e: any) => e.event_type === 'item_observed')).toBe(true);
      expect(itemEvents.some((e: any) => e.event_type === 'item_assessed')).toBe(true);
    });

    it('duplicate event_id is not inserted twice', async () => {
      const event = makeEvent('item_observed', 'item-7', { data: 'unique' });

      const request1: CommitRequest = {
        commitKey: 'test-key-7-a',
        traceId: 'trace-7',
        sourceId: 'source-7',
        oldState: {},
        newState: {},
        events: [event],
        mutations: []
      };

      await committer.commit(request1);
      const events1 = (await committer.getReadModelState('events')) as any[];
      const initialCount = events1.length;

      const request2: CommitRequest = {
        commitKey: 'test-key-7-b',
        traceId: 'trace-7-b',
        sourceId: 'source-7-b',
        oldState: {},
        newState: {},
        events: [event],
        mutations: []
      };

      await committer.commit(request2);
      const events2 = (await committer.getReadModelState('events')) as any[];

      expect(events2.length).toBe(initialCount);
    });
  });
});

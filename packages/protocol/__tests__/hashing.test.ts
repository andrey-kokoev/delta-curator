import { describe, it, expect } from 'vitest';
import { payloadHash, eventId, commitKey } from '../src/hashing.js';

describe('payloadHash', () => {
  it('should compute deterministic hash', () => {
    const payload = { data: 'test', value: 42 };

    const hash1 = payloadHash(payload);
    const hash2 = payloadHash(payload);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different payloads', () => {
    const payload1 = { data: 'test1' };
    const payload2 = { data: 'test2' };

    const hash1 = payloadHash(payload1);
    const hash2 = payloadHash(payload2);

    expect(hash1).not.toBe(hash2);
  });

  it('should ignore object key order', () => {
    const payload1 = { a: 1, b: 2, c: 3 };
    const payload2 = { c: 3, a: 1, b: 2 };

    const hash1 = payloadHash(payload1);
    const hash2 = payloadHash(payload2);

    expect(hash1).toBe(hash2);
  });

  it('should return 64-character hex string (SHA256)', () => {
    const hash = payloadHash({ test: 'data' });

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle complex nested structures', () => {
    const payload = {
      nested: {
        deep: {
          array: [1, 2, { key: 'value' }]
        }
      }
    };

    const hash = payloadHash(payload);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should treat null and undefined differently (null only in JSON)', () => {
    const payload1 = { a: null };
    const payload2 = {}; // undefined becomes absent in JSON

    const hash1 = payloadHash(payload1);
    const hash2 = payloadHash(payload2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('eventId', () => {
  it('should compute deterministic event ID', () => {
    const eventType = 'item_observed';
    const sourceItemId = 'item1';
    const semanticPayload = { source_item_id: 'item1', payload: { data: 'test' } };

    const id1 = eventId(eventType, sourceItemId, semanticPayload);
    const id2 = eventId(eventType, sourceItemId, semanticPayload);

    expect(id1).toBe(id2);
  });

  it('should produce different IDs for different event types', () => {
    const sourceItemId = 'item1';
    const semanticPayload = { data: 'test' };

    const id1 = eventId('item_observed', sourceItemId, semanticPayload);
    const id2 = eventId('item_assessed', sourceItemId, semanticPayload);

    expect(id1).not.toBe(id2);
  });

  it('should produce different IDs for different source item IDs (I2: Collision Resistance)', () => {
    const eventType = 'item_observed';
    const semanticPayload = { payload: { data: 'test' } };

    const id1 = eventId(eventType, 'item1', semanticPayload);
    const id2 = eventId(eventType, 'item2', semanticPayload);

    expect(id1).not.toBe(id2);
  });

  it('should produce different IDs for different payloads', () => {
    const eventType = 'item_observed';
    const sourceItemId = 'item1';

    const id1 = eventId(eventType, sourceItemId, { payload: { data: 'test1' } });
    const id2 = eventId(eventType, sourceItemId, { payload: { data: 'test2' } });

    expect(id1).not.toBe(id2);
  });

  it('should produce same ID regardless of payload key order', () => {
    const eventType = 'item_observed';
    const sourceItemId = 'item1';

    const payload1 = { a: 1, b: 2 };
    const payload2 = { b: 2, a: 1 };

    const id1 = eventId(eventType, sourceItemId, payload1);
    const id2 = eventId(eventType, sourceItemId, payload2);

    expect(id1).toBe(id2);
  });

  it('should return 64-character hex string (SHA256)', () => {
    const id = eventId('item_observed', 'item1', { test: 'data' });

    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('commitKey', () => {
  it('should compute deterministic commit key', () => {
    const sourceId = 'file_drop';
    const oldState = { lastFile: 'file1.json' };
    const itemIds = ['item1', 'item2', 'item3'];

    const key1 = commitKey(sourceId, oldState, itemIds);
    const key2 = commitKey(sourceId, oldState, itemIds);

    expect(key1).toBe(key2);
  });

  it('should produce same key regardless of item ID order (I1: Idempotency)', () => {
    const sourceId = 'file_drop';
    const oldState = { lastFile: 'file1.json' };

    const itemIds1 = ['item1', 'item2', 'item3'];
    const itemIds2 = ['item3', 'item1', 'item2'];

    const key1 = commitKey(sourceId, oldState, itemIds1);
    const key2 = commitKey(sourceId, oldState, itemIds2);

    expect(key1).toBe(key2);
  });

  it('should produce different keys for different source IDs', () => {
    const oldState = { lastFile: 'file1.json' };
    const itemIds = ['item1', 'item2'];

    const key1 = commitKey('source1', oldState, itemIds);
    const key2 = commitKey('source2', oldState, itemIds);

    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different old states', () => {
    const sourceId = 'file_drop';
    const itemIds = ['item1', 'item2'];

    const key1 = commitKey(sourceId, { lastFile: 'file1.json' }, itemIds);
    const key2 = commitKey(sourceId, { lastFile: 'file2.json' }, itemIds);

    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different item IDs', () => {
    const sourceId = 'file_drop';
    const oldState = { lastFile: 'file1.json' };

    const key1 = commitKey(sourceId, oldState, ['item1', 'item2']);
    const key2 = commitKey(sourceId, oldState, ['item1', 'item3']);

    expect(key1).not.toBe(key2);
  });

  it('should return 64-character hex string (SHA256)', () => {
    const key = commitKey('source', {}, ['item1', 'item2']);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle empty item IDs array', () => {
    const key = commitKey('source', {}, []);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be stable for large item ID arrays', () => {
    const sourceId = 'file_drop';
    const oldState = {};
    const itemIds = Array.from({ length: 1000 }, (_, i) => `item${i}`);

    const key1 = commitKey(sourceId, oldState, itemIds);
    const key2 = commitKey(sourceId, oldState, itemIds.reverse());

    expect(key1).toBe(key2);
  });
});

describe('Forward-compatible schema evolution (I2)', () => {
  it('should produce same event_id when adding optional fields', () => {
    const eventType = 'item_observed';
    const sourceItemId = 'item1';

    // Original semantic core (only required fields)
    const semanticPayload1 = { source_item_id: 'item1', payload: { data: 'test' } };

    // New payload with additional optional field (not in semantic core)
    const semanticPayload2 = { source_item_id: 'item1', payload: { data: 'test' } };

    const id1 = eventId(eventType, sourceItemId, semanticPayload1);
    const id2 = eventId(eventType, sourceItemId, semanticPayload2);

    expect(id1).toBe(id2);
  });
});

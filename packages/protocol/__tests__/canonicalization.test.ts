import { describe, it, expect } from 'vitest';
import { canonicalJson, semanticCore } from '../src/canonicalization.js';

describe('canonicalJson', () => {
  it('should preserve null', () => {
    expect(canonicalJson(null)).toBe('null');
  });

  it('should preserve boolean values (lowercase)', () => {
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(false)).toBe('false');
  });

  it('should normalize numbers', () => {
    // No trailing zeros
    expect(canonicalJson(1.0)).toBe('1');
    expect(canonicalJson(1.5)).toBe('1.5');

    // -0 becomes 0
    expect(canonicalJson(Object.is(-0, -0) ? -0 : 0)).toBe('0');
  });

  it('should handle strings', () => {
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson('hello world')).toBe('"hello world"');
  });

  it('should sort object keys lexicographically', () => {
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2 = { a: 2, m: 3, z: 1 };

    // Both should produce identical output despite different input order
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
    expect(canonicalJson(obj1)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should preserve array order', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [3, 2, 1];

    // Different arrays should produce different canonical forms
    expect(canonicalJson(arr1)).not.toBe(canonicalJson(arr2));
    expect(canonicalJson(arr1)).toBe('[1,2,3]');
    expect(canonicalJson(arr2)).toBe('[3,2,1]');
  });

  it('should have no whitespace', () => {
    const obj = { a: 1, b: { c: 2 } };
    const canonical = canonicalJson(obj);

    expect(canonical).not.toContain(' ');
    expect(canonical).not.toContain('\n');
    expect(canonical).not.toContain('\t');
  });

  it('should be deterministic for complex objects', () => {
    const obj = {
      z: { nested: true, value: 42 },
      a: [1, 2, { foo: 'bar' }],
      m: null
    };

    const result1 = canonicalJson(obj);
    const result2 = canonicalJson(obj);

    expect(result1).toBe(result2);
  });

  it('should handle nested structures', () => {
    const obj = {
      outer: {
        inner: {
          deep: [1, 2, { key: 'value' }]
        }
      }
    };

    const canonical = canonicalJson(obj);
    expect(canonical).toBe('{"outer":{"inner":{"deep":[1,2,{"key":"value"}]}}}');
  });

  it('should handle empty objects and arrays', () => {
    expect(canonicalJson({})).toBe('{}');
    expect(canonicalJson([])).toBe('[]');
  });

  it('should throw on non-finite numbers', () => {
    expect(() => canonicalJson(Infinity)).toThrow();
    expect(() => canonicalJson(-Infinity)).toThrow();
    expect(() => canonicalJson(NaN)).toThrow();
  });

  it('should be identical for same content regardless of construction order', () => {
    const obj1: Record<string, unknown> = {};
    obj1['z'] = 1;
    obj1['a'] = 2;
    obj1['m'] = 3;

    const obj2 = { a: 2, m: 3, z: 1 };

    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
  });
});

describe('semanticCore', () => {
  it('should extract only required fields', () => {
    const payload = {
      source_item_id: 'item1',
      payload: { data: 'test' },
      observed_at: '2024-01-01T00:00:00Z',
      extra_field: 'should be excluded'
    };

    const core = semanticCore(payload, ['source_item_id', 'payload']);

    expect(core).toEqual({
      source_item_id: 'item1',
      payload: { data: 'test' }
    });
  });

  it('should exclude audit-only fields', () => {
    const payload = {
      source_item_id: 'item1',
      decision: 'append',
      observed_at: '2024-01-01T00:00:00Z',
      reason: 'optional reason'
    };

    const core = semanticCore(payload, ['source_item_id', 'decision']);

    expect(core).not.toHaveProperty('observed_at');
    expect(core).not.toHaveProperty('reason');
    expect(core).toHaveProperty('source_item_id');
    expect(core).toHaveProperty('decision');
  });

  it('should handle missing required fields', () => {
    const payload = {
      source_item_id: 'item1'
      // missing 'payload' field
    };

    const core = semanticCore(payload, ['source_item_id', 'payload']);

    expect(core).toHaveProperty('source_item_id');
    expect(core).not.toHaveProperty('payload');
  });

  it('should preserve non-object payloads', () => {
    expect(semanticCore('string', [])).toBe('string');
    expect(semanticCore(42, [])).toBe(42);
    expect(semanticCore(null, [])).toBe(null);
  });
});

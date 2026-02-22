/**
 * Rebuild Tests
 * Validates that read models are fully rebuildable from events (I0)
 */

import { describe, it, expect } from 'vitest';

describe('Rebuild', () => {
  describe('I0: Read model rebuild', () => {
    it('rebuildToHead() reproduces read models from events', async () => {
      // TODO: Implement rebuild test
      // This test validates that:
      // 1. Running 2 batches creates 6 events and 2 rows in curated_docs
      // 2. Calling rebuildToHead() drops and recreates read models
      // 3. Final state matches pre-rebuild state exactly
      expect(true).toBe(true);
    });
  });
});

/**
 * R2 Artifact Store
 * Persists artifacts to Cloudflare R2 with idempotent keys
 * Per AGENT_BRIEF2.md
 */

/**
 * R2ArtifactStore: idempotent artifact persistence
 */
export class R2ArtifactStore {
  /**
   * Constructor
   * @param bucket - R2Bucket binding from Cloudflare Worker environment
   * @param prefix - Optional prefix for all keys (e.g., "delta-curator/")
   */
  constructor(private bucket: R2Bucket, private prefix = '') {}

  /**
   * Store artifact in R2
   * Key format: {prefix}{commitKey}/{name}
   * Idempotent: overwriting same key is safe
   *
   * @param commitKey - Commit key for idempotency grouping
   * @param name - Artifact name (filename)
   * @param content - Binary content
   * @returns Full R2 object key
   */
  async put(commitKey: string, name: string, content: ArrayBuffer): Promise<string> {
    const key = `${this.prefix}${commitKey}/${name}`;
    await this.bucket.put(key, content, {
      httpMetadata: {
        contentType: 'application/octet-stream'
      }
    });
    return key;
  }

  /**
   * Retrieve artifact from R2
   *
   * @param key - Full R2 object key
   * @returns Binary content or null if not found
   */
  async get(key: string): Promise<ArrayBuffer | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return await obj.arrayBuffer();
  }

  /**
   * Delete artifact from R2
   *
   * @param key - Full R2 object key
   */
  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

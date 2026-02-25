/**
 * Config Store: D1 (index) + R2 (object) storage pattern
 * Stores and retrieves project configurations with validation
 */

import {
  type ProjectConfig,
  type ProjectConfigIndex,
  validateProjectConfig,
  canonicalJson,
} from '@delta-curator/protocol';
import { createHash } from 'crypto';

/**
 * Config store options
 */
export interface ConfigStoreOptions {
  db: D1Database;
  bucket: R2Bucket;
  prefix?: string;
}

/**
 * Config write result
 */
export interface ConfigWriteResult {
  success: boolean;
  projectId?: string;
  r2Key?: string;
  hash?: string;
  error?: string;
}

const INTERNAL_CONFIG_REVISION = '1';

/**
 * Config read result
 */
export interface ConfigReadResult {
  success: boolean;
  config?: ProjectConfig;
  index?: ProjectConfigIndex;
  error?: string;
}

/**
 * Config list result
 */
export interface ConfigListResult {
  success: boolean;
  configs?: ProjectConfigIndex[];
  error?: string;
}

/**
 * ConfigStore: manages project configurations
 * - D1 stores index records for querying
 * - R2 stores full JSON objects
 */
export class ConfigStore {
  private db: D1Database;
  private bucket: R2Bucket;
  private prefix: string;

  constructor(options: ConfigStoreOptions) {
    this.db = options.db;
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? 'configs/';
  }

  /**
   * Compute hash of config content for integrity checking
   */
  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate R2 key for config object
   */
  private generateR2Key(projectId: string): string {
    return `${this.prefix}${projectId}.json`;
  }

  /**
   * Write a project config to D1 (index) and R2 (object)
   * Validates config before storing
   */
  async write(config: unknown, isActive = false): Promise<ConfigWriteResult> {
    // Step 1: Validate config
    const validation = validateProjectConfig(config);
    if (!validation.success) {
      return {
        success: false,
        error: `Config validation failed: ${validation.errors?.message}`,
      };
    }

    const validConfig = validation.data!;
    const projectId = validConfig.project_id;
    const projectName = validConfig.project_name;
    const now = new Date().toISOString();

    // Step 2: Prepare content for R2
    const content = canonicalJson(validConfig);
    const hash = this.computeHash(content);
    const r2Key = this.generateR2Key(projectId);

    try {
      // Step 3: Write to R2 first (Phase 1)
      await this.bucket.put(r2Key, content, {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          'project-id': projectId,
          'version': INTERNAL_CONFIG_REVISION,
          'hash': hash,
        },
      });

      // Step 4: Write index to D1 (Phase 2 - atomic with R2 key)
      await this.db
        .prepare(
          `INSERT OR REPLACE INTO project_configs
           (project_id, version, project_name, is_active, r2_key, hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          projectId,
          INTERNAL_CONFIG_REVISION,
          projectName,
          isActive ? 1 : 0,
          r2Key,
          hash,
          validConfig.created_at ?? now,
          now
        )
        .run();

      return {
        success: true,
        projectId,
        r2Key,
        hash,
      };
    } catch (err) {
      // Cleanup: try to delete R2 object if D1 write failed
      try {
        await this.bucket.delete(r2Key);
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: `Failed to write config: ${err}`,
      };
    }
  }

  /**
   * Read a project config by project_id
   * Validates config after reading from R2
   */
  async read(projectId: string): Promise<ConfigReadResult> {
    try {
      // Step 1: Get index from D1
      const index = await this.db
        .prepare(
          'SELECT * FROM project_configs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1'
        )
        .bind(projectId)
        .first<ProjectConfigIndex>();

      if (!index) {
        return {
          success: false,
          error: `Config not found for project: ${projectId}`,
        };
      }

      // Step 2: Read object from R2
      const obj = await this.bucket.get(index.r2_key);
      if (!obj) {
        return {
          success: false,
          error: `Config object not found in R2: ${index.r2_key}`,
        };
      }

      const content = await obj.text();

      // Step 3: Verify hash
      const computedHash = this.computeHash(content);
      if (computedHash !== index.hash) {
        return {
          success: false,
          error: `Hash mismatch: stored=${index.hash}, computed=${computedHash}`,
        };
      }

      // Step 4: Parse and validate
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return {
          success: false,
          error: 'Failed to parse config JSON',
        };
      }

      const validation = validateProjectConfig(parsed);
      if (!validation.success) {
        return {
          success: false,
          error: `Stored config failed validation: ${validation.errors?.message}`,
        };
      }

      return {
        success: true,
        config: validation.data,
        index,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to read config: ${err}`,
      };
    }
  }

  /**
   * Backward-compatible alias for read()
   */
  async readVersion(projectId: string, _version: string): Promise<ConfigReadResult> {
    return this.read(projectId);
  }

  /**
   * List all project configs (index only)
   */
  async list(): Promise<ConfigListResult> {
    try {
      const result = await this.db
        .prepare('SELECT * FROM project_configs ORDER BY updated_at DESC')
        .all<ProjectConfigIndex>();

      return {
        success: true,
        configs: result.results ?? [],
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to list configs: ${err}`,
      };
    }
  }

  /**
   * List all versions for a project
   */
  async listVersions(projectId: string): Promise<ConfigListResult> {
    try {
      const result = await this.db
        .prepare(
          'SELECT * FROM project_configs WHERE project_id = ? ORDER BY updated_at DESC'
        )
        .bind(projectId)
        .all<ProjectConfigIndex>();

      return {
        success: true,
        configs: result.results ?? [],
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to list config versions: ${err}`,
      };
    }
  }

  /**
   * Set a project config as active
   */
  async setActive(projectId: string, _version?: string): Promise<ConfigWriteResult> {
    try {
      const result = await this.db
        .prepare(
          `UPDATE project_configs 
           SET is_active = CASE 
             WHEN project_id = ? THEN 1 
             ELSE 0 
           END,
           updated_at = ?`
        )
        .bind(projectId, new Date().toISOString())
        .run();

      if (result.meta.changes === 0) {
        return {
          success: false,
          error: `Config not found for project: ${projectId}`,
        };
      }

      return {
        success: true,
        projectId,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to set active config: ${err}`,
      };
    }
  }

  /**
   * Get the active project config
   */
  async getActive(): Promise<ConfigReadResult> {
    try {
      // Get active config index
      const index = await this.db
        .prepare(
          'SELECT * FROM project_configs WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1'
        )
        .first<ProjectConfigIndex>();

      if (!index) {
        return {
          success: false,
          error: 'No active config found',
        };
      }

      return this.read(index.project_id);
    } catch (err) {
      return {
        success: false,
        error: `Failed to get active config: ${err}`,
      };
    }
  }

  /**
   * Delete a project config
   */
  async delete(projectId: string, _version?: string): Promise<ConfigWriteResult> {
    try {
      const r2Key = this.generateR2Key(projectId);

      // Delete from D1
      await this.db
        .prepare('DELETE FROM project_configs WHERE project_id = ?')
        .bind(projectId)
        .run();

      // Delete from R2
      await this.bucket.delete(r2Key);

      return {
        success: true,
        projectId,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to delete config: ${err}`,
      };
    }
  }
}

/**
 * File Drop Source Plugin
 * Reads JSON files from a watch directory
 * Reference implementation of Source interface
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Source, SourceState, RawDocObserved } from '@delta-curator/protocol';

/**
 * FileDropSource: reads JSON files from directory
 * State tracks: { processedFileNames: string[] }
 */
export class FileDropSource implements Source {
  id = 'file_drop';
  version = '0.1.0';
  description = 'Reads JSON files from a watch directory';

  private watchDir: string;

  constructor(watchDir: string) {
    this.watchDir = watchDir;
  }

  /**
   * Reads a batch of unprocessed JSON files
   *
   * @param state - Current state: { processedFileNames: string[] }
   * @param maxItems - Maximum items to return
   * @returns { items, newState } or null if no new files
   *
   * CRITICAL: newState is PROPOSED only. Not persisted until commit succeeds (I1).
   */
  async readBatch(
    state: SourceState,
    maxItems: number
  ): Promise<{ items: RawDocObserved[]; newState: SourceState } | null> {
    // Get previously processed files from state
    const processedFileNames = new Set(
      (state?.processedFileNames as string[]) || []
    );

    try {
      // List files in watch directory
      const files = await fs.readdir(this.watchDir);

      // Filter to JSON files not yet processed
      const newFiles = files
        .filter((f) => f.endsWith('.json') && !processedFileNames.has(f))
        .slice(0, maxItems);

      if (newFiles.length === 0) {
        return null; // No new items
      }

      // Read each file and create RawDocObserved
      const items: RawDocObserved[] = [];

      for (const fileName of newFiles) {
        try {
          const filePath = path.join(this.watchDir, fileName);
          const content = await fs.readFile(filePath, 'utf-8');
          const payload = JSON.parse(content);

          items.push({
            source_item_id: fileName, // Filename is unique per source
            observed_at: new Date().toISOString(),
            payload
          });

          processedFileNames.add(fileName);
        } catch (err) {
          // Log error but continue with other files
          console.error(`Error reading file ${fileName}:`, err);
        }
      }

      if (items.length === 0) {
        return null;
      }

      // Return items and proposed new state
      return {
        items,
        newState: {
          processedFileNames: Array.from(processedFileNames).sort()
        }
      };
    } catch (err) {
      console.error('Error reading batch:', err);
      throw err;
    }
  }

  /**
   * Optional: acknowledge batch after successful commit
   * Could be used to delete or archive processed files
   */
  async acknowledge?(batchId: string): Promise<void> {
    // For now, do nothing (files remain in directory)
    // In production, could delete files or move to archive
  }
}

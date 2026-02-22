#!/usr/bin/env node

/**
 * Delta-Curator CLI
 * Command-line interface for the event-sourced novelty accumulation system
 */

import { parseArgs } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { SQLiteCommitter } from '@delta-curator/runtime';
import { FileDropSource } from '@delta-curator/plugin-source-file-drop';
import { FingerprintComparator } from '@delta-curator/plugin-comparator-fingerprint';
import { RuleBasedDecider } from '@delta-curator/plugin-decider-simple-rule-based';
import { Runner } from '@delta-curator/runtime';

const PKG_VERSION = '0.1.0';

async function main() {
  const args = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      dir: { type: 'string', short: 'd' },
      db: { type: 'string' },
      interval: { type: 'string' },
      'worker-url': { type: 'string' }
    },
    allowPositionals: true
  });

  const command = args.positionals[0];

  if (args.values.help) {
    printHelp();
    return;
  }

  if (args.values.version) {
    console.log(`delta-curator v${PKG_VERSION}`);
    return;
  }

  // Default paths
  const workDir = args.values.dir || '.delta';
  const dbPath = args.values.db || path.join(workDir, 'db.sqlite');
  const watchDir = path.join(workDir, 'inbox');
  const workerUrl = args.values['worker-url'];

  switch (command) {
    case 'init':
      if (workerUrl) {
        console.error('✗ init command cannot be used with --worker-url');
        process.exit(1);
      }
      await cmdInit(workDir, dbPath, watchDir);
      break;

    case 'run-batch':
      if (workerUrl) {
        await cmdRunBatchRemote(workerUrl);
      } else {
        await cmdRunBatch(dbPath, watchDir);
      }
      break;

    case 'watch':
      if (workerUrl) {
        console.error('✗ watch command cannot be used with --worker-url');
        process.exit(1);
      }
      await cmdWatch(dbPath, watchDir, args.values.interval);
      break;

    case 'rebuild':
      if (workerUrl) {
        console.error('✗ rebuild command cannot be used with --worker-url');
        process.exit(1);
      }
      await cmdRebuild(dbPath);
      break;

    case 'version':
      console.log(`delta-curator v${PKG_VERSION}`);
      break;

    default:
      console.log('Usage: delta-curator <command>');
      console.log('Try: delta-curator --help');
      process.exit(1);
  }
}

/**
 * Initialize Delta-Curator workspace
 */
async function cmdInit(workDir: string, dbPath: string, watchDir: string) {
  try {
    // Create directories
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(watchDir, { recursive: true });

    // Initialize database
    const committer = new SQLiteCommitter(dbPath);
    await committer.init();
    await committer.close();

    console.log(`✓ Initialized Delta-Curator`);
    console.log(`  Database: ${dbPath}`);
    console.log(`  Watch dir: ${watchDir}`);
  } catch (err) {
    console.error('✗ Init failed:', err);
    process.exit(1);
  }
}

/**
 * Run one batch: fetch → stage → commit (local)
 */
async function cmdRunBatch(dbPath: string, watchDir: string) {
  try {
    // Initialize components
    const source = new FileDropSource(watchDir);
    const committer = new SQLiteCommitter(dbPath);
    await committer.init();

    const comparator = new FingerprintComparator();
    const decider = new RuleBasedDecider();

    const runner = new Runner(source, committer, comparator, decider);

    // Run batch
    const result = await runner.runBatch();

    if (!result) {
      console.log('No new items');
      return;
    }

    console.log(`✓ Batch committed`);
    console.log(`  Commit ID: ${result.commitId}`);
    console.log(`  Trace ID: ${result.traceId}`);

    await committer.close();
  } catch (err) {
    console.error('✗ Run batch failed:', err);
    process.exit(1);
  }
}

/**
 * Run one batch via Worker (remote)
 */
async function cmdRunBatchRemote(workerUrl: string) {
  try {
    const url = new URL('/run', workerUrl);
    const response = await fetch(url.toString(), { method: 'POST' });

    if (!response.ok) {
      throw new Error(`Worker returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as {
      commit_id?: string;
      items_processed: number;
      events_written: number;
      trace_id?: string;
      error?: string;
    };

    if (result.error) {
      console.error('✗ Worker error:', result.error);
      process.exit(1);
    }

    if (!result.commit_id) {
      console.log('No new items');
      return;
    }

    console.log(`✓ Batch committed`);
    console.log(`  Commit ID: ${result.commit_id}`);
    console.log(`  Items processed: ${result.items_processed}`);
    console.log(`  Events written: ${result.events_written}`);
    if (result.trace_id) {
      console.log(`  Trace ID: ${result.trace_id}`);
    }
  } catch (err) {
    console.error('✗ Remote batch failed:', err);
    process.exit(1);
  }
}

/**
 * Watch directory and run batches on interval
 */
async function cmdWatch(dbPath: string, watchDir: string, intervalStr?: string) {
  const interval = parseInt(intervalStr || '5000');
  console.log(`Watching ${watchDir} (interval: ${interval}ms)`);

  const run = async () => {
    try {
      await cmdRunBatch(dbPath, watchDir);
    } catch (err) {
      console.error('Watch batch error:', err);
    }
  };

  // Run once immediately
  await run();

  // Then run on interval
  setInterval(run, interval);
}

/**
 * Rebuild read models from events
 */
async function cmdRebuild(dbPath: string) {
  try {
    const committer = new SQLiteCommitter(dbPath);
    await committer.init();
    await committer.rebuildToHead();
    await committer.close();

    console.log('✓ Read models rebuilt');
  } catch (err) {
    console.error('✗ Rebuild failed:', err);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Delta-Curator v${PKG_VERSION}
Event-sourced novelty accumulation system

USAGE:
  delta-curator <command> [OPTIONS]

COMMANDS:
  init         Initialize workspace
  run-batch    Run one fetch-stage-commit cycle
  watch        Watch directory and run batches on interval
  rebuild      Rebuild read models from events
  version      Show version

OPTIONS:
  -h, --help           Show this help message
  -v, --version        Show version
  -d, --dir DIR        Work directory (default: .delta)
  --db PATH            Database path
  --interval MS        Watch interval in milliseconds (default: 5000)
  --worker-url URL     Proxy run-batch to Cloudflare Worker (e.g., https://my-worker.dev)

EXAMPLES:
  delta-curator init
  delta-curator run-batch
  delta-curator run-batch --worker-url https://delta-curator.example.workers.dev
  delta-curator watch --interval 10000
  delta-curator rebuild
  `);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

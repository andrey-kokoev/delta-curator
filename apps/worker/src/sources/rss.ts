/**
 * RSS Source for Worker
 * Fetches and parses RSS feeds
 */

import type { SourceState, RawDocObserved } from '@delta-curator/protocol';

interface RSSItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  updated?: string;
  guid?: string;
}

interface RSSFeed {
  items: RSSItem[];
}

function parsePubDate(pubDate?: string): number | null {
  if (!pubDate) {
    return null;
  }
  const parsed = Date.parse(pubDate);
  return Number.isNaN(parsed) ? null : parsed;
}

function canonicalizeLink(link?: string): string | null {
  if (!link) {
    return null;
  }

  const trimmed = link.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    url.hash = '';
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function toBoundedStringArray(value: unknown, maxSize: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .slice(-maxSize);
}

function buildStableId(item: RSSItem): string | null {
  const guid = item.guid?.trim();
  if (guid) {
    return `guid:${guid}`;
  }

  const normalizedLink = canonicalizeLink(item.link);
  if (normalizedLink) {
    return `link:${normalizedLink}`;
  }

  const title = (item.title || '').trim();
  const description = (item.description || '').trim();
  if (!title && !description) {
    return null;
  }

  return `content:${title}\n${description}`;
}

/**
 * Parse RSS XML to JSON
 */
function parseRSS(xml: string): RSSFeed {
  const items: RSSItem[] = [];
  
  // Simple regex-based parsing for RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const title = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || '';
    const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
    const description = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.trim() || '';
    const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
    const updated = itemXml.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim() || '';
    const guid = itemXml.match(/<guid>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/)?.[1]?.trim() || '';
    
    items.push({ title, link, description, pubDate, updated, guid });
  }
  
  return { items };
}

/**
 * RSS Source implementation for Cloudflare Worker
 */
export class RSSSource {
  id = 'rss_source';
  version = '0.1.0';
  description = 'Fetches and parses RSS feeds';

  private readonly maxRecentIds = 1000;
  private readonly maxCursorIds = 256;

  private feedUrl: string;
  private userAgent: string;

  constructor(config: { feed_url: string; user_agent?: string }) {
    this.feedUrl = config.feed_url;
    this.userAgent = config.user_agent || 'delta-curator/0.1';
  }

  /**
   * Read batch from RSS feed
   */
  async readBatch(
    state: SourceState,
    maxItems: number
  ): Promise<{ items: RawDocObserved[]; newState: SourceState } | null> {
    const nowIso = new Date().toISOString();
    const cursorPublishedAt = typeof state?.cursorPublishedAt === 'string'
      ? state.cursorPublishedAt
      : undefined;
    const cursorPublishedAtMs = parsePubDate(cursorPublishedAt);

    const cursorIds = new Set(
      toBoundedStringArray(
        state?.cursorIds,
        this.maxCursorIds
      )
    );

    const recentFromState = Array.isArray(state?.recentIds)
      ? state.recentIds
      : Array.isArray(state?.recentGuids)
        ? state.recentGuids
        : Array.isArray(state?.processedGuids)
          ? state.processedGuids
          : [];
    const recentGuids = new Set(
      recentFromState
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .slice(-this.maxRecentIds)
    );

    const etag = typeof state?.etag === 'string' ? state.etag : undefined;
    const lastModified = typeof state?.lastModified === 'string' ? state.lastModified : undefined;

    try {
      // Fetch RSS feed
      const response = await fetch(this.feedUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml',
          ...(etag ? { 'If-None-Match': etag } : {}),
          ...(lastModified ? { 'If-Modified-Since': lastModified } : {})
        }
      });

      if (response.status === 304) {
        return {
          items: [],
          newState: {
            ...state,
            lastFetch: nowIso,
            lastSuccess: nowIso,
            consecutiveFailures: 0
          }
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      const feed = parseRSS(xml);

      const normalizedItems = feed.items
        .map((item, index) => {
          const stableId = buildStableId(item);
          if (!stableId) {
            return null;
          }

          const effectiveTsMs = parsePubDate(item.pubDate) ?? parsePubDate(item.updated);

          return {
            item,
            stableId,
            effectiveTsMs,
            index
          };
        })
        .filter((item): item is { item: RSSItem; stableId: string; effectiveTsMs: number | null; index: number } => item !== null)
        .sort((a, b) => {
          const timeA = a.effectiveTsMs ?? Number.NEGATIVE_INFINITY;
          const timeB = b.effectiveTsMs ?? Number.NEGATIVE_INFINITY;
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          const idCompare = a.stableId.localeCompare(b.stableId);
          if (idCompare !== 0) {
            return idCompare;
          }
          return a.index - b.index;
        });

      // Filter to new items by cursor watermark + cursor tie IDs + recent dedupe fallback
      const accepted = normalizedItems
        .filter(({ stableId, effectiveTsMs }) => {
          if (cursorPublishedAtMs === null) {
            return !recentGuids.has(stableId);
          }

          if (effectiveTsMs === null) {
            return !recentGuids.has(stableId);
          }

          if (effectiveTsMs > cursorPublishedAtMs) {
            return true;
          }

          if (effectiveTsMs < cursorPublishedAtMs) {
            return false;
          }

          return !cursorIds.has(stableId);
        })
        .slice(0, maxItems);

      // Create RawDocObserved items
      const items: RawDocObserved[] = [];
      let nextCursorMs = cursorPublishedAtMs;
      let nextCursorIds = new Set(cursorIds);
      const newlySeenIds: string[] = [];

      for (const { item, stableId, effectiveTsMs } of accepted) {

        items.push({
          source_item_id: stableId,
          observed_at: nowIso,
          payload: {
            title: item.title,
            link: item.link,
            description: item.description,
            pubDate: item.pubDate,
            updated: item.updated,
            guid: item.guid
          }
        });

        newlySeenIds.push(stableId);
        if (effectiveTsMs !== null) {
          if (nextCursorMs === null || effectiveTsMs > nextCursorMs) {
            nextCursorMs = effectiveTsMs;
            nextCursorIds = new Set([stableId]);
          } else if (effectiveTsMs === nextCursorMs) {
            nextCursorIds.add(stableId);
          }
        }
      }

      const mergedRecentGuids = [
        ...Array.from(recentGuids),
        ...newlySeenIds
      ];
      const dedupedRecentGuids = Array.from(new Set(mergedRecentGuids)).slice(-this.maxRecentIds);
      const dedupedCursorIds = Array.from(nextCursorIds).slice(-this.maxCursorIds);

      return {
        items,
        newState: {
          cursorPublishedAt: nextCursorMs !== null ? new Date(nextCursorMs).toISOString() : cursorPublishedAt,
          cursorIds: dedupedCursorIds,
          recentIds: dedupedRecentGuids,
          recentGuids: dedupedRecentGuids,
          processedGuids: dedupedRecentGuids,
          etag: response.headers.get('etag') ?? etag,
          lastModified: response.headers.get('last-modified') ?? lastModified,
          lastFetch: nowIso,
          lastSuccess: nowIso,
          consecutiveFailures: 0
        }
      };
    } catch (err) {
      console.error('Error reading RSS feed:', err);
      throw err;
    }
  }
}

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
    const guid = itemXml.match(/<guid>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/)?.[1]?.trim() || '';
    
    items.push({ title, link, description, pubDate, guid });
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

  private readonly maxRecentGuids = 500;

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
    const cursorPublishedAt = typeof state?.cursorPublishedAt === 'string'
      ? state.cursorPublishedAt
      : undefined;
    const cursorPublishedAtMs = parsePubDate(cursorPublishedAt);

    const recentFromState = Array.isArray(state?.recentGuids)
      ? state.recentGuids
      : Array.isArray(state?.processedGuids)
        ? state.processedGuids
        : [];
    const recentGuids = new Set(
      recentFromState
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .slice(-this.maxRecentGuids)
    );

    try {
      // Fetch RSS feed
      const response = await fetch(this.feedUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      const feed = parseRSS(xml);

      // Filter to new items by cursor (pubDate watermark) with GUID fallback
      const newItems = feed.items
        .filter(item => {
          const guid = item.guid || item.link || item.title;
          if (!guid) {
            return false;
          }

          const pubDateMs = parsePubDate(item.pubDate);

          // Bootstrap path: no cursor yet, use recent GUID dedupe only
          if (cursorPublishedAtMs === null) {
            return !recentGuids.has(guid);
          }

          // Prefer strict watermark filtering when pubDate is available
          if (pubDateMs !== null) {
            if (pubDateMs > cursorPublishedAtMs) {
              return true;
            }
            if (pubDateMs === cursorPublishedAtMs) {
              return !recentGuids.has(guid);
            }
            return false;
          }

          // If pubDate is missing, fallback to recent GUID dedupe
          return !recentGuids.has(guid);
        })
        .slice(0, maxItems);

      if (newItems.length === 0) {
        return null; // No new items
      }

      // Create RawDocObserved items
      const items: RawDocObserved[] = [];
      let nextCursorMs = cursorPublishedAtMs;
      const newlySeenGuids: string[] = [];

      for (const item of newItems) {
        const guid = item.guid || item.link || item.title;
        if (!guid) continue;

        items.push({
          source_item_id: guid,
          observed_at: new Date().toISOString(),
          payload: {
            title: item.title,
            link: item.link,
            description: item.description,
            pubDate: item.pubDate,
            guid: item.guid
          }
        });

        newlySeenGuids.push(guid);
        const pubDateMs = parsePubDate(item.pubDate);
        if (pubDateMs !== null && (nextCursorMs === null || pubDateMs > nextCursorMs)) {
          nextCursorMs = pubDateMs;
        }
      }

      if (items.length === 0) {
        return null;
      }

      const mergedRecentGuids = [
        ...Array.from(recentGuids),
        ...newlySeenGuids
      ];
      const dedupedRecentGuids = Array.from(new Set(mergedRecentGuids)).slice(-this.maxRecentGuids);

      return {
        items,
        newState: {
          cursorPublishedAt: nextCursorMs !== null ? new Date(nextCursorMs).toISOString() : cursorPublishedAt,
          recentGuids: dedupedRecentGuids,
          processedGuids: dedupedRecentGuids,
          lastFetch: new Date().toISOString()
        }
      };
    } catch (err) {
      console.error('Error reading RSS feed:', err);
      throw err;
    }
  }
}

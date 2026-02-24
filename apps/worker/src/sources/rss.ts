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
    // Get previously processed guids from state
    const processedGuids = new Set((state?.processedGuids as string[]) || []);

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

      // Filter to new items not yet processed
      const newItems = feed.items
        .filter(item => {
          const guid = item.guid || item.link || item.title;
          return guid && !processedGuids.has(guid);
        })
        .slice(0, maxItems);

      if (newItems.length === 0) {
        return null; // No new items
      }

      // Create RawDocObserved items
      const items: RawDocObserved[] = [];

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

        processedGuids.add(guid);
      }

      if (items.length === 0) {
        return null;
      }

      return {
        items,
        newState: {
          processedGuids: Array.from(processedGuids).sort(),
          lastFetch: new Date().toISOString()
        }
      };
    } catch (err) {
      console.error('Error reading RSS feed:', err);
      throw err;
    }
  }
}


export const webScraperService = {
  // List of CORS proxies to try in order. 
  proxies: [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ],

  /**
   * Fetches the raw text of a URL (HTML).
   * Does NOT clean tags. Use this for Search Results pages where you need to parse structure.
   */
  async fetchRaw(url: string): Promise<string> {
      let validUrl = url;
      if (!validUrl.startsWith('http')) validUrl = `https://${validUrl}`;

      for (const proxyGen of this.proxies) {
        try {
          const proxyUrl = proxyGen(validUrl);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

          const response = await fetch(proxyUrl, { 
              signal: controller.signal,
              headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
              }
          });
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const text = await response.text();
          if (!text || text.length < 50) continue;

          return text;
        } catch (error) {
           // Continue to next proxy
        }
      }
      throw new Error(`Failed to fetch raw content for ${url}`);
  },

  /**
   * Fetches and cleans content for AI analysis.
   * Removes scripts, styles, and tags to save tokens.
   */
  async fetchUrlContent(url: string): Promise<string> {
    try {
        const html = await this.fetchRaw(url);
        return this.cleanHtml(html);
    } catch (e: any) {
        throw new Error(`Scraper Error: ${e.message}`);
    }
  },

  cleanHtml(html: string): string {
    let text = html;
    text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, " ");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, " ");
    text = text.replace(/<!--[\s\S]*?-->/g, " ");
    text = text.replace(/<[^>]+>/g, " "); // Strip tags
    text = text.replace(/\s+/g, " ").trim(); // Collapse whitespace
    return text;
  },

  /**
   * Robust Link Extractor
   */
  extractLinks(html: string, baseUrl: string): string[] {
      const links = new Set<string>();
      
      // Generic regex to capture ALL href attributes
      const regex = /href=["']([^"']+)["']/g;
      let match;
      
      while ((match = regex.exec(html)) !== null) {
          let link = match[1];

          // 1. Resolve Relative URLs
          if (link.startsWith('/')) {
              try {
                  const base = new URL(baseUrl);
                  link = `${base.origin}${link}`;
              } catch (e) {}
          }

          // 2. Filter Junk
          if (
              link.startsWith('http') && 
              !link.includes('duckduckgo.com') &&
              !link.includes('google.com') &&
              !link.includes('bing.com') &&
              !link.includes('yahoo.com') &&
              !link.includes('facebook.com') &&
              !link.includes('twitter.com') &&
              !link.includes('linkedin.com') &&
              !link.includes('instagram.com') &&
              !link.includes('youtube.com') &&
              !link.includes('microsoft.com') &&
              !link.includes('w3.org') &&
              !link.includes('.css') &&
              !link.includes('.js') &&
              !link.includes('.png') &&
              !link.includes('.jpg')
          ) {
              links.add(link);
          }
      }
      return Array.from(links);
  }
};

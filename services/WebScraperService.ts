
export const webScraperService = {
  // List of CORS proxies to try in order. 
  // 'allorigins' is usually the most reliable for text content.
  proxies: [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
  ],

  /**
   * Fetches the raw text of a URL (HTML).
   */
  async fetchRaw(url: string): Promise<string> {
      let validUrl = url;
      if (!validUrl.startsWith('http')) validUrl = `https://${validUrl}`;

      // Try proxies in rotation
      for (const proxyGen of this.proxies) {
        try {
          const proxyUrl = proxyGen(validUrl);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

          // NOTE: We do NOT send custom headers like User-Agent here because 
          // 1. Browsers override them anyway.
          // 2. It triggers OPTIONS preflight which often fails on free proxies.
          const response = await fetch(proxyUrl, { 
              signal: controller.signal 
          });
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const text = await response.text();
          if (!text || text.length < 50) continue;

          return text;
        } catch (error) {
           // console.warn(`Proxy ${proxyGen(validUrl)} failed.`);
           // Continue to next proxy
        }
      }
      throw new Error(`Failed to fetch content for ${url}`);
  },

  /**
   * Fetches and cleans content for AI analysis.
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
   * Extracts all unique HTTP/HTTPS links from the HTML.
   */
  extractLinks(html: string, baseUrl: string): string[] {
      const links = new Set<string>();
      
      // Generic regex to capture ALL href attributes
      // Matches href="http..." or href='/...'
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

          // 2. Filter Junk & Search Engine artifacts
          if (
              link.startsWith('http') && 
              !link.includes('duckduckgo.com') &&
              !link.includes('google.com') &&
              !link.includes('bing.com') &&
              !link.includes('yahoo.com') &&
              !link.includes('yandex.com') &&
              !link.includes('facebook.com') &&
              !link.includes('twitter.com') &&
              !link.includes('linkedin.com') &&
              !link.includes('instagram.com') &&
              !link.includes('youtube.com') &&
              !link.includes('microsoft.com') &&
              !link.includes('w3.org') &&
              !link.includes('cloudflare.com') &&
              !link.includes('.css') &&
              !link.includes('.js') &&
              !link.includes('.png') &&
              !link.includes('.jpg') &&
              !link.includes('.ico') &&
              !link.includes('ad_') &&
              !link.includes('click?')
          ) {
              links.add(link);
          }
      }
      return Array.from(links);
  }
};

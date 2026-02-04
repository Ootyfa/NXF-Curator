
export const webScraperService = {
  // Proxies for raw HTML fetching (Search Engine Results)
  // Ordered by reliability and permissive CORS headers
  proxies: [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    // Fallback: This one sometimes works for simple text
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
  ],

  /**
   * JINA AI READER (Primary Content Fetcher)
   * Converts any URL to LLM-friendly Markdown.
   */
  async fetchWithJina(url: string): Promise<string> {
      try {
          // Jina Reader is a specialized service for LLMs
          const response = await fetch(`https://r.jina.ai/${url}`, {
              headers: { 'X-No-Cache': 'true' }
          });
          if (!response.ok) throw new Error("Jina Reader API error");
          return await response.text();
      } catch (e) {
          // Fallback to raw proxy fetch if Jina fails
          return this.fetchUrlContent(url);
      }
  },

  /**
   * Fetches raw HTML via proxies (for Search Results)
   */
  async fetchRaw(url: string): Promise<string> {
      let validUrl = url;
      if (!validUrl.startsWith('http')) validUrl = `https://${validUrl}`;

      // Try proxies in rotation
      for (const proxyGen of this.proxies) {
        try {
          const proxyUrl = proxyGen(validUrl);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

          const response = await fetch(proxyUrl, { 
              signal: controller.signal 
          });
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const text = await response.text();
          // Validate: Search engines sometimes return empty 200 OK responses on bot detection
          if (!text || text.length < 100) continue; 

          return text;
        } catch (error) {
           // Continue to next proxy
        }
      }
      throw new Error(`All proxies failed for ${url}`);
  },

  /**
   * Fallback Cleaner (used if Jina fails)
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
    text = text.replace(/<[^>]+>/g, " "); 
    text = text.replace(/\s+/g, " ").trim();
    return text;
  },

  extractLinks(html: string, baseUrl: string): string[] {
      const links = new Set<string>();
      // Generic regex to capture ALL href attributes
      const regex = /href=["']([^"']+)["']/g;
      let match;
      
      while ((match = regex.exec(html)) !== null) {
          let link = match[1];

          // Handle relative links
          if (link.startsWith('/')) {
              try {
                  const base = new URL(baseUrl);
                  link = `${base.origin}${link}`;
              } catch (e) {}
          }

          // Strict filter to remove garbage and ads
          if (
              link.startsWith('http') && 
              !link.includes('google.') &&
              !link.includes('facebook.') &&
              !link.includes('twitter.') &&
              !link.includes('instagram.') &&
              !link.includes('youtube.') &&
              !link.includes('linkedin.') &&
              !link.includes('mojeek.') &&
              !link.includes('duckduckgo.') &&
              !link.includes('microsoft.') &&
              !link.includes('yahoo.') &&
              !link.includes('.css') &&
              !link.includes('.js') &&
              !link.includes('.png') &&
              !link.includes('.jpg') &&
              !link.includes('javascript:')
          ) {
              links.add(link);
          }
      }
      return Array.from(links);
  }
};

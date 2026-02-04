
export const webScraperService = {
  // Proxies for raw HTML fetching
  proxies: [
    // CorsProxy.io is usually the most reliable for raw HTML
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    // AllOrigins returns JSON by default, we need to handle that or use /raw
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    // CodeTabs is a good fallback
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ],

  /**
   * JINA AI READER (Primary Content Fetcher)
   * Converts any URL to LLM-friendly Markdown.
   */
  async fetchWithJina(url: string): Promise<string> {
      try {
          const response = await fetch(`https://r.jina.ai/${url}`, {
              headers: { 'X-No-Cache': 'true' }
          });
          if (!response.ok) throw new Error("Jina Reader API error");
          return await response.text();
      } catch (e) {
          return this.fetchUrlContent(url);
      }
  },

  /**
   * Fetches raw HTML via proxies with robust error handling
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
              signal: controller.signal 
          });
          clearTimeout(timeoutId);

          if (!response.ok) continue;

          const text = await response.text();
          
          // Validation: Ensure we actually got HTML, not a proxy error or empty body
          if (!text || text.length < 200) continue; 
          
          return text;
        } catch (error) {
           // Continue to next proxy
        }
      }
      throw new Error(`All proxies failed for ${url}`);
  },

  /**
   * Fallback Cleaner
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
      
      // improved regex to capture hrefs with single, double, or no quotes
      const regex = /href=["']?([^"'>\s]+)["']?/g;
      let match;
      
      while ((match = regex.exec(html)) !== null) {
          let link = match[1];

          // Decoding HTML entities if necessary
          link = link.replace(/&amp;/g, '&');

          try {
            // Handle relative links specifically for search engines
            // DuckDuckGo Lite often uses relative paths like /lite/result...
            if (link.startsWith('/')) {
                const base = new URL(baseUrl);
                link = `${base.origin}${link}`;
            } else if (!link.startsWith('http')) {
                // Handle relative paths without leading slash
                const base = new URL(baseUrl);
                link = new URL(link, base.href).href;
            }
          } catch(e) {
             continue;
          }

          // Strict filter to remove garbage, ads, and internal proxy links
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
              !link.includes('corsproxy') && 
              !link.includes('allorigins') &&
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

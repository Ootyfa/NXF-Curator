
export const webScraperService = {
  // List of CORS proxies to try in order. 
  proxies: [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    // (url: string) => `https://thingproxy.freeboard.io/fetch/${url}` // Often flaky, moved to last or removed
  ],

  async fetchUrlContent(url: string): Promise<string> {
    // Validate URL
    let validUrl = url;
    if (!validUrl.startsWith('http')) {
      validUrl = `https://${validUrl}`;
    }

    // console.log(`Scraping Target: ${validUrl}`);
    
    // Try proxies in rotation
    for (const proxyGen of this.proxies) {
      try {
        const proxyUrl = proxyGen(validUrl);
        
        // Timeout after 15 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(proxyUrl, { 
            signal: controller.signal,
            headers: {
                'X-Requested-With': 'XMLHttpRequest' 
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const html = await response.text();
        
        // Looser check
        if (!html || html.length < 50) {
           throw new Error("Response too short");
        }

        return this.cleanHtml(html);
      } catch (error: any) {
        // Continue to next proxy
      }
    }

    throw new Error(`All proxies failed.`);
  },

  cleanHtml(html: string): string {
    let text = html;
    // Remove scripts, styles, and comments
    text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, " ");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, " ");
    text = text.replace(/<!--[\s\S]*?-->/g, " ");
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, " ");
    // Collapse whitespace
    text = text.replace(/\s+/g, " ").trim();
    return text;
  },

  // Helper to find links in raw HTML (before cleaning)
  // This is a naive regex-based extractor for 'href="..."'
  extractLinks(html: string, baseUrl: string): string[] {
      const links = new Set<string>();
      const regex = /href=["'](.*?)["']/g;
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
          // Filter for likely content pages
          if (link.startsWith('http') && !link.includes('facebook') && !link.includes('twitter') && !link.includes('linkedin')) {
              links.add(link);
          }
      }
      return Array.from(links);
  }
};

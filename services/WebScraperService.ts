
export const webScraperService = {
  // List of CORS proxies to try in order. 
  proxies: [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ],

  async fetchUrlContent(url: string): Promise<string> {
    // Validate URL
    let validUrl = url;
    if (!validUrl.startsWith('http')) {
      validUrl = `https://${validUrl}`;
    }

    // Try proxies in rotation
    for (const proxyGen of this.proxies) {
      try {
        const proxyUrl = proxyGen(validUrl);
        
        // Timeout after 10 seconds (faster fail)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(proxyUrl, { 
            signal: controller.signal,
            headers: {
                // Mimic a real browser to avoid some basic blocking
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Status ${response.status}`);

        const html = await response.text();
        
        if (!html || html.length < 100) throw new Error("Response too short");

        return this.cleanHtml(html);
      } catch (error: any) {
        // console.warn(`Proxy failed: ${proxyGen(validUrl).substring(0, 30)}...`);
      }
    }

    throw new Error(`All proxies failed for: ${url.substring(0, 30)}...`);
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

  /**
   * Advanced Link Extractor
   * 1. If it's a DuckDuckGo result page, it looks for result links specifically.
   * 2. Otherwise it looks for generic links.
   */
  extractLinks(html: string, baseUrl: string): string[] {
      const links = new Set<string>();
      
      // IS SEARCH ENGINE RESULT? (DuckDuckGo Lite)
      if (baseUrl.includes('duckduckgo.com')) {
          // DDG Lite uses class="result__a" for main links
          // Since we might have stripped classes in cleanHtml (if we used it, but here we pass raw html usually)
          // We will use a regex that looks for typical result patterns or just all hrefs if specific fail.
          
          // Regex to capture href inside <a class="result__a" ... href="...">
          // OR generic hrefs if we are parsing raw HTML
          const resultRegex = /href=["'](https?:\/\/(?!duckduckgo|google|bing|yahoo)[^"']+)["']/g;
          let match;
          while ((match = resultRegex.exec(html)) !== null) {
              let link = match[1];
              // Filter out ad/tracking links often found in search results
              if (!link.includes('y.js') && !link.includes('ad_') && !link.includes('r.search')) {
                 links.add(link);
              }
          }
      } else {
          // GENERIC PAGE
          const regex = /href=["'](.*?)["']/g;
          let match;
          while ((match = regex.exec(html)) !== null) {
              let link = match[1];
              if (link.startsWith('/')) {
                  try {
                      const base = new URL(baseUrl);
                      link = `${base.origin}${link}`;
                  } catch (e) {}
              }
              if (link.startsWith('http') && 
                  !link.includes('facebook.com') && 
                  !link.includes('twitter.com') && 
                  !link.includes('linkedin.com') &&
                  !link.includes('instagram.com') &&
                  !link.includes('google.com')) {
                  links.add(link);
              }
          }
      }
      return Array.from(links);
  }
};


export const webScraperService = {
  // List of CORS proxies to try in order. 
  // 'corsproxy.io' is generally the most reliable for text.
  proxies: [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`
  ],

  async fetchUrlContent(url: string): Promise<string> {
    // Validate URL
    let validUrl = url;
    if (!url.startsWith('http')) {
      validUrl = `https://${url}`;
    }

    // console.log(`Scraping Target: ${validUrl}`);
    let lastError: any;

    // Try proxies in rotation
    for (const proxyGen of this.proxies) {
      try {
        const proxyUrl = proxyGen(validUrl);
        
        // Timeout after 10 seconds for speed
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(proxyUrl, { 
            signal: controller.signal,
            headers: {
                'X-Requested-With': 'XMLHttpRequest' // Sometimes helps with CORS proxies
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const html = await response.text();
        
        // Looser check: sometimes valid pages are short or protected
        if (!html || html.length < 100) {
           throw new Error("Response too short");
        }

        // If we got here, success!
        return this.cleanHtml(html);
      } catch (error: any) {
        // console.warn(`Proxy failed: ${error.message}`);
        lastError = error;
        // Continue to next proxy
      }
    }

    // If all failed
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
  }
};

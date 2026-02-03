
export const webScraperService = {
  // List of CORS proxies to try in order
  proxies: [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ],

  async fetchUrlContent(url: string): Promise<string> {
    // Validate URL
    let validUrl = url;
    if (!url.startsWith('http')) {
      validUrl = `https://${url}`;
    }

    console.log(`Scraping Target: ${validUrl}`);
    let lastError: any;

    // Try proxies in rotation
    for (const proxyGen of this.proxies) {
      try {
        const proxyUrl = proxyGen(validUrl);
        // console.log(`Trying proxy: ${proxyUrl}`);
        
        // Timeout after 15 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const html = await response.text();
        if (!html || html.length < 200) {
           throw new Error("Empty or too short response");
        }

        // Clean and return if successful
        return this.cleanHtml(html);
      } catch (error: any) {
        console.warn(`Proxy failed: ${error.message}`);
        lastError = error;
        // Continue to next proxy
      }
    }

    // If all failed
    throw new Error(`All proxies failed. Last error: ${lastError?.message || "Unknown"}`);
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

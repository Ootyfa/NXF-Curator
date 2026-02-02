
export const webScraperService = {
  async fetchUrlContent(url: string): Promise<string> {
    try {
      // Validate URL
      let validUrl = url;
      if (!url.startsWith('http')) {
        validUrl = `https://${url}`;
      }

      console.log(`Scraping: ${validUrl}`);

      // Use allorigins.win as a CORS proxy to bypass browser restrictions
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(validUrl)}`;
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }

      const html = await response.text();

      // Basic cleanup to reduce token usage (remove scripts, styles, etc)
      return this.cleanHtml(html);
    } catch (error: any) {
      console.error("Scraping error:", error);
      throw new Error(`Could not scrape website. The site might block proxies. Try pasting the text manually. Error: ${error.message}`);
    }
  },

  cleanHtml(html: string): string {
    // specific rudimentary cleanup for AI consumption
    let text = html;
    
    // Remove scripts and styles
    text = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gm, " ");
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gm, " ");
    
    // Remove HTML tags, keeping some structure
    text = text.replace(/<[^>]+>/g, " ");
    
    // Collapse whitespace
    text = text.replace(/\s+/g, " ").trim();
    
    return text;
  }
};

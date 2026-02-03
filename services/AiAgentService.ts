import { Opportunity } from "../types";
import { webScraperService } from "./WebScraperService";
import { geminiCall, safeParseJSON, getDebugConfig } from "./GeminiClient";

// ============================================================
// AI AGENT SERVICE
// Uses GeminiClient for transport, implements business logic
// ============================================================
export class AiAgentService {
  
  public getDebugInfo() {
      const dbg = getDebugConfig();
      return {
          googleKeys: dbg.keyCount,
          models: dbg.model || "Auto-detecting...",
          method: "Hybrid (Grounding + Scraping Fallback)"
      };
  }

  /**
   * 1. Discovery: Uses Google Grounding to find opportunities
   */
  async scanWeb(logCallback: (msg: string) => void, topic: string): Promise<Opportunity[]> {
    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toLocaleDateString("en-US");

    const prompt = `Today is ${dateStr}.
    Search for active grant and festival opportunities in India for: "${topic}"
    Find 5-8 items that are open for Indian citizens with deadlines in ${year} or ${year + 1}.
    
    Return JSON array:
    [{
      "title": "Title",
      "organizer": "Organizer",
      "deadline": "YYYY-MM-DD",
      "grantOrPrize": "Value",
      "type": "Grant|Residency|Festival",
      "description": "Summary",
      "website": "URL"
    }]`;

    logCallback(`🔍 Discovery: Searching "${topic}"...`);

    try {
        const { text, sources, usedModel } = await geminiCall(prompt, { grounding: true, log: logCallback });

        const raw = safeParseJSON<any[]>(text);
        
        if (!raw || !Array.isArray(raw)) {
            logCallback("⚠️ No structured data found in AI response.");
            return [];
        }

        const opportunities: Opportunity[] = [];
        raw.forEach((item, i) => {
            if (!item.title) return;
            
            let deadline = new Date(item.deadline);
            if (isNaN(deadline.getTime())) deadline = new Date(now.getTime() + 30 * 86400000);
            
            // Allow 7 day grace period for expired
            if (deadline < new Date(now.getTime() - 7 * 86400000)) return;

            const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
            const url = item.website || sources[0] || "";

            opportunities.push({
                id: `crawl-${Date.now()}-${i}`,
                title: item.title,
                organizer: item.organizer || "Unknown",
                deadline: item.deadline || "See Website",
                deadlineDate: deadline.toISOString().split("T")[0],
                daysLeft: daysLeft > 0 ? daysLeft : 0,
                grantOrPrize: item.grantOrPrize || "See Website",
                eligibility: ["Indian Citizens"],
                type: item.type || "Grant",
                scope: "National",
                category: topic,
                description: item.description || "",
                contact: { website: url, email: "", phone: "" },
                verificationStatus: "draft",
                sourceUrl: url,
                groundingSources: sources,
                aiConfidenceScore: 85,
                aiReasoning: `Found via ${usedModel}`,
                status: "draft",
                createdAt: new Date().toISOString(),
            });
        });

        return opportunities;
    } catch (e: any) {
        logCallback(`❌ Scan failed: ${e.message}`);
        return [];
    }
  }

  /**
   * 2. Analysis: Hybrid approach (Grounding First -> Scraper Fallback)
   */
  async analyzeSpecificUrl(url: string, logCallback: (msg: string) => void = () => {}): Promise<Partial<Opportunity>> {
    logCallback(`🔍 Analyzing URL: ${url}`);
    
    // Attempt 1: Gemini Grounding (Browsing)
    try {
        const prompt = `Visit this URL: ${url}
        Extract details: Title, Organizer, Deadline (YYYY-MM-DD), Prize, Type, Description.
        Return JSON.`;
        
        const { text, usedModel } = await geminiCall(prompt, { grounding: true, log: logCallback });
        const data = safeParseJSON<any>(text);
        
        if (data && data.title && data.title !== "Untitled") {
            logCallback("✅ AI Browsing Successful");
            return this.formatData(data, url, `Gemini Grounding (${usedModel})`);
        }
    } catch (e) {
        logCallback(`⚠️ AI Browse failed, falling back to scraper...`);
    }

    // Attempt 2: Scraper + Text Analysis
    try {
        logCallback("Trying Web Scraper...");
        const content = await webScraperService.fetchUrlContent(url);
        logCallback(`✅ Scraper retrieved content. Analyzing...`);
        return this.extractOpportunityFromText(content, url);
    } catch (e: any) {
        logCallback(`❌ Scraper failed: ${e.message}`);
        throw new Error("Could not extract data from URL via AI or Scraper.");
    }
  }

  /**
   * 3. Raw Text Extraction
   */
  async extractOpportunityFromText(text: string, sourceUrl?: string): Promise<Partial<Opportunity>> {
      const prompt = `Analyze this text for a grant/festival opportunity.
      Return JSON: { "title": "", "organizer": "", "deadline": "YYYY-MM-DD", "grantOrPrize": "", "type": "Grant|Festival|Residency", "description": "" }
      
      Text: """${text.substring(0, 30000)}"""`;

      const { text: responseText, usedModel } = await geminiCall(prompt, { grounding: false });
      const data = safeParseJSON<any>(responseText);
      
      if (!data) throw new Error("AI could not parse opportunities from text.");
      
      return this.formatData(data, sourceUrl || "", `Text Analysis (${usedModel})`);
  }

  private formatData(data: any, url: string, method: string): Partial<Opportunity> {
      let deadline = new Date(data.deadline);
      if (isNaN(deadline.getTime())) deadline = new Date(Date.now() + 30 * 86400000);
      const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);

      return {
          title: data.title,
          organizer: data.organizer || "Unknown",
          deadline: data.deadline || "See Website",
          deadlineDate: deadline.toISOString().split("T")[0],
          daysLeft,
          grantOrPrize: data.grantOrPrize || "See Website",
          eligibility: [],
          type: data.type || "Grant",
          scope: "National",
          description: data.description || "",
          contact: { website: url, email: "", phone: "" },
          verificationStatus: "verified",
          sourceUrl: url,
          groundingSources: [url],
          aiConfidenceScore: 90,
          aiReasoning: method,
          status: "published",
          createdAt: new Date().toISOString()
      };
  }
}

export const aiAgentService = new AiAgentService();

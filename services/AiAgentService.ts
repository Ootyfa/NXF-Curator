import { Opportunity } from "../types";
import { groqCall, safeParseJSON } from "./GroqClient";
import { webScraperService } from "./WebScraperService";
import { KeywordBrain } from "./KeywordBrain";

// ============================================================
// AI AGENT SERVICE (GROQ + KEYWORD SEARCH)
// ============================================================
export class AiAgentService {
  
  /**
   * MANUAL MODE: Takes raw pasted text and organizes it.
   */
  async parseOpportunityText(rawText: string, sourceUrl: string = ""): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) throw new Error("Content too short.");

      // Truncate
      const textToAnalyze = rawText.substring(0, 25000); 

      const prompt = `
      You are an expert grant researcher. Analyze the text below and extract opportunity details.
      
      Return a SINGLE JSON object with these exact keys:
      {
        "title": "Name of the grant/festival",
        "organizer": "Who is organizing it",
        "deadline": "YYYY-MM-DD" (if not found, guess based on context or use today + 30 days),
        "grantOrPrize": "Value or Award details",
        "type": "Grant" or "Residency" or "Festival" or "Lab",
        "description": "Short summary (max 3 sentences)",
        "eligibility": ["List", "of", "requirements"],
        "website": "URL if found in text, else empty string"
      }

      RAW TEXT:
      """
      ${textToAnalyze}
      """
      `;

      try {
          const { text } = await groqCall(prompt, { jsonMode: true });
          const data = safeParseJSON<any>(text);
          
          if (!data) throw new Error("Could not parse AI response.");

          // Data Cleaning
          let deadlineDate = data.deadline;
          // Validation: if date is invalid or in past (and older than 30 days), reset
          const d = new Date(deadlineDate);
          if (!deadlineDate || isNaN(d.getTime())) {
              deadlineDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
          }

          const deadlineObj = new Date(deadlineDate);
          const daysLeft = Math.ceil((deadlineObj.getTime() - Date.now()) / 86400000);

          return {
              title: data.title || "Untitled Opportunity",
              organizer: data.organizer || "Unknown Organizer",
              deadline: deadlineObj.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' }),
              deadlineDate: deadlineDate,
              daysLeft: daysLeft > 0 ? daysLeft : 0,
              grantOrPrize: data.grantOrPrize || "See Details",
              type: data.type || "Grant",
              description: data.description || "",
              eligibility: Array.isArray(data.eligibility) ? data.eligibility : [],
              contact: { website: data.website || sourceUrl || "", email: "", phone: "" },
              verificationStatus: "verified",
              status: "published",
              createdAt: new Date().toISOString(),
              aiConfidenceScore: sourceUrl ? 85 : 100,
              aiReasoning: sourceUrl ? "Keyword Discovery via Groq" : "Manual Admin Entry",
              sourceUrl: data.website || sourceUrl || ""
          };

      } catch (e: any) {
          console.error("Parse Error", e);
          throw new Error("Failed to parse text: " + e.message);
      }
  }

  /**
   * AUTO-PILOT MODE: Keyword-Based Search Engine Scraper
   */
  async performAutoScan(onLog: (msg: string) => void): Promise<Opportunity[]> {
      const foundOpportunities: Opportunity[] = [];
      const processedUrls = new Set<string>();
      const brain = KeywordBrain.get();

      onLog("🚀 Initializing Groq Keyword Agent...");
      onLog(`🧠 Brain Power: ${brain.getCount()} Keywords Loaded`);
      onLog("ℹ️ Engine: Llama-3.3-70b-versatile");

      // 1. Select Keywords
      const keywords = brain.getBatch(3); // Pick 3 random keywords
      onLog(`🎯 Selected Targets: ${keywords.map(k => `"${k}"`).join(", ")}`);

      for (const keyword of keywords) {
          onLog(`\n🔎 Searching: "${keyword}"...`);
          
          try {
              // 2. Perform Search via Proxy (using DuckDuckGo HTML version)
              const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`;
              
              let searchHtml = "";
              try {
                  // We fetch the raw HTML of the search result page
                  // Note: webScraperService needs to handle raw html fetch without cleaning for link extraction logic sometimes, 
                  // but our service cleans it. Ideally we extract links from raw response in service.
                  // For now, we assume webScraperService fetches it.
                  
                  // NOTE: We pass the URL. The service handles the proxy.
                  // We intentionally use a raw fetch inside the service to capture links.
                  const rawResponse = await this.rawProxyFetch(searchUrl);
                  searchHtml = rawResponse;
              } catch (e) {
                  onLog(`   ⚠️ Search Blocked/Failed for this keyword. Trying next.`);
                  continue;
              }

              // 3. Extract Result Links
              const links = webScraperService.extractLinks(searchHtml, "https://duckduckgo.com");
              
              // Filter garbage
              const candidates = links.filter(l => 
                  !l.includes('google') && 
                  !l.includes('duckduckgo') && 
                  !l.includes('youtube') &&
                  l.length > 15
              ).slice(0, 2); // Take top 2 results per keyword to save time

              onLog(`   🔗 Found ${candidates.length} relevant links.`);

              // 4. Deep Scan Pages
              for (const url of candidates) {
                  if (processedUrls.has(url)) continue;
                  processedUrls.add(url);

                  onLog(`      🕵️ Analyzing: ${url.substring(0, 40)}...`);
                  
                  try {
                      const pageHtml = await webScraperService.fetchUrlContent(url);
                      
                      // Check if content is relevant before wasting AI tokens
                      if (!pageHtml.toLowerCase().includes('grant') && 
                          !pageHtml.toLowerCase().includes('festival') && 
                          !pageHtml.toLowerCase().includes('apply')) {
                          onLog(`      ⏩ Skipped (Low Relevance)`);
                          continue;
                      }

                      const opp = await this.parseOpportunityText(pageHtml, url);
                      
                      if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                          foundOpportunities.push(opp as Opportunity);
                          onLog(`      ✨ SUCCESS: Found "${opp.title}"`);
                      } else {
                          onLog(`      ⚠️ Analyzed but no valid opportunity found.`);
                      }
                  } catch (e: any) {
                      onLog(`      ❌ Analyze Failed: ${e.message}`);
                  }
                  
                  await new Promise(r => setTimeout(r, 1500)); // Politeness delay
              }

          } catch (e: any) {
              onLog(`   ⚠️ Keyword Step Failed: ${e.message}`);
          }
      }

      onLog(`\n🏁 Scan Complete. Found ${foundOpportunities.length} opportunities.`);
      return foundOpportunities;
  }

  // Private helper to get raw HTML for link extraction (bypassing cleanHtml)
  private async rawProxyFetch(url: string): Promise<string> {
      // Use AllOrigins as it's usually most reliable for simple GETs
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxy);
      if(!res.ok) throw new Error("Proxy Error");
      return await res.text();
  }
}

export const aiAgentService = new AiAgentService();

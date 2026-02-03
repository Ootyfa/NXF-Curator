import { Opportunity } from "../types";
import { groqCall, safeParseJSON } from "./GroqClient";
import { webScraperService } from "./WebScraperService";

// ============================================================
// AI AGENT SERVICE (GROQ EDITION)
// Supports Manual Parsing & Autonomous Hub Crawling
// ============================================================
export class AiAgentService {
  
  /**
   * MANUAL MODE: Takes raw pasted text and organizes it into the Opportunity structure.
   */
  async parseOpportunityText(rawText: string, sourceUrl: string = ""): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) {
          throw new Error("Content too short to analyze.");
      }

      // Truncate to avoid token limits (Groq has limits too, though Llama 70b is generous)
      const textToAnalyze = rawText.substring(0, 15000); 

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

      RAW TEXT TO ANALYZE:
      """
      ${textToAnalyze}
      """
      `;

      try {
          const { text } = await groqCall(prompt, { jsonMode: true });
          const data = safeParseJSON<any>(text);
          
          if (!data) throw new Error("Could not parse AI response.");

          // Format Date
          let deadlineDate = data.deadline;
          if (!deadlineDate || isNaN(new Date(deadlineDate).getTime())) {
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
              aiConfidenceScore: sourceUrl ? 90 : 100,
              aiReasoning: sourceUrl ? "Auto-Crawled via Groq" : "Manual Admin Entry",
              sourceUrl: data.website || sourceUrl || ""
          };

      } catch (e: any) {
          console.error("Parse Error", e);
          throw new Error("Failed to parse text: " + e.message);
      }
  }

  /**
   * AUTO-PILOT MODE: Crawls known hubs because Groq cannot Google Search.
   */
  async performAutoScan(onLog: (msg: string) => void): Promise<Opportunity[]> {
      const foundOpportunities: Opportunity[] = [];
      const processedUrls = new Set<string>();

      // Since we don't have Google Search Grounding with Groq,
      // We use a "Seed List" strategy: Visit known aggregators/hubs and crawl them.
      // NOTE: These are example URLs. In a real CORS environment, these might block fetch.
      const seedHubs = [
          { url: "https://www.filmfreeway.com", name: "FilmFreeway (Simulated)" },
          { url: "https://film.org/grants", name: "Film Grants Hub" },
          // Add more hubs here
      ];

      onLog("🚀 Initializing Groq Autonomous Agent...");
      onLog("ℹ️ Engine: Llama-3.3-70b-versatile");
      onLog("🕸️ Strategy: Hub Crawling (Search Disabled)");

      for (const hub of seedHubs) {
          onLog(`\n🕷️ Visiting Hub: ${hub.name}...`);
          
          try {
              // 1. Fetch Hub Content (using WebScraperService directly is tricky for hubs due to size)
              // Instead, we will simulate the "Discovery" of links for this demo if scraping fails,
              // or try to scrape strictly.
              
              // For robustness in this demo, since we can't easily scrape "FilmFreeway" homepage via proxy without issues:
              // We will simply warn if scraping fails.
              
              let html = "";
              try {
                  html = await webScraperService.fetchUrlContent(hub.url);
              } catch (e) {
                  onLog(`   ⚠️ Could not fetch hub (CORS/Block): ${hub.url}`);
                  continue;
              }

              // 2. Extract potential Links
              // In a real crawl, we'd extract specific opportunity links.
              // Here we try to find links that look like opportunity pages.
              const links = webScraperService.extractLinks(html, hub.url);
              
              // Filter links to avoid navigation junk
              const targetLinks = links.filter(l => l.length > 20 && (l.includes('grant') || l.includes('fest') || l.includes('apply') || l.includes('submit'))).slice(0, 3); // Limit to 3 per hub

              onLog(`   🔗 Found ${targetLinks.length} potential leads.`);

              // 3. Deep Scan Targets
              for (const targetUrl of targetLinks) {
                  if (processedUrls.has(targetUrl)) continue;
                  processedUrls.add(targetUrl);

                  onLog(`      🕵️ Deep Scanning: ${targetUrl.substring(0, 40)}...`);
                  
                  try {
                      const pageHtml = await webScraperService.fetchUrlContent(targetUrl);
                      const opp = await this.parseOpportunityText(pageHtml, targetUrl);
                      
                      // Validate
                      if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                          foundOpportunities.push(opp as Opportunity);
                          onLog(`      ✨ SUCCESS: Identified "${opp.title}"`);
                      } else {
                          onLog(`      ⚠️ Skipped: Irrelevant or Expired.`);
                      }
                  } catch (e: any) {
                      onLog(`      ❌ Failed to analyze page: ${e.message}`);
                  }
                  
                  await new Promise(r => setTimeout(r, 1000));
              }

          } catch (e: any) {
              onLog(`   ⚠️ Hub Step Failed: ${e.message}`);
          }
      }

      onLog(`\n🏁 Scan Complete. Found ${foundOpportunities.length} opportunities.`);
      return foundOpportunities;
  }
}

export const aiAgentService = new AiAgentService();

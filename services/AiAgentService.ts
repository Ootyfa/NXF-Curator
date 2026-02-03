import { Opportunity } from "../types";
import { geminiCall, safeParseJSON } from "./GeminiClient";
import { webScraperService } from "./WebScraperService";

// ============================================================
// AI AGENT SERVICE
// Supports both Manual Text Parsing and Autonomous Web Scanning
// ============================================================
export class AiAgentService {
  
  /**
   * MANUAL MODE: Takes raw pasted text and organizes it into the Opportunity structure.
   */
  async parseOpportunityText(rawText: string, sourceUrl: string = ""): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) {
          throw new Error("Content too short to analyze.");
      }

      // Truncate to avoid token limits
      const textToAnalyze = rawText.substring(0, 30000);

      const prompt = `
      Analyze the following text and extract opportunity details.
      
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
          // We use geminiCall strictly for its text-processing ability
          const { text } = await geminiCall(prompt, { grounding: false });
          const data = safeParseJSON<any>(text);
          
          if (!data) throw new Error("Could not parse AI response.");

          // Format Date
          let deadlineDate = data.deadline;
          // specific check if it's a valid date string, else default
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
              aiReasoning: sourceUrl ? "Auto-Scanned from Web" : "Manual Admin Entry",
              sourceUrl: data.website || sourceUrl || ""
          };

      } catch (e: any) {
          console.error("Parse Error", e);
          throw new Error("Failed to parse text: " + e.message);
      }
  }

  /**
   * AUTO-PILOT MODE: Crawls the web for opportunities
   */
  async performAutoScan(onLog: (msg: string) => void): Promise<Opportunity[]> {
      const currentYear = new Date().getFullYear();
      const queries = [
          `art grants India deadline ${currentYear}`,
          `film festival submissions India ${currentYear}`,
          `documentary funding for indian filmmakers ${currentYear}`,
          `artist residencies India open call ${currentYear}`
      ];

      const foundOpportunities: Opportunity[] = [];
      const processedUrls = new Set<string>();

      onLog("🚀 Initializing Autonomous Agent...");
      onLog("📅 Targeting Year: " + currentYear);

      for (const query of queries) {
          onLog(`\n🔎 Executing Search Strategy: "${query}"`);
          
          try {
              // 1. Grounding Search
              const { text, sources } = await geminiCall(
                  `Find 5 distinct, currently open opportunities for: "${query}". 
                   Return a JSON array of objects with: { "title": "...", "url": "..." }. 
                   Ensure they are relevant to Indian citizens.`,
                  { grounding: true }
              );

              // 2. Identify Targets
              let targets: {url: string, title?: string}[] = [];
              
              // Try to parse JSON from text first
              const jsonResults = safeParseJSON<any[]>(text);
              if (jsonResults && Array.isArray(jsonResults)) {
                  targets = jsonResults.map(r => ({ url: r.url || r.website, title: r.title })).filter(r => r.url);
              }
              
              // Fallback: Use grounding sources
              if (targets.length === 0 && sources.length > 0) {
                   targets = sources.map(s => ({ url: s }));
              }

              onLog(`   🎯 Found ${targets.length} potential leads.`);

              // 3. Deep Scan (Limit to top 3 to prevent timeouts)
              for (const target of targets.slice(0, 3)) {
                  if (processedUrls.has(target.url)) continue;
                  processedUrls.add(target.url);

                  onLog(`   🕷️ Crawling: ${target.url.substring(0, 40)}...`);
                  
                  try {
                      const html = await webScraperService.fetchUrlContent(target.url);
                      onLog(`      ✅ Content fetched (${html.length} chars). Analyzing...`);
                      
                      const opp = await this.parseOpportunityText(html, target.url);
                      
                      // Validate
                      if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                          foundOpportunities.push(opp as Opportunity);
                          onLog(`      ✨ SUCCESS: Identified "${opp.title}"`);
                      } else {
                          onLog(`      ⚠️ Skipped: Irrelevant or Expired.`);
                      }
                  } catch (e: any) {
                      onLog(`      ❌ Failed to analyze: ${e.message}`);
                  }
                  
                  // Be nice to servers
                  await new Promise(r => setTimeout(r, 1500));
              }

          } catch (e: any) {
              onLog(`   ⚠️ Search Step Failed: ${e.message}`);
          }
      }

      onLog(`\n🏁 Scan Complete. Found ${foundOpportunities.length} actionable opportunities.`);
      return foundOpportunities;
  }
}

export const aiAgentService = new AiAgentService();

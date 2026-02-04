import { Opportunity } from "../types";
import { groqCall, safeParseJSON, GROQ_MODELS } from "./GroqClient";
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
      const textToAnalyze = rawText.substring(0, 30000); 

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
          // Use QUALITY model for better extraction
          const { text } = await groqCall(prompt, { jsonMode: true, model: GROQ_MODELS.QUALITY });
          const data = safeParseJSON<any>(text);
          
          if (!data) throw new Error("Could not parse AI response.");

          // Data Cleaning
          let deadlineDate = data.deadline;
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
   * MEMORY BANK: High-Quality Fallback Links
   * Used when search engines block requests.
   */
  private getBackupLinks(): string[] {
      return [
        // Film & Media
        "https://www.nfdcindia.com/schemes/",
        "https://www.sundance.org/apply/",
        "https://filmindependent.org/programs/",
        "https://www.docedge.nz/industry/pitch/",
        "https://www.idfa.nl/en/info/idfa-bertha-fund",
        "https://www.berthafoundation.org/storytellers",
        "https://www.asianfilmfund.org/",
        
        // Visual Arts
        "https://khojstudios.org/opportunities/",
        "https://indiaifa.org/grants-projects",
        "https://inlaksfoundation.org/opportunities/",
        "https://serendipityarts.org/grant/",
        "https://www.pollock-krasner-foundation.org/apply",
        "https://www.ssrf.in/opportunities/",
        "https://whataboutart.net/residency/",
        
        // General / Mixed
        "https://on-the-move.org/news",
        "https://www.britishcouncil.in/programmes/arts/opportunities",
        "https://www.goethe.de/ins/in/en/kul/ser/aus.html",
        "https://prohelvetia.org.in/en/open-calls/",
        "https://tfaindia.org/grants/",
        "https://www.tatatrusts.org/our-work/arts-and-culture",
        
        // Government
        "https://www.indiaculture.gov.in/schemes",
        "https://ccrtindia.gov.in/scholarship-scheme/",
        "https://sangeetnatak.gov.in/sna-schemes"
      ];
  }

  /**
   * SEARCH ENGINE FAILOVER SYSTEM
   */
  private async searchWeb(keyword: string, onLog: (msg: string) => void): Promise<string[]> {
      // 1. Try Mojeek (Crawler based, good for scraping)
      try {
          const url = `https://www.mojeek.com/search?q=${encodeURIComponent(keyword)}`;
          const html = await webScraperService.fetchRaw(url);
          const links = webScraperService.extractLinks(html, "https://www.mojeek.com");
          if (links.length > 0) return links;
      } catch (e) {
          // Silent fail to next engine
      }

      // 2. Try DuckDuckGo Lite (HTML only, lighter)
      try {
          const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(keyword)}`;
          const html = await webScraperService.fetchRaw(url);
          const links = webScraperService.extractLinks(html, "https://lite.duckduckgo.com");
          if (links.length > 0) return links;
      } catch (e) {
          // Silent fail
      }

      onLog("   ⚠️ All Search Engines blocked/failed for this keyword.");
      return [];
  }

  /**
   * AUTO-PILOT MODE: Robust Scraping Logic
   */
  async performAutoScan(onLog: (msg: string) => void): Promise<Opportunity[]> {
      const foundOpportunities: Opportunity[] = [];
      const processedUrls = new Set<string>();
      const brain = KeywordBrain.get();

      onLog("🚀 Initializing Agent...");
      onLog(`🧠 Memory: ${brain.getCount()} Keywords | 📚 Backup Sites: ${this.getBackupLinks().length}`);
      onLog("ℹ️ Engine: Llama-3.3-70b-versatile");

      // 1. Gather Candidates (Search + Fallback)
      let candidateUrls: string[] = [];
      const keywords = brain.getBatch(3); 
      
      onLog(`🎯 Targets: ${keywords.map(k => `"${k}"`).join(", ")}`);

      // PHASE 1: ACTIVE SEARCH
      for (const keyword of keywords) {
          onLog(`\n🔎 Scanning Web for: "${keyword}"...`);
          const links = await this.searchWeb(keyword, onLog);
          
          if (links.length > 0) {
              // Filter garbage links
              const cleanLinks = links.filter(l => l.length > 25 && !l.includes('search?') && !l.includes('google'));
              onLog(`   🔗 Found ${cleanLinks.length} new leads.`);
              candidateUrls.push(...cleanLinks);
          }
      }

      // PHASE 2: MEMORY BANK INJECTION (Consistency Guarantee)
      // If we found few results (or even if we found some, mix in high-quality sources)
      // Increased threshold to 15 to ensure we have enough to scan
      if (candidateUrls.length < 15) {
          onLog(`\n⚠️ Low search yield. Activating Deep Memory Bank...`);
          const backups = this.getBackupLinks();
          // Shuffle backups and take a good chunk
          const shuffled = backups.sort(() => 0.5 - Math.random()).slice(0, 8);
          candidateUrls.push(...shuffled);
          onLog(`   📚 Added ${shuffled.length} trusted sources to scan queue.`);
      }

      // Deduplicate and Prioritize
      candidateUrls = [...new Set(candidateUrls)];

      if (candidateUrls.length === 0) {
          onLog("❌ No URLs found to scan. Check network connection.");
          return [];
      }

      // PHASE 3: DEEP SCANNING
      // Increased MAX_SCANS to 12 to improve chances of getting 10+ items
      const MAX_SCANS = 12; 
      let scannedCount = 0;
      
      onLog(`\n🕵️ Starting Analysis on ${Math.min(candidateUrls.length, MAX_SCANS)} pages...`);

      for (const url of candidateUrls) {
          if (scannedCount >= MAX_SCANS) break;
          if (processedUrls.has(url)) continue;
          processedUrls.add(url);

          onLog(`   Reading: ${url.substring(0, 50)}...`);
          
          try {
              // Use Jina AI Reader for best text extraction
              const pageText = await webScraperService.fetchWithJina(url);
              
              // Fast Relevance Check (Client-side)
              const lower = pageText.toLowerCase();
              if (!lower.includes('apply') && !lower.includes('deadline') && !lower.includes('grant') && !lower.includes('submission')) {
                   // onLog(`      ⏩ Skipped (Low Relevance)`);
                   continue;
              }

              const opp = await this.parseOpportunityText(pageText, url);
              
              if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                  foundOpportunities.push(opp as Opportunity);
                  onLog(`      ✅ MATCH: "${opp.title}"`);
              }
              
              scannedCount++;
              
          } catch (e: any) {
              // onLog(`      ❌ Failed: ${e.message}`);
          }
          
          // Politeness delay
          await new Promise(r => setTimeout(r, 1500)); 
      }

      if (foundOpportunities.length < 2) {
         onLog("\n⚠️ Low successful extractions. Agent suggests retrying with different keywords.");
      }

      onLog(`\n🏁 Scan Complete. Found ${foundOpportunities.length} actionable opportunities.`);
      return foundOpportunities;
  }
}

export const aiAgentService = new AiAgentService();

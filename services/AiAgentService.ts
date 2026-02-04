
import { Opportunity } from "../types";
import { groqCall, safeParseJSON, GROQ_MODELS } from "./GroqClient";
import { webScraperService } from "./WebScraperService";
import { KeywordBrain } from "./KeywordBrain";

interface ScanOptions {
  mode: 'daily' | 'deep';
  targetCount?: number;
}

// ============================================================
// AI AGENT SERVICE (GROQ + KEYWORD SEARCH)
// ============================================================
export class AiAgentService {
  
  /**
   * MANUAL MODE: Takes raw pasted text and organizes it.
   */
  async parseOpportunityText(rawText: string, sourceUrl: string = ""): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) throw new Error("Content too short.");

      // Truncate to avoid context window limits
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
   */
  private getBackupLinks(mode: 'daily' | 'deep'): string[] {
      // News/Feed pages that update frequently
      const newsSources = [
        "https://on-the-move.org/news",
        "https://www.nfdcindia.com/schemes/",
        "https://www.britishcouncil.in/programmes/arts/opportunities",
        "https://khojstudios.org/opportunities/",
        "https://indiaifa.org/grants-projects",
        "https://ficart.org/", // Often has open calls
        "https://prohelvetia.org.in/en/open-calls/"
      ];

      // Static pages or deep databases
      const deepSources = [
        "https://filmfreeway.com/festivals/curated?q=india",
        "https://www.sundance.org/apply/",
        "https://filmindependent.org/programs/",
        "https://www.docedge.nz/industry/pitch/",
        "https://www.berthafoundation.org/storytellers",
        "https://www.asianfilmfund.org/",
        "https://inlaksfoundation.org/opportunities/",
        "https://serendipityarts.org/grant/",
        "https://www.pollock-krasner-foundation.org/apply",
        "https://www.totofundsthearts.org/",
        "https://tifaworkingstudios.org/",
        "http://1shanthiroad.com/",
        "https://map-india.org/opportunities/",
        "https://www.goethe.de/ins/in/en/kul/ser/aus.html",
        "https://jfindia.org.in/",
        "https://www.alliancefrancaise.org.in/",
        "https://www.tatatrusts.org/our-work/arts-and-culture",
        "https://www.asianculturalcouncil.org/our-work/grants-fellowships",
        "https://www.indiaculture.gov.in/schemes",
        "https://ccrtindia.gov.in/scholarship-scheme/",
        "https://sangeetnatak.gov.in/sna-schemes"
      ];

      return mode === 'daily' ? newsSources : [...newsSources, ...deepSources];
  }

  /**
   * SEARCH ENGINE FAILOVER SYSTEM
   */
  private async searchWeb(keyword: string, onLog: (msg: string) => void): Promise<string[]> {
      try {
          const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(keyword)}`;
          const html = await webScraperService.fetchRaw(url);
          const links = webScraperService.extractLinks(html, "https://lite.duckduckgo.com");
          if (links.length > 0) return links;
      } catch (e) {
         // Silent fail
      }
      return [];
  }

  /**
   * Pre-screen content to save tokens on the large model
   */
  private async isRelevantContent(text: string): Promise<boolean> {
      if (text.length < 500) return false;
      const lower = text.toLowerCase();
      // Basic heuristic first
      if (!lower.includes("apply") && !lower.includes("grant") && !lower.includes("deadline") && !lower.includes("submission")) {
          return false;
      }
      
      // Use FAST model for semantic check
      const prompt = `Does this text describe a grant, artist residency, festival submission, or funding opportunity? Reply only YES or NO.\n\nText: ${text.substring(0, 1000)}...`;
      try {
          const { text: answer } = await groqCall(prompt, { model: GROQ_MODELS.FAST, temperature: 0 });
          return answer.trim().toUpperCase().includes("YES");
      } catch {
          return true; // Fallback to true to be safe
      }
  }

  /**
   * AUTO-PILOT MODE
   * Supports 'daily' for urgent checks and 'deep' for exploration.
   */
  async performAutoScan(onLog: (msg: string) => void, options: ScanOptions = { mode: 'deep' }): Promise<Opportunity[]> {
      const foundOpportunities: Opportunity[] = [];
      const processedUrls = new Set<string>();
      const brain = KeywordBrain.get();
      
      const TARGET_COUNT = options.targetCount || 10;
      const MAX_SCANS = options.mode === 'daily' ? 15 : 30; // Scan fewer pages in daily mode, but more targeted

      onLog("🚀 Initializing Agent...");
      onLog(`ℹ️ Mode: ${options.mode.toUpperCase()} Scan`);
      
      // 1. Keyword Selection
      const keywordMode = options.mode === 'daily' ? 'urgent' : 'mixed';
      const keywords = brain.getBatch(options.mode === 'daily' ? 3 : 5, keywordMode);
      
      onLog(`🎯 Targets: ${keywords.map(k => `"${k}"`).join(", ")}`);

      // 2. Build Candidate List
      let candidateUrls: string[] = [];

      // A. Search
      for (const keyword of keywords) {
          onLog(`\n🔎 Scanning Web for: "${keyword}"...`);
          const links = await this.searchWeb(keyword, onLog);
          if (links.length > 0) {
              const cleanLinks = links.filter(l => l.length > 25 && !l.includes('search?') && !l.includes('google'));
              onLog(`   🔗 Found ${cleanLinks.length} leads via Search.`);
              candidateUrls.push(...cleanLinks);
          }
      }

      // B. Backup/News Injection
      onLog(`\n🛡️ Injecting ${options.mode === 'daily' ? 'News' : 'Deep'} Sources...`);
      const backups = this.getBackupLinks(options.mode);
      // Prioritize backups in daily mode
      const backupCount = options.mode === 'daily' ? 10 : 6;
      const shuffledBackups = backups.sort(() => 0.5 - Math.random()).slice(0, backupCount);
      candidateUrls.push(...shuffledBackups);
      
      // Deduplicate
      candidateUrls = [...new Set(candidateUrls)];

      // 3. Execution Loop
      let scannedCount = 0;
      onLog(`\n🕵️ Analyzing content (Fast-Filter Active)...`);

      for (const url of candidateUrls) {
          if (foundOpportunities.length >= TARGET_COUNT) {
              onLog(`\n🎉 Target Reached!`);
              break;
          }
          if (scannedCount >= MAX_SCANS) {
              onLog(`\n🛑 Scan Limit Reached.`);
              break;
          }

          if (processedUrls.has(url)) continue;
          processedUrls.add(url);

          onLog(`   Reading: ${url.replace('https://', '').substring(0, 35)}...`);
          
          try {
              const pageText = await webScraperService.fetchWithJina(url);
              
              // FAST CHECK
              const isRelevant = await this.isRelevantContent(pageText);
              if (!isRelevant) {
                  // onLog(`      Skipping (Not Relevant)`);
                  continue;
              }

              // DEEP EXTRACTION (Expensive)
              const opp = await this.parseOpportunityText(pageText, url);
              
              if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                  foundOpportunities.push(opp as Opportunity);
                  onLog(`      ✅ MATCH: "${opp.title}"`);
              } 
              
              scannedCount++;
              
          } catch (e: any) {
               // Silent fail
          }
          
          await new Promise(r => setTimeout(r, 1000)); 
      }

      onLog(`\n🏁 Scan Complete. Found ${foundOpportunities.length} opportunities.`);
      return foundOpportunities;
  }
}

export const aiAgentService = new AiAgentService();

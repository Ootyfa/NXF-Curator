
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
   * SPECIALIZED: Daily 6 AM Deep Scan
   * Targets international and national opportunities.
   */
  async runDailyDeepScan(onLog: (msg: string) => void): Promise<Opportunity[]> {
      // Enforce Deep Mode parameters:
      // - High target count (minimum 10)
      // - Mixed keywords (International + National)
      // - Uses Llama-3.3-70b via performAutoScan's parse logic
      return this.performAutoScan(onLog, { 
          mode: 'deep', 
          targetCount: 15 // Aiming for >10
      });
  }

  /**
   * MANUAL MODE: Takes raw pasted text and organizes it.
   * Uses Llama-3.3-70b-versatile for high precision.
   */
  async parseOpportunityText(rawText: string, sourceUrl: string = ""): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) throw new Error("Content too short.");

      // Truncate to avoid context window limits (Llama 3 supports large context, but safe limit is good)
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
        "website": "URL if found in text, else empty string",
        "scope": "International" or "National"
      }

      RAW TEXT:
      """
      ${textToAnalyze}
      """
      `;

      try {
          // EXCLUSIVE GROQ CALL - QUALITY MODEL
          const { text } = await groqCall(prompt, { 
              jsonMode: true, 
              model: GROQ_MODELS.QUALITY 
          });
          
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
              scope: data.scope || "National",
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
      const globalSources = [
          "https://on-the-move.org/news",
          "https://resartis.org/open-calls/",
          "https://www.transartists.org/en/call-for-artists",
          "https://www.e-flux.com/announcements/",
          "https://www.artandeducation.net/announcements",
          "https://www.callforcurators.com/call-type/residencies/",
          "https://www.artrabbit.com/artist-opportunities"
      ];

      const indiaSources = [
        "https://www.nfdcindia.com/schemes/",
        "https://www.britishcouncil.in/programmes/arts/opportunities",
        "https://khojstudios.org/opportunities/",
        "https://indiaifa.org/grants-projects",
        "https://ficart.org/",
        "https://prohelvetia.org.in/en/open-calls/",
        "https://filmfreeway.com/festivals/curated?q=india"
      ];

      return mode === 'daily' ? indiaSources : [...indiaSources, ...globalSources];
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
   * Pre-screen content to save tokens on the large model.
   * Uses Llama-3.1-8b-instant for speed.
   */
  private async isRelevantContent(text: string): Promise<boolean> {
      if (text.length < 500) return false;
      const lower = text.toLowerCase();
      
      const requiredTerms = [
          "apply", "grant", "deadline", "submission", "submit", "application", 
          "proposal", "open call", "entry", "register", "audition", "fellowship", 
          "residency", "competition", "contest", "award", "prize", "fund", "scheme"
      ];
      
      const hasTerm = requiredTerms.some(term => lower.includes(term));
      if (!hasTerm) {
          return false;
      }
      
      // EXCLUSIVE GROQ CALL - FAST MODEL
      const prompt = `Does this text describe a grant, artist residency, festival submission, funding opportunity, competition, or call for proposals? Reply only YES or NO.\n\nText: ${text.substring(0, 1000)}...`;
      try {
          const { text: answer } = await groqCall(prompt, { 
              model: GROQ_MODELS.FAST, 
              temperature: 0 
          });
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
      // Deep mode scans significantly more pages to cover "www"
      const MAX_SCANS = options.mode === 'deep' ? 50 : 20; 

      onLog("🚀 Initializing Global Groq Agent...");
      onLog(`ℹ️ Mode: ${options.mode.toUpperCase()} SCAN`);
      
      // 1. Keyword Selection
      // Mixed mode ensures international keywords are picked up in deep scans
      const keywordMode = 'mixed'; 
      const batchSize = options.mode === 'deep' ? 25 : 10;
      const keywords = brain.getBatch(batchSize, keywordMode);
      
      onLog(`🎯 Targets (${keywords.length}): ${keywords.slice(0, 3).map(k => `"${k}"`).join(", ")} and ${keywords.length - 3} more...`);

      // 2. Build Candidate List
      let candidateUrls: string[] = [];

      // A. Search
      for (const keyword of keywords) {
          onLog(`\n🔎 Scanning World Wide Web for: "${keyword}"...`);
          const links = await this.searchWeb(keyword, onLog);
          if (links.length > 0) {
              const cleanLinks = links.filter(l => l.length > 25 && !l.includes('search?') && !l.includes('google'));
              candidateUrls.push(...cleanLinks);
          }
      }

      // B. Backup Sources
      onLog(`\n🛡️ Scanning Global Opportunity Databases...`);
      const backups = this.getBackupLinks(options.mode);
      candidateUrls.push(...backups);
      
      // Deduplicate
      candidateUrls = [...new Set(candidateUrls)];
      onLog(`\n📋 Queue: ${candidateUrls.length} unique URLs found.`);

      // 3. Execution Loop
      let scannedCount = 0;
      onLog(`\n🕵️ Analyzing content (Model: ${GROQ_MODELS.FAST.replace('llama-3.1-', '')} for filter, ${GROQ_MODELS.QUALITY.replace('llama-3.3-', '')} for extraction)...`);

      for (const url of candidateUrls) {
          if (foundOpportunities.length >= TARGET_COUNT) {
              onLog(`\n🎉 Target Reached!`);
              break;
          }
          if (scannedCount >= MAX_SCANS) {
              onLog(`\n🛑 Scan Limit Reached (${MAX_SCANS} pages).`);
              break;
          }

          if (processedUrls.has(url)) continue;
          processedUrls.add(url);

          // onLog(`   Reading: ${url.replace('https://', '').substring(0, 40)}...`);
          
          try {
              const pageText = await webScraperService.fetchWithJina(url);
              
              // FAST CHECK (Llama 3.1 8b)
              const isRelevant = await this.isRelevantContent(pageText);
              if (!isRelevant) {
                  continue;
              }

              // DEEP EXTRACTION (Llama 3.3 70b)
              onLog(`      ⚡ Extraction in progress: ${url.substring(0, 50)}...`);
              const opp = await this.parseOpportunityText(pageText, url);
              
              if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                  foundOpportunities.push(opp as Opportunity);
                  onLog(`      ✅ MATCH: "${opp.title}" (${opp.scope})`);
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

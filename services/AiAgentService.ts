
import { Opportunity } from "../types";
import { groqCall, safeParseJSON, GROQ_MODELS } from "./GroqClient";
import { webScraperService } from "./WebScraperService";
import { KeywordBrain } from "./KeywordBrain";
import { opportunityService } from "./OpportunityService";
import { supabase } from "./supabase";

interface ScanOptions {
  mode: 'daily' | 'deep';
  targetCount?: number;
}

// ============================================================
// AI AGENT SERVICE (GROQ + KEYWORD SEARCH)
// ============================================================
export class AiAgentService {
  
  // In-memory list of concepts the admin has explicitly rejected
  private negativeConstraints: string[] = [];

  constructor() {
    this.loadMemory();
  }

  /**
   * Initializes the agent's memory by fetching recently rejected items from the database.
   * This ensures the agent remembers what the admin dislikes even after a page refresh.
   */
  private async loadMemory() {
    try {
        const { data } = await supabase
            .from('opportunities')
            .select('title')
            .eq('status', 'rejected')
            .order('created_at', { ascending: false })
            .limit(20);

        if (data && data.length > 0) {
            this.negativeConstraints = data.map(d => `"${d.title}"`);
            console.log(`🧠 AI Memory Loaded: ${this.negativeConstraints.length} negative constraints.`);
        }
    } catch (e) {
        console.warn("Failed to load AI memory:", e);
    }
  }

  /**
   * LEARNING MECHANISM:
   * Takes a rejected opportunity and adds its core concept to the negative constraints.
   * This influences the 'isRelevantContent' filter immediately.
   */
  async learnFromRejection(opp: Partial<Opportunity>) {
      if (!opp.title) return;
      
      // 1. Persist as 'rejected' in DB so we never fetch this exact URL/Title again
      // We check existence first to prevent duplicate key errors if logic overlaps
      const exists = await opportunityService.checkExists(opp.title, opp.sourceUrl);
      if (!exists) {
          await opportunityService.createOpportunity({
              ...opp,
              status: 'rejected',
              aiReasoning: 'Rejected by Admin via Agent Scanner'
          });
      }

      // 2. Add to in-memory negative prompt for the current session
      const constraint = `"${opp.title}"`;
      if (!this.negativeConstraints.includes(constraint)) {
          this.negativeConstraints.push(constraint);
      }
      
      // Keep only last 20 rejections to maintain speed/context limits
      if (this.negativeConstraints.length > 20) {
          this.negativeConstraints.shift();
      }

      console.log(`🧠 AI Learned Negative Pattern: Avoid items like ${constraint}`);
  }

  /**
   * SPECIALIZED: Daily 6 AM Deep Scan
   * Targets international and national opportunities.
   */
  async runDailyDeepScan(onLog: (msg: string) => void): Promise<Opportunity[]> {
      // Refresh memory before a deep scan
      await this.loadMemory();
      
      return this.performAutoScan(onLog, { 
          mode: 'deep', 
          targetCount: 15 
      });
  }

  /**
   * MANUAL MODE: Takes raw pasted text and organizes it.
   */
  async parseOpportunityText(rawText: string, sourceUrl: string = ""): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) throw new Error("Content too short.");

      const textToAnalyze = rawText.substring(0, 25000); 

      const prompt = `
      You are an expert grant researcher for Indian filmmakers and artists. 
      Analyze the text below and extract opportunity details.
      
      CRITICAL: The opportunity MUST be open to Indian citizens. If it explicitly excludes India/Asia, mark type as "Rejected".

      Return a SINGLE JSON object with these keys:
      {
        "title": "Name of the grant/festival (Title Case)",
        "organizer": "Who is organizing it",
        "deadline": "YYYY-MM-DD" (guess based on context if needed),
        "grantOrPrize": "Value/Award (e.g. $5000, Residency)",
        "type": "Grant" | "Residency" | "Festival" | "Lab",
        "description": "Professional summary (max 3 sentences)",
        "eligibility": ["List", "of", "requirements"],
        "website": "URL if found, else empty string",
        "scope": "International" | "National",
        "instagramCaption": "A catchy, viral-style Instagram caption (max 280 chars) with emojis and 3-5 hashtags like #Filmmaking #ArtGrant"
      }

      RAW TEXT:
      """
      ${textToAnalyze}
      """
      `;

      try {
          const { text } = await groqCall(prompt, { 
              jsonMode: true, 
              model: GROQ_MODELS.QUALITY 
          });
          
          const data = safeParseJSON<any>(text);
          if (!data) throw new Error("Could not parse AI response.");

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
              instagramCaption: data.instagramCaption || "",
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
      
      // Inject Admin Constraints into the Prompt
      const negativeInstruction = this.negativeConstraints.length > 0 
        ? `\n\nIMPORTANT: The user has explicitly REJECTED items similar to these. Return NO if the text matches these concepts: ${this.negativeConstraints.join(", ")}.`
        : "";

      const prompt = `Does this text describe a grant, artist residency, festival submission, funding opportunity, competition, or call for proposals? Reply only YES or NO.${negativeInstruction}\n\nText: ${text.substring(0, 1000)}...`;
      
      try {
          const { text: answer } = await groqCall(prompt, { 
              model: GROQ_MODELS.FAST, 
              temperature: 0 
          });
          return answer.trim().toUpperCase().includes("YES");
      } catch {
          return true; 
      }
  }

  /**
   * AUTO-PILOT MODE
   */
  async performAutoScan(onLog: (msg: string) => void, options: ScanOptions = { mode: 'deep' }): Promise<Opportunity[]> {
      const foundOpportunities: Opportunity[] = [];
      const processedUrls = new Set<string>();
      const brain = KeywordBrain.get();
      
      const TARGET_COUNT = options.targetCount || 10;
      const MAX_SCANS = options.mode === 'deep' ? 50 : 20; 

      onLog("🚀 Initializing Global Groq Agent...");
      onLog(`ℹ️ Mode: ${options.mode.toUpperCase()} SCAN`);
      
      if (this.negativeConstraints.length > 0) {
          onLog(`🧠 Active Filters: Avoiding ${this.negativeConstraints.length} rejected patterns.`);
      }

      // 1. Keyword Selection
      const keywordMode = 'mixed'; 
      const batchSize = options.mode === 'deep' ? 25 : 10;
      const keywords = brain.getBatch(batchSize, keywordMode);
      
      onLog(`🎯 Targets (${keywords.length}): ${keywords.slice(0, 3).map(k => `"${k}"`).join(", ")}...`);

      // 2. Build Candidate List
      let candidateUrls: string[] = [];

      for (const keyword of keywords) {
          onLog(`\n🔎 Scanning: "${keyword}"...`);
          const links = await this.searchWeb(keyword, onLog);
          if (links.length > 0) {
              const cleanLinks = links.filter(l => l.length > 25 && !l.includes('search?') && !l.includes('google'));
              candidateUrls.push(...cleanLinks);
          }
      }

      const backups = this.getBackupLinks(options.mode);
      candidateUrls.push(...backups);
      candidateUrls = [...new Set(candidateUrls)];
      onLog(`\n📋 Queue: ${candidateUrls.length} unique URLs.`);

      // 3. Execution Loop
      let scannedCount = 0;
      onLog(`\n🕵️ Analyzing content...`);

      for (const url of candidateUrls) {
          if (foundOpportunities.length >= TARGET_COUNT) {
              onLog(`\n🎉 Target Reached!`);
              break;
          }
          if (scannedCount >= MAX_SCANS) {
              onLog(`\n🛑 Scan Limit Reached (${MAX_SCANS}).`);
              break;
          }

          if (processedUrls.has(url)) continue;
          processedUrls.add(url);

          const alreadyExists = await opportunityService.checkExists(null, url);
          if (alreadyExists) {
              onLog(`      Skipping (Already in DB): ${url.substring(0, 30)}...`);
              continue;
          }
          
          try {
              const pageText = await webScraperService.fetchWithJina(url);
              
              const isRelevant = await this.isRelevantContent(pageText);
              if (!isRelevant) {
                  continue;
              }

              onLog(`      ⚡ Analyzing: ${url.substring(0, 40)}...`);
              const opp = await this.parseOpportunityText(pageText, url);
              
              if (opp.title && opp.title !== "Untitled Opportunity" && opp.daysLeft! > 0) {
                  const titleExists = await opportunityService.checkExists(opp.title);
                  if (titleExists) {
                      onLog(`      ⚠️ Duplicate found via Title: "${opp.title}"`);
                  } else {
                      foundOpportunities.push(opp as Opportunity);
                      onLog(`      ✅ NEW MATCH: "${opp.title}"`);
                  }
              } 
              
              scannedCount++;
              
          } catch (e: any) {
               // Silent fail
          }
          
          await new Promise(r => setTimeout(r, 1000)); 
      }

      onLog(`\n🏁 Scan Complete. Found ${foundOpportunities.length} new opportunities.`);
      return foundOpportunities;
  }
}

export const aiAgentService = new AiAgentService();

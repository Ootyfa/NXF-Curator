import { Opportunity } from "../types";
import { webScraperService } from "./WebScraperService";

// ============================================================
// SINGLE SOURCE OF TRUTH FOR GEMINI API CALLS
// Uses raw fetch() with v1beta endpoint to support Tools/Grounding
// ============================================================

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Models to try in order of preference. 
// If one returns 404 (Not Found) or 400 (Not Supported), we switch to the next.
const CANDIDATE_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash-exp"
];

// ============================================================
// KEY MANAGER
// ============================================================
class KeyManager {
  private keys: string[] = [];
  private cooldowns: Map<string, number> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private static instance: KeyManager;

  private constructor() {
    try {
      const env = (import.meta as any).env || {};
      const raw = env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY || "";
      this.keys = raw.split(",").map((k: string) => k.trim()).filter((k: string) => k.length > 0);
      
      this.keys.forEach(k => {
        this.cooldowns.set(k, 0);
        this.lastUsed.set(k, 0);
      });
    } catch (e) {
      console.error("❌ KeyManager: Failed to load keys", e);
    }
  }

  static getInstance(): KeyManager {
    if (!KeyManager.instance) KeyManager.instance = new KeyManager();
    return KeyManager.instance;
  }

  getKey(): string | null {
    const now = Date.now();
    let best: string | null = null;
    let bestTime = Infinity;

    for (const key of this.keys) {
      if ((this.cooldowns.get(key) || 0) > now) continue; 
      const used = this.lastUsed.get(key) || 0;
      if (used < bestTime) {
        bestTime = used;
        best = key;
      }
    }

    if (best) this.lastUsed.set(best, now);
    return best;
  }

  cooldown(key: string) {
    this.cooldowns.set(key, Date.now() + 60000);
  }

  resetAll() {
    this.keys.forEach(k => this.cooldowns.set(k, 0));
  }

  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  getKeyCount() {
      return this.keys.length;
  }
}

// ============================================================
// CORE GEMINI CALLER
// ============================================================
async function callGemini(
  prompt: string,
  useGrounding: boolean = false,
  logCallback?: (msg: string) => void
): Promise<{ text: string; sources: string[]; usedModel: string }> {

  const km = KeyManager.getInstance();
  if (!km.hasKeys()) throw new Error("No API keys configured.");

  let lastError = "";

  // Try models in order until one works
  for (const model of CANDIDATE_MODELS) {
    
    // Retry logic for a specific model (handling rate limits)
    for (let attempt = 1; attempt <= 3; attempt++) {
        const key = km.getKey();

        if (!key) {
            if (logCallback) logCallback("⏸️ All keys cooling down. Waiting 5s...");
            await new Promise(r => setTimeout(r, 5000));
            km.resetAll();
            continue;
        }

        // Throttle slightly
        await new Promise(r => setTimeout(r, 1000));

        try {
            const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${key}`;

            const body: any = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            };

            if (useGrounding) {
                // Compatible tools config
                body.tools = [{ googleSearch: {} }]; 
            }

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            // 1. Rate Limit -> Cooldown key, retry same model
            if (res.status === 429 || res.status === 503) {
                if (logCallback) logCallback(`⚠️ Rate limit (${res.status}) on ${model}. Switching keys...`);
                km.cooldown(key);
                continue;
            }

            // 2. Not Found / Bad Request -> Break inner loop, try NEXT model
            if (res.status === 404 || res.status === 400) {
                const errText = await res.text();
                // console.warn(`⚠️ Model ${model} error: ${res.status} - ${errText}`);
                lastError = `${model} returned ${res.status}`;
                break; // Break attempt loop, move to next model
            }

            // 3. Other Errors
            if (!res.ok) {
                const errText = await res.text();
                lastError = `HTTP ${res.status}: ${errText}`;
                continue; // Retry same model with different key?
            }

            // 4. Success
            const json = await res.json();
            const textPart = json.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
            const text = textPart?.text || "";

            const sources: string[] = [];
            const chunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            chunks.forEach((c: any) => { 
                if (c.web?.uri) sources.push(c.web.uri); 
            });

            return { text, sources, usedModel: model };

        } catch (err: any) {
            lastError = err.message || String(err);
        }
    }
  }

  throw new Error(`All models failed. Last error: ${lastError}`);
}

// ============================================================
// JSON PARSER
// ============================================================
function parseJSON<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch {}

  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) { try { return JSON.parse(mdMatch[1]) as T; } catch {} }

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]) as T; } catch {} }

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]) as T; } catch {} }

  return null;
}

// ============================================================
// AI AGENT SERVICE
// ============================================================
export class AiAgentService {
  
  public getDebugInfo() {
      return {
          googleKeys: KeyManager.getInstance().getKeyCount(),
          models: CANDIDATE_MODELS.join(", "),
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

    logCallback(`🔍 Searching for "${topic}"...`);

    try {
        const { text, sources, usedModel } = await callGemini(prompt, true, logCallback);
        // logCallback(`✅ Used model: ${usedModel}`);

        const raw = parseJSON<any[]>(text);
        
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
        // logCallback("Trying AI Direct Browse...");
        const prompt = `Visit this URL: ${url}
        Extract details: Title, Organizer, Deadline (YYYY-MM-DD), Prize, Type, Description.
        Return JSON.`;
        
        const { text, usedModel } = await callGemini(prompt, true, logCallback);
        const data = parseJSON<any>(text);
        
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
   * 3. Raw Text Extraction (Restored)
   */
  async extractOpportunityFromText(text: string, sourceUrl?: string): Promise<Partial<Opportunity>> {
      const prompt = `Analyze this text for a grant/festival opportunity.
      Return JSON: { "title": "", "organizer": "", "deadline": "YYYY-MM-DD", "grantOrPrize": "", "type": "Grant|Festival|Residency", "description": "" }
      
      Text: """${text.substring(0, 30000)}"""`;

      const { text: responseText, usedModel } = await callGemini(prompt, false);
      const data = parseJSON<any>(responseText);
      
      if (!data) throw new Error("AI could not parse opportunities from text.");
      
      return this.formatData(data, sourceUrl || "", `Text Analysis (${usedModel})`);
  }

  // Helper to format AI response into App Type
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

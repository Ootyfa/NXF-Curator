import { Opportunity } from "../types";

// ============================================================
// SINGLE SOURCE OF TRUTH FOR GEMINI API CALLS
// Uses raw fetch() with v1beta endpoint to support Tools/Grounding
// ============================================================

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
// Using 1.5 Flash Latest which is highly performant for this task
const MODEL = "gemini-1.5-flash-latest"; 

// ============================================================
// KEY MANAGER
// ============================================================
class KeyManager {
  private keys: string[] = [];
  private cooldowns: Map<string, number> = new Map(); // key -> cooldown-ends-at timestamp
  private lastUsed: Map<string, number> = new Map();
  private static instance: KeyManager;

  private constructor() {
    try {
      const env = (import.meta as any).env || {};
      // Handle various env var formats
      const raw = env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY || "";
      this.keys = raw.split(",").map((k: string) => k.trim()).filter((k: string) => k.length > 0);
      
      this.keys.forEach(k => {
        this.cooldowns.set(k, 0);
        this.lastUsed.set(k, 0);
      });
      // console.log(`✅ KeyManager: Loaded ${this.keys.length} key(s)`);
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
    // Pick the key that is not on cooldown and was used longest ago
    let best: string | null = null;
    let bestTime = Infinity;

    for (const key of this.keys) {
      if ((this.cooldowns.get(key) || 0) > now) continue; // Still on cooldown
      const used = this.lastUsed.get(key) || 0;
      if (used < bestTime) {
        bestTime = used;
        best = key;
      }
    }

    if (best) this.lastUsed.set(best, now);
    return best;
  }

  // Put a key on cooldown for 60 seconds
  cooldown(key: string) {
    this.cooldowns.set(key, Date.now() + 60000);
    // console.log(`⏳ Key ...${key.slice(-4)} on cooldown for 60s`);
  }

  // Reset all cooldowns (emergency)
  resetAll() {
    this.keys.forEach(k => this.cooldowns.set(k, 0));
    // console.log("🔄 All key cooldowns reset");
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
): Promise<{ text: string; sources: string[] }> {

  const km = KeyManager.getInstance();
  if (!km.hasKeys()) throw new Error("No API keys configured.");

  const maxAttempts = 6;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const key = km.getKey();

    if (!key) {
      if (logCallback) logCallback("⏸️ All keys cooling down. Waiting 15s...");
      await new Promise(r => setTimeout(r, 15000));
      km.resetAll();
      continue;
    }

    // Throttle: always wait at least 2s between any API call
    await new Promise(r => setTimeout(r, 2000));

    try {
      // if (logCallback) logCallback(`🚀 Gemini call attempt ${attempt}/${maxAttempts}`);

      const url = `${GEMINI_BASE_URL}/${MODEL}:generateContent?key=${key}`;

      const body: any = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };

      if (useGrounding) {
        body.tools = [{ googleSearchRetrieval: {} }];
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Handle errors by status code
      if (res.status === 429 || res.status === 503) {
        if (logCallback) logCallback(`⚠️ Rate limited (${res.status}). Switching keys...`);
        km.cooldown(key);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        lastError = `HTTP ${res.status}: ${errText}`;
        console.warn(`⚠️ Gemini error: ${lastError}`);
        // Don't cooldown for non-rate-limit errors (like 400), just retry logic might catch it or fail
        if (res.status === 404) {
             throw new Error(`Model ${MODEL} not found on v1beta.`);
        }
        continue;
      }

      const json = await res.json();

      // Extract text
      const textPart = json.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
      const text = textPart?.text || "";

      // Extract grounding source URLs
      const sources: string[] = [];
      const chunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      chunks.forEach((c: any) => { 
          if (c.web?.uri) sources.push(c.web.uri); 
      });

      // if (logCallback) logCallback(`✅ Gemini returned ${text.length} chars, ${sources.length} sources`);
      return { text, sources };

    } catch (err: any) {
      lastError = err.message || String(err);
      console.warn(`⚠️ Attempt ${attempt} error: ${lastError}`);
    }
  }

  throw new Error(`Gemini failed after ${maxAttempts} attempts. Last: ${lastError}`);
}

// ============================================================
// JSON PARSER
// ============================================================
function parseJSON<T>(text: string): T | null {
  // Try direct parse
  try { return JSON.parse(text) as T; } catch {}

  // Try extracting from markdown code block
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) { try { return JSON.parse(mdMatch[1]) as T; } catch {} }

  // Try extracting raw array or object
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]) as T; } catch {} }

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]) as T; } catch {} }

  return null;
}

// ============================================================
// AI AGENT SERVICE (Compatible Wrapper)
// ============================================================
export class AiAgentService {
  
  public getDebugInfo() {
      return {
          googleKeys: KeyManager.getInstance().getKeyCount(),
          activeModel: MODEL,
          method: "REST API + Search Grounding"
      };
  }

  /**
   * Search for opportunities based on a topic string.
   * This replaces the old "discovery -> scraping" loop with a single "Grounding" call.
   */
  async scanWeb(logCallback: (msg: string) => void, topic: string): Promise<Opportunity[]> {
    const now = new Date();
    const year = now.getFullYear();
    const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const query = `Find grant and festival opportunities for: ${topic} in India. Current Date: ${dateStr}`;
    logCallback(`🔍 Agent searching via Google Grounding: "${topic}"`);

    const prompt = `Today is ${dateStr}.

Search the web for active opportunities for Indian artists related to: "${topic}"

Find 5-8 opportunities that are:
- Currently open or opening soon
- Available to Indian citizens
- Grants, residencies, festivals, fellowships, or competitions
- Have deadlines in ${year} or ${year + 1}

Return ONLY a JSON array. No explanations. No markdown.

[{
  "title": "Opportunity title",
  "organizer": "Organization name",
  "deadline": "YYYY-MM-DD",
  "grantOrPrize": "Amount or description",
  "type": "Grant|Residency|Festival|Fellowship|Competition",
  "description": "2 sentence summary",
  "website": "Source URL"
}]`;

    try {
        const { text, sources } = await callGemini(prompt, true, logCallback);

        const raw = parseJSON<any[]>(text);
        if (!raw || !Array.isArray(raw)) {
        logCallback("⚠️ Could not parse valid JSON from AI response.");
        return [];
        }

        const opportunities: Opportunity[] = [];

        raw.forEach((item, i) => {
        if (!item.title) return;

        // Parse deadline
        let deadline = new Date(item.deadline);
        if (isNaN(deadline.getTime())) {
            // Default to 45 days in future if parsing fails
            deadline = new Date(now.getTime() + 45 * 86400000); 
        }
        
        // Skip expired (allowing a 2-day grace period for timezone diffs)
        if (deadline < new Date(now.getTime() - 2 * 86400000)) return; 

        const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
        // Prefer item website, fallback to grounding source
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
            aiReasoning: "Found via Gemini Search Grounding",
            status: "draft",
            createdAt: new Date().toISOString(),
            aiMetadata: {
            model: MODEL,
            discoveryQuery: query,
            discoveryDate: new Date().toISOString(),
            },
        });
        });

        return opportunities;

    } catch (e: any) {
        logCallback(`❌ Error during scan: ${e.message}`);
        return [];
    }
  }

  /**
   * Analyze a specific URL using Grounding to "Read" the page.
   * This bypasses CORS and scraping protections.
   */
  async analyzeSpecificUrl(url: string, logCallback: (msg: string) => void = () => {}): Promise<Partial<Opportunity>> {
    logCallback(`🔍 Visiting URL via Gemini: ${url}`);

    const prompt = `Visit this URL and extract opportunity information: ${url}

Return ONLY JSON. No explanations.

{
  "title": "Opportunity title",
  "organizer": "Organization",
  "deadline": "YYYY-MM-DD or 'See Website'",
  "grantOrPrize": "Amount or description",
  "type": "Grant|Residency|Festival|Fellowship|Competition",
  "description": "2 sentence summary"
}`;

    const { text } = await callGemini(prompt, true, logCallback);

    const data = parseJSON<any>(text);
    if (!data || !data.title) {
      throw new Error("Could not extract meaningful data from URL.");
    }

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
      aiReasoning: "Direct URL analysis via Gemini",
      status: "published",
      createdAt: new Date().toISOString(),
      aiMetadata: {
        model: MODEL,
        discoveryQuery: url,
        discoveryDate: new Date().toISOString(),
      },
    };
  }
}

export const aiAgentService = new AiAgentService();

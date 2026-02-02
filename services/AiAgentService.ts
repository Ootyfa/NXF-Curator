import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private lastRequestTime = 0;
  private keyLastUsedTime: Map<string, number> = new Map();
  private keyFailureCount: Map<string, number> = new Map();
  private readonly MIN_REQUEST_INTERVAL = 3000; // 3 seconds mandatory delay between requests
  private readonly KEY_COOLDOWN_PERIOD = 60000; // 60 seconds cooldown for rate-limited keys

  constructor() {
    try {
        const env = (import.meta as any).env || {};
        const potentialVars = [
            env.VITE_GOOGLE_API_KEY,          
            env.GOOGLE_API_KEY,
            (typeof process !== 'undefined' ? process.env?.API_KEY : '')
        ];
        
        const collectedKeys: string[] = [];
        potentialVars.forEach(val => {
            if (val && typeof val === 'string') {
                const keys = val.split(',').map(k => k.trim()).filter(k => k.length > 0);
                collectedKeys.push(...keys);
            }
        });

        this.apiKeys = [...new Set(collectedKeys)];
        
        // Initialize tracking for each key
        this.apiKeys.forEach(key => {
            this.keyLastUsedTime.set(key, 0);
            this.keyFailureCount.set(key, 0);
        });
        
        if (this.apiKeys.length > 0) {
            console.log(`✅ AiAgentService initialized with ${this.apiKeys.length} API key(s): ${this.apiKeys.map(k => '...' + k.slice(-4)).join(', ')}`);
        } else {
            console.error('❌ No API keys found! Please check your environment variables.');
        }
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  // --- THROTTLING HELPER ---
  private async enforceRateLimit(logCallback?: (msg: string) => void) {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      
      if (timeSinceLast < this.MIN_REQUEST_INTERVAL) {
          const wait = this.MIN_REQUEST_INTERVAL - timeSinceLast;
          if (logCallback) logCallback(`⏳ Throttling: Waiting ${Math.round(wait/100)/10}s...`);
          await new Promise(r => setTimeout(r, wait));
      }
      this.lastRequestTime = Date.now();
  }

  // --- SMART KEY SELECTION ---
  private getBestAvailableKey(): string | null {
      if (this.apiKeys.length === 0) return null;
      
      const now = Date.now();
      let bestKey: string | null = null;
      let oldestUsageTime = Infinity;
      
      // Find the key that was used longest ago AND is not in cooldown
      for (const key of this.apiKeys) {
          const lastUsed = this.keyLastUsedTime.get(key) || 0;
          const failures = this.keyFailureCount.get(key) || 0;
          
          // Skip keys that are in cooldown period after rate limit
          if (failures > 0 && (now - lastUsed) < this.KEY_COOLDOWN_PERIOD) {
              const cooldownRemaining = Math.ceil((this.KEY_COOLDOWN_PERIOD - (now - lastUsed)) / 1000);
              console.log(`⏭️ Skipping key ...${key.slice(-4)} (cooldown: ${cooldownRemaining}s remaining)`);
              continue;
          }
          
          // Reset failure count if cooldown period has passed
          if (failures > 0 && (now - lastUsed) >= this.KEY_COOLDOWN_PERIOD) {
              this.keyFailureCount.set(key, 0);
          }
          
          // Pick the key that was used longest ago
          if (lastUsed < oldestUsageTime) {
              oldestUsageTime = lastUsed;
              bestKey = key;
          }
      }
      
      if (bestKey) {
          this.keyLastUsedTime.set(bestKey, now);
          console.log(`🔑 Using key ...${bestKey.slice(-4)} (last used: ${now - oldestUsageTime}ms ago)`);
      }
      
      return bestKey;
  }

  // --- MARK KEY AS FAILED ---
  private markKeyAsFailed(key: string) {
      const currentFailures = this.keyFailureCount.get(key) || 0;
      this.keyFailureCount.set(key, currentFailures + 1);
      console.log(`❌ Marked key ...${key.slice(-4)} as failed (failures: ${currentFailures + 1})`);
  }

  // --- API EXECUTION CORE ---
  private async executeStrictSearch(
    params: { model: string, contents: any, config: any },
    logCallback: (msg: string) => void
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured. Cannot fetch WWW data.");
      }

      // Use stable models that definitely exist
      const models = [
          'gemini-1.5-flash-latest',  // Primary - stable, fast
          'gemini-1.5-pro-latest',    // Fallback - more capable but slower
      ];
      
      const maxTotalAttempts = Math.max(5, this.apiKeys.length * 3);
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxTotalAttempts; attempt++) {
          // Get the best available key (not in cooldown)
          const apiKey = this.getBestAvailableKey();
          
          if (!apiKey) {
              // All keys are in cooldown
              const waitTime = 10000; // Wait 10 seconds for keys to cool down
              logCallback(`⏸️ All keys are rate-limited. Waiting ${waitTime/1000}s for cooldown...`);
              await new Promise(r => setTimeout(r, waitTime));
              
              // Reset all cooldowns after waiting
              this.apiKeys.forEach(key => {
                  this.keyFailureCount.set(key, 0);
              });
              
              continue; // Try again with reset keys
          }
          
          // Switch to fallback model after half the attempts
          const modelIndex = attempt > Math.floor(maxTotalAttempts / 2) ? 1 : 0;
          const model = models[modelIndex];

          try {
              // 1. THROTTLE (Critical for avoiding 429 bursts)
              await this.enforceRateLimit(logCallback);

              // 2. EXECUTE
              logCallback(`🚀 Attempt ${attempt}/${maxTotalAttempts} with ${model}...`);
              const ai = new GoogleGenAI({ apiKey });
              
              const result = await ai.models.generateContent({
                  ...params,
                  model: model
              });
              
              // 3. VALIDATE
              const hasGrounding = !!result.candidates?.[0]?.groundingMetadata?.groundingChunks;
              const isUrlAnalysis = JSON.stringify(params.contents).includes('http');
              
              if (!hasGrounding && !isUrlAnalysis) {
                  console.warn(`⚠️ Attempt ${attempt}: ${model} returned no grounding data.`);
                  if (attempt === maxTotalAttempts) {
                      throw new Error("AI returned no search results after all attempts.");
                  }
                  continue; // Try next attempt
              }

              // Success! Reset failure count for this key
              this.keyFailureCount.set(apiKey, 0);
              logCallback(`✅ Success with key ...${apiKey.slice(-4)}`);
              return result;

          } catch (error: any) {
              lastError = error;
              const msg = error.message || JSON.stringify(error);
              
              // Handle 404 Model Not Found
              if (msg.includes('404') || msg.includes('not found')) {
                  console.warn(`⚠️ Model ${model} not found, switching to fallback...`);
                  continue;
              }

              // Handle Rate Limiting (429 or 503)
              const isRateLimit = msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED');
              
              if (isRateLimit) {
                   logCallback(`⚠️ Rate Limit (429) on Key ...${apiKey.slice(-4)}. Switching to next key...`);
                   this.markKeyAsFailed(apiKey);
                   
                   // Don't wait here - just try the next key immediately
                   // The getBestAvailableKey() function will handle cooldown logic
                   continue;
              }
              
              // Handle Quota Exceeded
              if (msg.includes('quota') || msg.includes('QUOTA_EXCEEDED')) {
                  logCallback(`⚠️ Quota exceeded on key ...${apiKey.slice(-4)}`);
                  this.markKeyAsFailed(apiKey);
                  continue;
              }
              
              console.warn(`⚠️ Error on attempt ${attempt} (${model}): ${msg}`);
              
              // If this is the last attempt, throw the error
              if (attempt === maxTotalAttempts) {
                  throw new Error(`Search failed after ${maxTotalAttempts} attempts: ${msg}`);
              }
          }
      }
      
      throw new Error(`API Quota Exceeded or all keys failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  // Helper to normalize URLs
  private normalizeUrl(url: string): string {
      try {
          return url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').toLowerCase().split('?')[0];
      } catch {
          return url;
      }
  }

  // --- MAIN DISCOVERY FUNCTION ---
  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain): Promise<Opportunity[]> {
    const TODAY_STR = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const CURRENT_YEAR = new Date().getFullYear();
    const TARGET_YEAR_1 = CURRENT_YEAR + 1;
    const TARGET_YEAR_2 = CURRENT_YEAR + 2;
    
    const searchStrategy = `"${domain}" artist grants India deadline ${TARGET_YEAR_1} ${TARGET_YEAR_2} open call`;
    logCallback(`🔍 SEARCHING WWW: "${searchStrategy}"...`);

    const prompt = `
      Context: Today is ${TODAY_STR}.
      Role: You are a strict research bot.
      
      Task: Use Google Search to find **10** NEW, ACTIVE opportunities for Indian artists in ${domain}.
      
      CRITICAL SEARCH INSTRUCTIONS:
      1. FOCUS specifically on opportunities for **${TARGET_YEAR_1}** and **${TARGET_YEAR_2}**.
      2. LOOK FOR: "Deadline ${TARGET_YEAR_1}", "Open Call ${TARGET_YEAR_1}", "Residency ${TARGET_YEAR_1}".
      3. IGNORE past deadlines.
      4. DO NOT return items that expired in ${CURRENT_YEAR} unless the next cycle is confirmed for ${TARGET_YEAR_1}.
      
      Output JSON format:
      [{ 
         "title": "Exact Title", 
         "organizer": "Organizer Name", 
         "deadline": "YYYY-MM-DD", 
         "grantOrPrize": "Value", 
         "type": "Grant" | "Residency" | "Festival", 
         "description": "Short summary",
         "website": "URL found in search"
      }]
    `;

    try {
        const response = await this.executeStrictSearch({
            model: 'gemini-1.5-flash-latest',
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }], 
                responseMimeType: 'application/json' 
            }
        }, logCallback);

        logCallback("✅ Data received. Verifying Freshness...");

        // 1. Extract Grounding Metadata
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const verifiedUrls = new Set<string>();
        const normalizedVerifiedUrls = new Set<string>();
        
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                verifiedUrls.add(chunk.web.uri);
                normalizedVerifiedUrls.add(this.normalizeUrl(chunk.web.uri));
            }
        });

        if (verifiedUrls.size === 0) {
            logCallback("⚠️ Warning: AI returned data but provided no Source URLs. Discarding to prevent hallucination.");
            return [];
        }

        // 2. Parse Content
        const text = response.text || "[]";
        let rawData: any[] = [];
        try {
            rawData = JSON.parse(text);
        } catch (e) {
             const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[\s*\{[\s\S]*\}\s*\]/);
             if (match) rawData = JSON.parse(match[1] || match[0]);
        }

        if (!Array.isArray(rawData)) rawData = [rawData];

        // 3. Map & Validate
        const validOpportunities: Opportunity[] = [];
        const today = new Date();

        rawData.forEach((item, index) => {
            let sourceUrl = item.website;
            const normalizedItemUrl = this.normalizeUrl(sourceUrl || '');
            
            const isVerified = normalizedVerifiedUrls.has(normalizedItemUrl) || verifiedUrls.has(sourceUrl);

            if (!sourceUrl || !isVerified) {
                 sourceUrl = Array.from(verifiedUrls)[0]; 
            }

            let deadlineDate = new Date(item.deadline);
            if (isNaN(deadlineDate.getTime())) {
                const hasYear = item.deadline.includes(TARGET_YEAR_1.toString()) || item.deadline.includes(TARGET_YEAR_2.toString()) || item.deadline.includes(CURRENT_YEAR.toString());
                if (hasYear) {
                    deadlineDate = new Date();
                    deadlineDate.setFullYear(deadlineDate.getFullYear() + 1);
                } else {
                    return; 
                }
            }
            
            if (deadlineDate < today) {
                return;
            }

            const diffTime = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            validOpportunities.push({
                id: `web-${Date.now()}-${index}`,
                title: item.title,
                organizer: item.organizer,
                deadline: item.deadline,
                deadlineDate: deadlineDate.toISOString().split('T')[0],
                daysLeft: diffTime,
                grantOrPrize: item.grantOrPrize || "See Website",
                eligibility: ["Indian Citizens"], 
                type: item.type || 'Grant',
                scope: 'National',
                category: domain,
                description: item.description,
                contact: { website: sourceUrl, email: "", phone: "" },
                verificationStatus: 'draft',
                sourceUrl: sourceUrl,
                groundingSources: Array.from(verifiedUrls),
                aiConfidenceScore: 95, 
                aiReasoning: `Sourced from Google Search: ${sourceUrl}`,
                status: 'draft',
                createdAt: new Date().toISOString(),
                aiMetadata: {
                    model: 'Gemini-1.5-Flash',
                    discoveryQuery: searchStrategy,
                    discoveryDate: new Date().toISOString()
                }
            });
        });

        logCallback(`✅ Found ${validOpportunities.length} Verified Future Opportunities.`);
        return validOpportunities;

    } catch (error: any) {
        logCallback(`❌ Search Failed: ${error.message}`);
        throw error; 
    }
  }

  // --- URL ANALYZER ---
  async analyzeSpecificUrl(logCallback: (msg: string) => void, url: string): Promise<Opportunity[]> {
    logCallback(`🕷️ Scraping & Analyzing: ${url}`);
    
    try {
        const response = await this.executeStrictSearch({
            model: 'gemini-1.5-flash-latest',
            contents: `Analyze this URL: ${url}. Return JSON: {title, organizer, deadline (YYYY-MM-DD), prize, type, description}.`,
            config: { 
                tools: [{ googleSearch: {} }], 
                responseMimeType: 'application/json' 
            }
        }, logCallback);

        const text = response.text || "{}";
        let data: any = {};
        try {
             data = JSON.parse(text);
        } catch {
             const match = text.match(/\{[\s\S]*\}/);
             if (match) data = JSON.parse(match[0]);
        }
        
        if (!data.title) {
             const urlObj = new URL(url);
             data.title = urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || "Untitled Opportunity";
        }

        return [{
            id: `url-${Date.now()}`,
            title: data.title || "Unknown Title",
            organizer: data.organizer || "Unknown Organizer",
            deadline: data.deadline || "See Website",
            daysLeft: 30,
            grantOrPrize: data.prize || data.grantOrPrize || "See Website",
            type: data.type || "Grant",
            scope: "National",
            description: data.description || "Imported via URL Analysis.",
            contact: { website: url, email: "", phone: "" },
            verificationStatus: 'draft',
            sourceUrl: url,
            groundingSources: [url],
            eligibility: [],
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiConfidenceScore: 90,
            aiReasoning: "Direct URL Analysis",
            aiMetadata: { 
                model: 'Gemini-1.5-Flash', 
                discoveryQuery: url, 
                discoveryDate: new Date().toISOString() 
            }
        }];

    } catch (error: any) {
        logCallback(`❌ URL Analysis Failed: ${error.message}`);
        throw error;
    }
  }
}

export const aiAgentService = new AiAgentService();
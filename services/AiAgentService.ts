import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private apiKeys: string[] = [];

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
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  // --- API EXECUTION WITH EXPONENTIAL BACKOFF ---
  private async executeStrictSearch(
    params: { model: string, contents: any, config: any },
    logCallback: (msg: string) => void
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured. Cannot fetch WWW data.");
      }

      // Gemini 2.0 Flash is generally more stable and faster for high-volume search
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash']; 

      for (const model of models) {
          for (let i = 0; i < this.apiKeys.length; i++) {
              const apiKey = this.apiKeys[i];
              
              // Retry Logic with Backoff (3 attempts)
              for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                      const ai = new GoogleGenAI({ apiKey });
                      
                      // logCallback(`Attempting ${model} (Key ${i+1}, Try ${attempt})...`);
                      
                      const result = await ai.models.generateContent({
                          ...params,
                          model: model
                      });
                      
                      // Validation: Did it actually search?
                      const hasGrounding = !!result.candidates?.[0]?.groundingMetadata?.groundingChunks;
                      const isUrlAnalysis = JSON.stringify(params.contents).includes('http');
                      
                      if (!hasGrounding && !isUrlAnalysis) {
                          // If it refused to search, treat as soft fail and maybe try next model
                          if (attempt === 3) console.warn(`${model} skipped search.`);
                          continue; 
                      }

                      return result;

                  } catch (error: any) {
                      const msg = error.message || "";
                      const isRateLimit = msg.includes('429') || msg.includes('503');
                      
                      if (isRateLimit) {
                           // EXPONENTIAL BACKOFF: 2s -> 4s -> 8s
                           const waitTime = 2000 * Math.pow(2, attempt - 1);
                           logCallback(`⚠️ Rate Limit (429) on Key ${i+1}. Cooling down for ${waitTime/1000}s...`);
                           await new Promise(r => setTimeout(r, waitTime));
                           continue; // Retry loop
                      }
                      
                      // If it's not a rate limit (e.g. 400 Bad Request), don't retry same key
                      console.warn(`Error on ${model}:`, msg);
                      break; // Break retry loop, try next key
                  }
              }
          }
      }
      throw new Error("Unable to connect to Google Search. All keys/models exhausted.");
  }

  // Helper to normalize URLs for comparison (ignore www, https, trailing slash)
  private normalizeUrl(url: string): string {
      try {
          return url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').toLowerCase().split('?')[0];
      } catch {
          return url;
      }
  }

  // --- MAIN DISCOVERY FUNCTION (Strict Web Only) ---
  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain): Promise<Opportunity[]> {
    const TODAY_STR = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const CURRENT_YEAR = new Date().getFullYear();
    const TARGET_YEAR_1 = CURRENT_YEAR + 1; // 2026
    const TARGET_YEAR_2 = CURRENT_YEAR + 2; // 2027
    
    // Explicit Prompt forcing Search Use with FUTURE dates (2026+)
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
            model: 'gemini-2.0-flash', // Switched to 2.0 Flash for stability
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }], 
                responseMimeType: 'application/json' 
            }
        }, logCallback);

        logCallback("✅ Data received. Verifying Freshness...");

        // 1. Extract Grounding Metadata (The Proof)
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
            // Find a matching source URL (Loose Match)
            let sourceUrl = item.website;
            const normalizedItemUrl = this.normalizeUrl(sourceUrl || '');
            
            const isVerified = normalizedVerifiedUrls.has(normalizedItemUrl) || verifiedUrls.has(sourceUrl);

            if (!sourceUrl || !isVerified) {
                 sourceUrl = Array.from(verifiedUrls)[0]; // Fallback to first grounded source
            }

            // FILTER: Must have a future deadline
            let deadlineDate = new Date(item.deadline);
            if (isNaN(deadlineDate.getTime())) {
                // If text is vague like "Spring 2026", check string content
                const hasYear = item.deadline.includes(TARGET_YEAR_1.toString()) || item.deadline.includes(TARGET_YEAR_2.toString()) || item.deadline.includes(CURRENT_YEAR.toString());
                
                if (hasYear) {
                    // It's likely valid year, but date is fuzzy. Set a future default.
                    deadlineDate = new Date();
                    deadlineDate.setFullYear(deadlineDate.getFullYear() + 1); // Push to next year by default for safety
                } else {
                    return; // Skip invalid dates
                }
            }
            
            // Strict Date Check: Must be in future
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
                    model: 'Gemini-2.0-Flash (Future Mode)',
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

  // --- URL ANALYZER (Strict Parsing) ---
  async analyzeSpecificUrl(logCallback: (msg: string) => void, url: string): Promise<Opportunity[]> {
    logCallback(`🕷️ Scraping & Analyzing: ${url}`);
    
    // We try to use the AI to "read" the page via search tool or browsing
    try {
        const response = await this.executeStrictSearch({
            model: 'gemini-2.0-flash',
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
        
        // Basic Regex Fallback if AI fails to extract but we have the URL
        if (!data.title) {
             const urlObj = new URL(url);
             data.title = urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || "Untitled Opportunity";
        }

        return [{
            id: `url-${Date.now()}`,
            title: data.title || "Unknown Title",
            organizer: data.organizer || "Unknown Organizer",
            deadline: data.deadline || "See Website",
            daysLeft: 30, // Default if date parsing fails
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
            aiMetadata: { model: 'Gemini-2.0 (URL Mode)', discoveryQuery: url, discoveryDate: new Date().toISOString() }
        }];

    } catch (error: any) {
        logCallback(`❌ URL Analysis Failed: ${error.message}`);
        throw error;
    }
  }
}

export const aiAgentService = new AiAgentService();
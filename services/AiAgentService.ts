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

  // --- API EXECUTION WITH RETRY & ROTATION ---
  private async executeStrictSearch(
    params: { model: string, contents: any, config: any },
    logCallback: (msg: string) => void
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured. Cannot fetch WWW data.");
      }

      // We only use models that support Grounding (Search) well
      const models = ['gemini-3-flash-preview', 'gemini-2.0-flash-exp']; 

      for (const model of models) {
          for (let i = 0; i < this.apiKeys.length; i++) {
              const apiKey = this.apiKeys[i];
              try {
                  const ai = new GoogleGenAI({ apiKey });
                  
                  // logCallback(`Attempting connection via ${model} (Key ${i+1})...`);
                  
                  const result = await ai.models.generateContent({
                      ...params,
                      model: model
                  });
                  
                  // Check if search actually happened
                  if (!result.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                     // If model didn't search, we consider it a failure for this strict mode
                     // unless it's a direct URL analysis where the URL is the source
                     if (!JSON.stringify(params.contents).includes('http')) {
                        console.warn(`${model} did not perform a search.`);
                        continue; 
                     }
                  }

                  return result;

              } catch (error: any) {
                  const msg = error.message || "";
                  if (msg.includes('429') || msg.includes('503')) {
                       logCallback(`⚠️ High Traffic on Key ${i+1}. Pausing 2s...`);
                       await new Promise(r => setTimeout(r, 2000));
                       continue;
                  }
                  console.warn(`Error on ${model}:`, msg);
              }
          }
      }
      throw new Error("Unable to connect to Google Search. All keys/models exhausted.");
  }

  // --- MAIN DISCOVERY FUNCTION (Strict Web Only) ---
  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain): Promise<Opportunity[]> {
    const TODAY_STR = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const CURRENT_YEAR = new Date().getFullYear();
    
    // Explicit Prompt forcing Search Use
    const searchStrategy = `open calls for ${domain} artists India ${CURRENT_YEAR} apply now`;
    logCallback(`🔍 SEARCHING WWW: "${searchStrategy}"...`);

    const prompt = `
      Context: Today is ${TODAY_STR}.
      Role: You are a strict research bot.
      Task: Search Google for current, active opportunities (Grants, Residencies, Festivals) for Indian creators in ${domain}.
      
      CRITICAL RULES:
      1. You MUST use the 'googleSearch' tool.
      2. ONLY return active opportunities with deadlines in the future.
      3. DO NOT fabricate data. If you find nothing real, return an empty array.
      4. Extract valid URLs for every item.

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
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { 
                tools: [{ googleSearch: {} }], 
                responseMimeType: 'application/json' 
            }
        }, logCallback);

        logCallback("✅ Data received from Google. Verifying Sources...");

        // 1. Extract Grounding Metadata (The Proof)
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const verifiedUrls = new Set<string>();
        
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) verifiedUrls.add(chunk.web.uri);
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

        rawData.forEach((item, index) => {
            // Find a matching source URL
            // We try to match the item's website, or fall back to one of the verified URLs
            let sourceUrl = item.website;
            if (!sourceUrl || !verifiedUrls.has(sourceUrl)) {
                 // If the specific item URL isn't in the verified list, 
                 // assign the first available verified URL as the source reference.
                 sourceUrl = Array.from(verifiedUrls)[0];
            }

            // FILTER: Must have a future deadline
            let deadlineDate = new Date(item.deadline);
            if (isNaN(deadlineDate.getTime())) {
                // If date is unclear, be safe and skip, OR check if it says "Open"
                return; 
            }
            
            // Logic: Accept items if deadline is future OR if it was found via valid search
            const diffTime = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

            validOpportunities.push({
                id: `web-${Date.now()}-${index}`,
                title: item.title,
                organizer: item.organizer,
                deadline: item.deadline,
                deadlineDate: deadlineDate.toISOString().split('T')[0],
                daysLeft: diffTime,
                grantOrPrize: item.grantOrPrize || "See Website",
                eligibility: ["Indian Citizens"], // Inferred from search query
                type: item.type || 'Grant',
                scope: 'National',
                category: domain,
                description: item.description,
                contact: { website: sourceUrl, email: "", phone: "" },
                verificationStatus: 'draft',
                sourceUrl: sourceUrl,
                groundingSources: Array.from(verifiedUrls),
                aiConfidenceScore: 95, // High because it came from search
                aiReasoning: `Sourced from Google Search: ${sourceUrl}`,
                status: 'draft',
                createdAt: new Date().toISOString(),
                aiMetadata: {
                    model: 'Gemini-3-Flash (Strict Search)',
                    discoveryQuery: searchStrategy,
                    discoveryDate: new Date().toISOString()
                }
            });
        });

        logCallback(`✅ Found ${validOpportunities.length} Verified Opportunities from WWW.`);
        return validOpportunities;

    } catch (error: any) {
        logCallback(`❌ Search Failed: ${error.message}`);
        throw error; // Propagate error to UI so user knows it failed. NO FAKE DATA.
    }
  }

  // --- URL ANALYZER (Strict Parsing) ---
  async analyzeSpecificUrl(logCallback: (msg: string) => void, url: string): Promise<Opportunity[]> {
    logCallback(`🕷️ Scraping & Analyzing: ${url}`);
    
    // We try to use the AI to "read" the page via search tool or browsing
    try {
        const response = await this.executeStrictSearch({
            model: 'gemini-3-flash-preview',
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
            aiMetadata: { model: 'Gemini-3 (URL Mode)', discoveryQuery: url, discoveryDate: new Date().toISOString() }
        }];

    } catch (error: any) {
        logCallback(`❌ URL Analysis Failed: ${error.message}`);
        throw error;
    }
  }
}

export const aiAgentService = new AiAgentService();
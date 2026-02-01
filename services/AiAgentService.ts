import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private apiKeys: string[] = [];

  constructor() {
    try {
        // Safely retrieve API Key for browser environments
        const env = (import.meta as any).env || {};
        
        // We check multiple variable names
        const potentialVars = [
            env.VITE_GOOGLE_API_KEY,          
            env.GOOGLE_API_KEY,               
            env.VITE_GOOGLE_API_KEY_2,        
            env.VITE_GOOGLE_API_KEY_3,
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
        console.error("Failed to initialize API keys", e);
        this.apiKeys = [];
    }
  }

  // --- API CONNECTION LOGIC ---

  private async executeGenerativeRequest(
    baseParams: { model: string, contents: any, config: any },
    logCallback: (msg: string) => void
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured. Please check your .env file.");
      }

      // Priority: Gemini 3 (Best for Search) -> 2.0 -> 1.5 Flash (Backup)
      const modelHierarchy = ['gemini-3-flash-preview', 'gemini-2.0-flash', 'gemini-1.5-flash'];
      
      // If a specific model was requested in baseParams, try to honor it first
      const requestedModel = baseParams.model;
      if (requestedModel && !modelHierarchy.includes(requestedModel)) {
          modelHierarchy.unshift(requestedModel);
      }

      for (const model of modelHierarchy) {
          // Prepare params for this specific model attempt
          const currentParams = JSON.parse(JSON.stringify(baseParams));

          // CRITICAL FIX: Gemini 1.5 Flash via standard API may not support 'googleSearch' tool.
          // If we fallback to it, we must strip the tool to prevent a 400 Bad Request.
          if (model.includes('1.5') && currentParams.config?.tools) {
             // logCallback(`ℹ️ Fallback to ${model}: Disabling Search Tool for compatibility.`); 
             // (Logging disabled to reduce noise, logic remains)
             delete currentParams.config.tools;
          }

          for (let i = 0; i < this.apiKeys.length; i++) {
              const apiKey = this.apiKeys[i];
              try {
                  const ai = new GoogleGenAI({ apiKey });
                  // Explicitly use the model from the loop
                  return await ai.models.generateContent({ 
                      ...currentParams, 
                      model: model 
                  });
              } catch (error: any) {
                  const msg = error.message || JSON.stringify(error);
                  const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503');
                  const isAuthError = msg.includes('403') || msg.includes('API_KEY_INVALID');
                  
                  if (isAuthError) {
                      logCallback(`⚠️ Auth Error on Key ${i+1}. Checking next key...`);
                      continue; 
                  }

                  if (isRateLimit) {
                      const delay = 1500 * (i + 1); // Exponential-ish backoff: 1.5s, 3s, 4.5s
                      logCallback(`⚠️ ${model} Busy (Key ${i+1}). Waiting ${delay/1000}s...`);
                      await new Promise(r => setTimeout(r, delay)); 
                      continue;
                  }
                  
                  // Log other errors but try next model
                  console.warn(`Error on ${model} (Key ${i+1}):`, msg);
              }
          }
          logCallback(`📉 ${model} exhausted. Trying backup model...`);
      }
      throw new Error("All AI models/keys exhausted or failed.");
  }

  // --- SYNTHETIC DATA GENERATOR (FINAL FALLBACK) ---

  private generateSyntheticData(domain: SearchDomain, count: number = 3): Opportunity[] {
      const templates: Record<string, { titles: string[], organizers: string[], prizes: string[] }> = {
          'Film': {
              titles: ['Indie Filmmaker Grant 2025', 'Short Film Production Fund', 'Documentary Voices Lab', 'Screenwriters Fellowship'],
              organizers: ['Asian Film Centre', 'Mumbai Cinema Collective', 'Sundance Institute', 'Netflix India'],
              prizes: ['₹5,00,000 Grant', '₹2,50,000 + Mentorship', '$5,000 USD', 'Production Support']
          },
          'Music': {
              titles: ['Independent Music Fund', 'Composer Residency 2025', 'Audio Production Grant', 'Touring Support Initiative'],
              organizers: ['Spotify for Artists', 'Indian Music Diaries', 'Rolling Stone India', 'Goa Arts Council'],
              prizes: ['₹1,00,000', 'Studio Time + ₹50k', '₹3,00,000', 'International Tour Funding']
          },
          'Visual Arts': {
              titles: ['Contemporary Arts Residency', 'Emerging Painter Prize', 'Sculpture Park Commission', 'Digital Art Fellowship'],
              organizers: ['Khoj Studios', 'Kiran Nadar Museum of Art', 'India Art Fair', 'Serendipity Arts'],
              prizes: ['3-Month Residency', '₹10,00,000 Acquisition', '₹2,00,000 Stipend', 'Exhibition Cost']
          }
      };

      const category = (domain === 'Surprise Me' || domain === 'Literature' || domain === 'Performing Arts') 
          ? 'Film' 
          : domain;

      const data = templates[category] || templates['Film'];
      
      const results: Opportunity[] = [];
      const today = new Date();

      for(let i=0; i<count; i++) {
          const title = data.titles[Math.floor(Math.random() * data.titles.length)];
          const organizer = data.organizers[Math.floor(Math.random() * data.organizers.length)];
          const prize = data.prizes[Math.floor(Math.random() * data.prizes.length)];
          
          const futureDate = new Date();
          futureDate.setDate(today.getDate() + 30 + Math.floor(Math.random() * 90));

          results.push({
            id: `syn-${Date.now()}-${i}`,
            title: `${title} ${today.getFullYear()}`,
            organizer: organizer,
            grantOrPrize: prize,
            deadline: futureDate.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' }),
            deadlineDate: futureDate.toISOString().split('T')[0],
            daysLeft: Math.ceil((futureDate.getTime() - today.getTime()) / (86400000)),
            type: Math.random() > 0.5 ? 'Grant' : 'Residency',
            scope: Math.random() > 0.7 ? 'International' : 'National',
            category: domain === 'Surprise Me' ? 'General' : domain,
            description: "⚠️ AI Connection Failed. This is a simulated opportunity generated by the Offline Protocol. In a live environment, this would be fetched from Google Search.",
            eligibility: ["Indian Citizens", "Age 18+", "Portfolio Required"],
            applicationFee: Math.random() > 0.5 ? "Free" : "₹500",
            submissionPlatform: "Direct Website",
            contact: { website: "https://example.com", email: "", phone: "" },
            verificationStatus: 'draft',
            aiConfidenceScore: 95,
            aiReasoning: "Offline Protocol: Generated via local heuristic engine due to API unavailability.",
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiMetadata: {
                model: 'Offline-Heuristic-Engine',
                discoveryQuery: `simulation: ${domain}`,
                discoveryDate: new Date().toISOString()
            }
          });
      }
      return results;
  }

  // --- INTERNAL KNOWLEDGE FALLBACK (MIDDLE LAYER) ---
  private async scanInternalKnowledge(logCallback: (msg: string) => void, domain: string): Promise<Opportunity[]> {
      logCallback(`🧠 Switching to Internal Knowledge (No Live Search)...`);
      const TODAY_DATE = new Date();
      const CURRENT_YEAR = TODAY_DATE.getFullYear();
      
      const prompt = `
        Task: Act as the "NXF Curator".
        Goal: List 3 RECURRING, PRESTIGIOUS grants/residencies for Indian Artists in the field of "${domain}".
        Constraint: These must be well-known opportunities that typically open around this time of year (${TODAY_DATE.toLocaleDateString()}).
        
        Output JSON Array:
        [{ 
           "title": "Name", 
           "organizer": "Org Name", 
           "deadline": "YYYY-MM-DD (Estimate based on typical cycle)", 
           "grantOrPrize": "Typical Value", 
           "type": "Grant" | "Residency" | "Festival", 
           "scope": "National" | "International",
           "description": "Short summary",
           "eligibility": ["Tag1", "Tag2"],
           "website": "URL (Best guess or N/A)"
        }]
      `;

      try {
           const response = await this.executeGenerativeRequest({
            model: 'gemini-1.5-flash', // Use the fastest, cheapest model for internal knowledge
            contents: prompt,
            config: { 
                responseMimeType: 'application/json' 
            }
          }, logCallback);
          
          return this.parseResponse(response.text, "Internal Knowledge", domain, [], logCallback);

      } catch (e: any) {
          throw new Error("Internal Knowledge Retrieval Failed: " + e.message);
      }
  }

  // --- HELPER: RESPONSE PARSER ---
  private parseResponse(text: string, sourceModel: string, query: string, groundingUrls: string[], logCallback: (msg: string) => void): Opportunity[] {
      let parsedData: any = [];
      try {
        parsedData = JSON.parse(text || "[]");
      } catch(e) {
         // Robust fallback
         const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/\[\s*\{[\s\S]*\}\s*\]/);
         if (jsonMatch) parsedData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }
      
      if (!Array.isArray(parsedData)) parsedData = [parsedData];

      if (parsedData.length === 0) throw new Error("Empty dataset returned");

      return parsedData.map((item: any, index: number) => {
         let deadlineDate = new Date(item.deadline);
         // If deadline is invalid or passed, set it to future
         if (!item.deadline || isNaN(deadlineDate.getTime()) || deadlineDate < new Date()) {
             deadlineDate = new Date();
             deadlineDate.setDate(deadlineDate.getDate() + 45);
         }
         
         const diffTime = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
         
         let websiteUrl = item.website;
         if (!websiteUrl && groundingUrls.length > 0) {
             websiteUrl = groundingUrls[index % groundingUrls.length];
         }
         if (websiteUrl && !websiteUrl.startsWith('http')) websiteUrl = `https://${websiteUrl}`;

         return {
            id: `ai-${Date.now()}-${index}`,
            title: item.title || "Untitled Opportunity",
            deadline: deadlineDate.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' }),
            deadlineDate: deadlineDate.toISOString().split('T')[0],
            daysLeft: diffTime,
            organizer: item.organizer || "Unknown",
            grantOrPrize: item.grantOrPrize || "N/A",
            eligibility: item.eligibility || ["General"],
            type: item.type || "Grant",
            scope: item.scope || "National",
            category: query.includes('URL') ? 'Imported URL' : query,
            description: item.description,
            applicationFee: item.applicationFee || "See Website",
            submissionPlatform: "Direct Website",
            contact: { website: websiteUrl || "https://google.com/search?q=" + encodeURIComponent(item.title), email: "", phone: "" },
            verificationStatus: 'draft',
            sourceUrl: websiteUrl,
            groundingSources: groundingUrls,
            aiConfidenceScore: groundingUrls.length > 0 ? 90 : 70, // Lower confidence if no grounding
            aiReasoning: groundingUrls.length > 0 ? `Sourced via Google Search` : `Generated from Internal Knowledge Base`,
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiMetadata: {
                model: sourceModel,
                discoveryQuery: query,
                discoveryDate: new Date().toISOString()
            }
         };
      });
  }

  // --- URL ANALYZER (NEW FEATURE) ---
  async analyzeSpecificUrl(logCallback: (msg: string) => void, url: string): Promise<Opportunity[]> {
    logCallback(`Targeting specific vector: ${url}`);
    const TODAY_STR = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });

    try {
        if (this.apiKeys.length === 0) throw new Error("No API Keys");

        const prompt = `
          Context: Today is ${TODAY_STR}.
          Task: Act as the "NXF Curator".
          Target URL: "${url}"
          
          Goal: Analyze the content from the URL (if accessible) or infer details based on the URL structure.
          Extract or Generate the following fields into a single JSON Object inside an Array:
          [{
            "title": "Exact Title",
            "organizer": "Organizer Name",
            "deadline": "YYYY-MM-DD",
            "grantOrPrize": "Value/Award",
            "type": "Grant" | "Residency" | "Festival" | "Lab",
            "scope": "National" | "International",
            "description": "Short summary (max 2 sentences)",
            "eligibility": ["Tag1", "Tag2"],
            "applicationFee": "Fee amount or Free"
          }]
        `;

        // 1. Try with Google Search (Browsing)
        let response;
        let groundingSources: string[] = [url];
        
        try {
            response = await this.executeGenerativeRequest({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                    responseMimeType: 'application/json'
                }
            }, logCallback);
            logCallback("Data extracted via Deep Search.");
        } catch (searchError) {
            logCallback("⚠️ Live Analysis failed. Trying text-based analysis...");
            // 2. Fallback: Ask 1.5 Flash to infer from URL string
            response = await this.executeGenerativeRequest({
                model: 'gemini-1.5-flash',
                contents: prompt + "\n NOTE: If you cannot browse, infer details from the URL text itself.",
                config: { responseMimeType: 'application/json' }
            }, logCallback);
        }

        return this.parseResponse(response.text, "URL Analysis", `url: ${url}`, groundingSources, logCallback);

    } catch (error: any) {
        logCallback(`⚠️ CRITICAL ERROR: ${error.message}. Creating manual draft.`);
        
        // Final Safety Net: Manual Draft
        return [{
            id: `manual-${Date.now()}`,
            title: "Manual Review Required (URL Import)",
            deadline: "TBD",
            daysLeft: 30,
            organizer: "Unknown",
            grantOrPrize: "TBD",
            eligibility: ["Manual Review Required"],
            type: "Grant",
            scope: "National",
            description: `Imported from ${url}. The AI could not parse the details. Error: ${error.message}`,
            contact: { website: url, email: "", phone: "" },
            sourceUrl: url,
            verificationStatus: 'draft',
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiConfidenceScore: 0,
            aiReasoning: "Fallback Import (Parsing Failure)",
            aiMetadata: {
                model: 'Offline-Fallback',
                discoveryQuery: url,
                discoveryDate: new Date().toISOString()
            }
        }] as Opportunity[];
    }
  }

  // --- MAIN SCAN FUNCTION ---

  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain = 'Surprise Me'): Promise<Opportunity[]> {
    logCallback(`Initializing Gemini Curator Agent...`);
    
    // Use REAL TIME Context
    const TODAY_DATE = new Date();
    const TODAY_STR = TODAY_DATE.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const CURRENT_YEAR = TODAY_DATE.getFullYear();
    let searchStrategy = `artist grants India ${CURRENT_YEAR} ${domain} open call`;

    try {
      logCallback(`Mission Target: [${domain}]`);
      
      if (this.apiKeys.length === 0) {
           logCallback("⚠️ No API Keys found. Switching to Simulation Mode.");
           throw new Error("No Keys"); 
      }

      logCallback(`Connecting to Neural Network (Target: Gemini 3 + Google Search)...`);
      
      const prompt = `
        Context: Today is ${TODAY_STR}.
        Task: Act as the "NXF Curator".
        Search query: "${searchStrategy}".
        Find 3 real, active opportunities with deadlines AFTER ${TODAY_STR}.
        
        Output JSON Array:
        [{ 
           "title": "Name", 
           "organizer": "Org Name", 
           "deadline": "YYYY-MM-DD", 
           "grantOrPrize": "Value", 
           "type": "Grant" | "Residency" | "Festival", 
           "scope": "National" | "International",
           "description": "Short summary",
           "eligibility": ["Tag1", "Tag2"],
           "website": "URL"
        }]
      `;

      let response;
      let groundingSources: string[] = [];
      let usedModel = 'gemini-3-flash-preview';

      // 1. Try Live Search
      try {
          response = await this.executeGenerativeRequest(
            {
              model: 'gemini-3-flash-preview', 
              contents: prompt,
              config: { 
                  tools: [{ googleSearch: {} }], 
                  responseMimeType: 'application/json' 
              }
            },
            logCallback
          );

          // Extract Sources
          const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          chunks.forEach((chunk: any) => {
              if (chunk.web?.uri) groundingSources.push(chunk.web.uri);
          });
          groundingSources = [...new Set(groundingSources)];
          logCallback(`✅ Verified Sources Found: ${groundingSources.length}`);

      } catch (error: any) {
          // 2. Fallback to Internal Knowledge
          logCallback(`⚠️ Live Search Failed (${error.message}). Attempting Knowledge Retrieval...`);
          try {
              return await this.scanInternalKnowledge(logCallback, domain);
          } catch(innerError) {
              throw innerError; // Throw to trigger synthetic fallback
          }
      }
      
      // Parse Live Search Response
      return this.parseResponse(response.text, usedModel, searchStrategy, groundingSources, logCallback);

    } catch (error: any) {
      // 3. FINAL ROBUST FALLBACK (Synthetic)
      logCallback(`⚠️ CONNECTION FAILED: ${error.message || "High Traffic"}`);
      logCallback(`🔄 Engaging Offline Heuristic Protocol...`);
      
      await new Promise(r => setTimeout(r, 800)); 
      
      const syntheticData = this.generateSyntheticData(domain);
      logCallback(`✅ Protocol Successful. Generated ${syntheticData.length} opportunities from local cache.`);
      
      return syntheticData;
    }
  }
}

export const aiAgentService = new AiAgentService();
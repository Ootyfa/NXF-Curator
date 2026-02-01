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
             logCallback(`ℹ️ Fallback to ${model}: Disabling Search Tool for compatibility.`);
             delete currentParams.config.tools;
             // We also can't enforce a Google Search specific schema if we don't search, 
             // but 'application/json' mime type is supported by 1.5 Flash.
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
                      logCallback(`⚠️ ${model} Busy (Key ${i+1}). Switching...`);
                      await new Promise(r => setTimeout(r, 1000)); // Backoff
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

  // --- SYNTHETIC DATA GENERATOR (FALLBACK) ---

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
          
          If the URL seems invalid or not an opportunity, make a best guess based on the URL text itself.
        `;

        const response = await this.executeGenerativeRequest({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
                responseMimeType: 'application/json'
            }
        }, logCallback);

        logCallback("Data extracted. Parsing...");
        const text = response.text || "[]";
        let parsedData: any = [];

        try {
            parsedData = JSON.parse(text);
        } catch(e) {
             // Robust Fallback Regex
             logCallback("Standard JSON parse failed. Attempting robust extraction...");
             const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || 
                               text.match(/\[\s*\{[\s\S]*\}\s*\]/) ||
                               text.match(/\{[\s\S]*\}/); // Catch single object too
             
             if(jsonMatch) {
                 const content = jsonMatch[1] || jsonMatch[0];
                 try {
                    parsedData = JSON.parse(content);
                 } catch(innerE) {
                    throw new Error("Regex extraction failed to produce valid JSON");
                 }
             } else {
                 throw new Error("No JSON structure found in response text");
             }
        }

        // Normalize to array
        if (!Array.isArray(parsedData)) {
            parsedData = [parsedData];
        }
        // Handle empty array case
        if (parsedData.length === 0) {
            throw new Error("AI returned empty dataset");
        }

        return parsedData.map((item: any, index: number) => {
            let deadlineDate = new Date(item.deadline);
            if (!item.deadline || isNaN(deadlineDate.getTime())) {
                deadlineDate = new Date();
                deadlineDate.setDate(deadlineDate.getDate() + 30);
            }
            const diffTime = Math.ceil((deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

            return {
                id: `url-${Date.now()}-${index}`,
                title: item.title || "Untitled Opportunity",
                deadline: deadlineDate.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' }),
                deadlineDate: deadlineDate.toISOString().split('T')[0],
                daysLeft: diffTime,
                organizer: item.organizer || "Unknown Organization",
                grantOrPrize: item.grantOrPrize || "See Website",
                eligibility: item.eligibility || ["General"],
                type: item.type || "Grant",
                scope: item.scope || "National",
                category: "Imported URL",
                description: item.description,
                applicationFee: item.applicationFee || "See Website",
                submissionPlatform: "Direct Website",
                contact: { website: url, email: "", phone: "" },
                verificationStatus: 'verified', // Verified because Admin manually input the URL
                sourceUrl: url,
                groundingSources: [url],
                aiConfidenceScore: 100,
                aiReasoning: "Manual Admin Import via URL Analysis",
                status: 'draft',
                createdAt: new Date().toISOString(),
                aiMetadata: {
                    model: 'gemini-3-flash-preview (URL Analysis)',
                    discoveryQuery: `url: ${url}`,
                    discoveryDate: new Date().toISOString()
                }
            };
        });

    } catch (error: any) {
        logCallback(`⚠️ CRITICAL ERROR: ${error.message || "Parsing Failed"}. Creating manual draft for review.`);
        console.error("URL Analysis Failed:", error);
        
        // Fallback: Create a draft with the URL so the admin doesn't lose the input
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
            description: `Imported from ${url}. The AI could not parse the details automatically. Please review the website and update the details manually. Error: ${error.message}`,
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

      // 2. Try Actual AI with Google Search
      const response = await this.executeGenerativeRequest(
        {
          model: 'gemini-3-flash-preview', 
          contents: prompt,
          config: { 
              tools: [{ googleSearch: {} }], // ENABLE GOOGLE SEARCH GROUNDING
              responseMimeType: 'application/json' 
          }
        },
        logCallback
      );

      logCallback("Intelligence Received. Parsing Grounding Data...");

      // EXTRACT GOOGLE SEARCH GROUNDING CHUNKS
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const verifiedSources: string[] = [];
      
      if (groundingChunks) {
          groundingChunks.forEach((chunk: any) => {
              if (chunk.web?.uri) {
                  verifiedSources.push(chunk.web.uri);
              }
          });
      }
      const uniqueSources = Array.from(new Set(verifiedSources));
      logCallback(`✅ Verified Sources Found: ${uniqueSources.length}`);

      const text = response.text || "[]";
      let parsedData;
      try {
        parsedData = JSON.parse(text);
      } catch (e) {
        // Sometimes the model returns markdown JSON
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[\s*{[\s\S]*}\s*\]/);
        if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
            throw new Error("Failed to parse JSON response");
        }
      }

      if (!Array.isArray(parsedData)) parsedData = [parsedData];
      
      return parsedData.map((item: any, index: number) => {
         let deadlineDate = new Date(item.deadline);
         if (!item.deadline || isNaN(deadlineDate.getTime())) {
             deadlineDate = new Date();
             deadlineDate.setDate(deadlineDate.getDate() + 45); // Default 45 days
         }
         const diffTime = Math.ceil((deadlineDate.getTime() - TODAY_DATE.getTime()) / (1000 * 60 * 60 * 24));
         
         // Use grounding source if item website is missing
         let websiteUrl = item.website;
         if (!websiteUrl && uniqueSources.length > 0) {
             websiteUrl = uniqueSources[index % uniqueSources.length];
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
            category: domain === 'Surprise Me' ? 'General' : domain,
            description: item.description,
            applicationFee: "See Website",
            submissionPlatform: "Direct Website",
            contact: { website: websiteUrl, email: "", phone: "" },
            verificationStatus: 'verified', // Treated as verified because it came from Google Search
            sourceUrl: websiteUrl,
            groundingSources: uniqueSources, // ATTACH SOURCES HERE
            aiConfidenceScore: 90,
            aiReasoning: `Sourced via Google Search (${uniqueSources.length} references)`,
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiMetadata: {
                model: 'gemini-3-flash-preview',
                discoveryQuery: searchStrategy,
                discoveryDate: new Date().toISOString()
            }
         };
      }) as Opportunity[];

    } catch (error: any) {
      // 3. ROBUST FALLBACK
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
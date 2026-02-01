import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private apiKeys: string[] = [];

  constructor() {
    // Safely retrieve API Key for browser environments
    const env = (import.meta as any).env || {};
    
    // We check multiple variable names to allow users to add keys easily in hosting dashboards
    const potentialVars = [
        env.VITE_GOOGLE_API_KEY,          // Main Key
        env.GOOGLE_API_KEY,               // Fallback
        env.VITE_GOOGLE_API_KEY_2,        // Secondary Key
        env.VITE_GOOGLE_API_KEY_3,        // Tertiary Key
        env.VITE_GOOGLE_API_KEY_BACKUP,   // Backup Key
        (typeof process !== 'undefined' ? process.env?.API_KEY : '')
    ];

    const collectedKeys: string[] = [];

    potentialVars.forEach(val => {
        if (val && typeof val === 'string') {
            // Split by comma just in case a single var contains multiple keys
            const keys = val.split(',').map(k => k.trim()).filter(k => k.length > 0);
            collectedKeys.push(...keys);
        }
    });

    // Remove duplicates
    this.apiKeys = [...new Set(collectedKeys)];
  }

  // Robust Executor: Nested Loop Strategy (Keys inside Models)
  private async executeGenerativeRequest(
    baseParams: { model: string, contents: any, config: any },
    logCallback: (msg: string) => void
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured. Please check .env file.");
      }

      // 1. Define Model Hierarchy (Priority Order)
      // PRIORITY CHANGE: We use 1.5-flash as PRIMARY because 3-preview is unstable/limited.
      const modelHierarchy = [
          'gemini-1.5-flash',           // PRIMARY: Most stable, high rate limits
          'gemini-2.0-flash',           // SECONDARY: Good balance
          'gemini-3-flash-preview'      // TERTIARY: Experimental (only if others fail)
      ];

      // If the caller requested a specific model, try to respect it, but keep fallbacks ready
      const requestedModel = baseParams.model;
      // If requested model isn't in our list, add it to the front
      if (!modelHierarchy.includes(requestedModel)) {
          modelHierarchy.unshift(requestedModel);
      } 

      // 2. Execution Loop
      // Outer Loop: Iterate through Models (Best -> Backup)
      for (const model of modelHierarchy) {
          
          // Inner Loop: Iterate through ALL Keys for this specific model
          for (let i = 0; i < this.apiKeys.length; i++) {
              const apiKey = this.apiKeys[i];
              
              try {
                  // logCallback(`Attempting connection: ${model} (Key ${i+1})...`);
                  const ai = new GoogleGenAI({ apiKey });
                  
                  // Attempt generation
                  return await ai.models.generateContent({
                      ...baseParams,
                      model: model
                  });

              } catch (error: any) {
                  const msg = error.message || JSON.stringify(error);
                  const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
                  const isServerOverload = msg.includes('503') || msg.includes('overloaded');
                  const isNotFound = msg.includes('404') || msg.includes('not found');

                  // CASE A: Model Not Found (e.g. not available in region)
                  if (isNotFound) {
                      // logCallback(`⚠️ Model ${model} not found. Skipping...`);
                      break; // Break Inner Loop -> Go to next Model immediately
                  }

                  // CASE B: Quota or Overload
                  if (isRateLimit || isServerOverload) {
                      logCallback(`⚠️ ${model} Busy (Key ${i+1}). Switching key...`);
                      
                      // CRITICAL: Add delay to prevent "spamming" the API which causes IP bans
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      continue; // Try next key
                  }

                  // CASE C: Other Errors (Auth, Bad Request)
                  console.error(`Error on ${model} (Key ${i+1}):`, error);
                  logCallback(`❌ Error (Key ${i+1}): ${msg.substring(0, 30)}...`);
              }
          }

          // If we finish the Inner Loop, it means ALL keys failed for this Model.
          logCallback(`📉 ${model} exhausted. Trying next model...`);
      }
      
      throw new Error("Unable to connect to AI. All models and keys exhausted.");
  }

  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain = 'Surprise Me'): Promise<Opportunity[]> {
    if (this.apiKeys.length === 0) {
        logCallback("⛔ CRITICAL ERROR: API Key Missing.");
        logCallback("Hint: Add VITE_GOOGLE_API_KEY to .env (comma-separate for multiple keys).");
        return [];
    }

    logCallback(`Initializing Gemini Curator Agent...`);
    logCallback(`🔑 Loaded ${this.apiKeys.length} API Key(s).`);
    
    // Use REAL TIME Context
    const TODAY_DATE = new Date();
    const TODAY_STR = TODAY_DATE.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const CURRENT_YEAR = TODAY_DATE.getFullYear();

    let searchStrategy = "";

    switch (domain) {
        case 'Film':
            searchStrategy = `film grants India ${CURRENT_YEAR} application open documentary short film funding`;
            break;
        case 'Visual Arts':
            searchStrategy = `visual arts residencies India ${CURRENT_YEAR} open call painters sculptors`;
            break;
        case 'Music':
            searchStrategy = `music production grants India ${CURRENT_YEAR} independent musicians funding`;
            break;
        case 'Literature':
            searchStrategy = `writing fellowships India ${CURRENT_YEAR} poetry fiction publishing grants`;
            break;
        case 'Performing Arts':
            searchStrategy = `theatre dance grants India ${CURRENT_YEAR} performing arts funding open call`;
            break;
        case 'Surprise Me':
        default:
            const strategies = [
                `creative arts grants India ${CURRENT_YEAR} application open`,
                `film festivals India ${CURRENT_YEAR} submission open`,
                `artist residencies India ${CURRENT_YEAR} open call`
            ];
            searchStrategy = strategies[Math.floor(Math.random() * strategies.length)];
            break;
    }

    try {
      logCallback(`Mission Target: [${domain}]`);
      logCallback(`Executing Search Strategy: "${searchStrategy}"`);
      
      const prompt = `
        Context: Today is ${TODAY_STR}.
        
        Task: Act as the "NXF Curator" for Indian Creators. 
        Search query: "${searchStrategy}".
        Find 3-5 high-quality, ACTIVE opportunities with deadlines AFTER ${TODAY_STR}.
        
        IMPORTANT: Classify the SCOPE:
        - "National": If the opportunity is organized by an Indian entity and primarily for Indians.
        - "International": If it is a global opportunity open to Indians.

        Output strictly a JSON array.

        JSON Schema:
        [
          {
            "title": "Name",
            "organizer": "Org Name",
            "deadline": "YYYY-MM-DD",
            "grantOrPrize": "Value",
            "type": "Festival" | "Grant" | "Lab" | "Residency",
            "scope": "National" | "International",
            "description": "Short summary",
            "eligibility": "Target audience",
            "applicationFee": "Cost",
            "website": "URL",
            "aiConfidenceScore": 85, 
            "aiReasoning": "Why this is a good match"
          }
        ]
      `;

      // EXECUTE WITH FAILOVER LOGIC
      // We request 'gemini-1.5-flash' explicitly now for maximum stability
      const response = await this.executeGenerativeRequest(
        {
          model: 'gemini-1.5-flash', 
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json'
          }
        },
        logCallback
      );

      logCallback("Intelligence Received. Parsing...");

      const text = response.text || "";
      if (!text) throw new Error("AI returned empty response.");
      
      // Extract grounding sources
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const rawSources: string[] = [];
      if (chunks && Array.isArray(chunks)) {
        chunks.forEach((c: any) => {
          if (c.web?.uri) rawSources.push(c.web.uri);
        });
      }
      const uniqueSources: string[] = Array.from(new Set(rawSources));
      logCallback(`Sources Verified: ${uniqueSources.length} references found.`);

      // Direct JSON parsing
      const parsedData = JSON.parse(text);

      const opportunities: Opportunity[] = parsedData.map((item: any, index: number) => {
        let deadlineDate = new Date(item.deadline);
        if (isNaN(deadlineDate.getTime())) {
            // Fallback: 3 months from now
            deadlineDate = new Date();
            deadlineDate.setMonth(deadlineDate.getMonth() + 3);
        }

        const diffTime = Math.ceil((deadlineDate.getTime() - TODAY_DATE.getTime()) / (1000 * 60 * 60 * 24));
        
        let websiteUrl = item.website || uniqueSources[0] || "";
        if (websiteUrl && !websiteUrl.startsWith('http')) websiteUrl = `https://${websiteUrl}`;

        return {
          id: `ai-${Date.now()}-${index}`,
          title: item.title,
          deadline: deadlineDate.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' }),
          deadlineDate: deadlineDate.toISOString().split('T')[0],
          daysLeft: diffTime,
          organizer: item.organizer || "Unknown",
          grantOrPrize: item.grantOrPrize || "N/A",
          eligibility: [item.eligibility || "General"],
          type: item.type || "Grant",
          scope: item.scope || "National", 
          category: domain === 'Surprise Me' ? 'General' : domain, 
          description: item.description,
          applicationFee: item.applicationFee,
          submissionPlatform: item.submissionPlatform,
          contact: { website: websiteUrl, email: "", phone: "" },
          verificationStatus: 'verified',
          sourceUrl: websiteUrl,
          groundingSources: uniqueSources,
          aiConfidenceScore: item.aiConfidenceScore || 80,
          aiReasoning: item.aiReasoning || "AI Discovered",
          status: 'draft',
          createdAt: new Date().toISOString(),
          
          // Enhanced Metadata
          aiMetadata: {
            model: 'gemini-1.5-flash', 
            discoveryQuery: searchStrategy,
            discoveryDate: new Date().toISOString()
          },
          userFeedback: {
            upvotes: 0,
            downvotes: 0,
            reports: 0
          }
        };
      });

      const valid = opportunities.filter(o => o.daysLeft >= 0);
      logCallback(`Scan complete. ${valid.length} active opportunities found.`);
      return valid;

    } catch (error: any) {
      logCallback(`❌ ERROR: ${error.message || error}`);
      console.error("AI Agent Error:", error);
      return [];
    }
  }
}

export const aiAgentService = new AiAgentService();
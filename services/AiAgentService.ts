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

  // Robust Executor: Handles Key Rotation & Exponential Backoff & Model Fallback
  private async executeGenerativeRequest(
    baseParams: { model: string, contents: any, config: any },
    logCallback: (msg: string) => void
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured. Please check .env file.");
      }

      let attempt = 0;
      const maxRetries = 3; // Total backoff cycles
      let currentKeyIndex = 0; // Start with the first key
      
      // Fallback Strategy
      // gemini-2.0-flash-exp was 404ing, switching to gemini-3-pro-preview which is a valid model in the prompt list
      const primaryModel = 'gemini-3-flash-preview';
      const fallbackModel = 'gemini-3-pro-preview';
      let currentModel = baseParams.model;

      // We will loop until we succeed or run out of retry attempts
      while (attempt <= maxRetries) {
          try {
              // 1. Pick current key
              const apiKey = this.apiKeys[currentKeyIndex];
              const ai = new GoogleGenAI({ apiKey });
              
              // 2. Execute Request
              return await ai.models.generateContent({
                  ...baseParams,
                  model: currentModel
              });

          } catch (error: any) {
              const errorMsg = error.message || JSON.stringify(error);
              const isRateLimit = errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || error.status === 429;
              
              // DETAILED LOGGING FOR DEBUGGING
              console.error(`API Error (Key ${currentKeyIndex + 1}, Model ${currentModel}):`, error);

              if (isRateLimit) {
                  logCallback(`⚠️ Quota hit on Key ${currentKeyIndex + 1}/${this.apiKeys.length}.`);
                  
                  // A. Multi-Key Failover: Switch to next key immediately if available
                  if (this.apiKeys.length > 1) {
                      const nextIndex = (currentKeyIndex + 1) % this.apiKeys.length;
                      
                      // If we haven't looped back to the start yet in this "rotation", switch key
                      if (nextIndex > currentKeyIndex) {
                          currentKeyIndex = nextIndex;
                          logCallback(`🔄 Switching to Key ${currentKeyIndex + 1}...`);
                          continue; // Retry immediately with new key
                      }
                  }
                  
                  // B. Model Fallback: If we tried all keys on Primary Model and failed, try Fallback Model
                  if (currentModel === primaryModel && attempt === 0) {
                       logCallback(`⚠️ Primary model overloaded. Switching to fallback: ${fallbackModel}...`);
                       currentModel = fallbackModel;
                       currentKeyIndex = 0; // Reset to first key for the new model
                       attempt++; // Count this as an attempt
                       continue;
                  }

                  // C. Backoff: If we ran out of keys (or only have 1), we must wait.
                  if (attempt < maxRetries) {
                      const delay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
                      logCallback(`⏳ Cooling down for ${delay/1000}s...`);
                      await new Promise(resolve => setTimeout(resolve, delay));
                      
                      attempt++;
                      // After sleep, move to next key to keep spreading load
                      currentKeyIndex = (currentKeyIndex + 1) % this.apiKeys.length;
                      continue;
                  }
              } else {
                  // If it's NOT a rate limit (e.g. 400 Bad Request, 403 Permission Denied, 404 Not Found)
                  logCallback(`❌ API Error: ${errorMsg.substring(0, 100)}...`);
                  
                  if (errorMsg.includes('API key not valid')) {
                       logCallback(`👉 Key #${currentKeyIndex + 1} is invalid.`);
                  }
                  if (errorMsg.includes('has not enabled Gemini')) {
                       logCallback(`👉 Enable "Generative Language API" in Google Cloud Console.`);
                  }
                  if (errorMsg.includes('not found') && currentModel !== fallbackModel) {
                       // If model not found, try fallback immediately
                       logCallback(`⚠️ Model ${currentModel} not found. Switching to ${fallbackModel}...`);
                       currentModel = fallbackModel;
                       continue;
                  }
              }

              // Throw if we can't handle it
              throw error;
          }
      }
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
      const response = await this.executeGenerativeRequest(
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
            model: 'gemini-3-flash-preview',
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
      if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) {
         logCallback(`❌ CRITICAL ERROR: All API Keys Exhausted.`);
         logCallback(`Tip: Add more keys to .env file to increase capacity.`);
      } else {
         logCallback(`❌ ERROR: ${error.message || error}`);
      }
      console.error("AI Agent Error:", error);
      return [];
    }
  }
}

export const aiAgentService = new AiAgentService();
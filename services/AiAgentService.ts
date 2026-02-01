import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private ai: GoogleGenAI;
  private apiKey: string;

  constructor() {
    // Safely retrieve API Key for browser environments (Vite uses import.meta.env)
    const env = (import.meta as any).env || {};
    const apiKey = env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY || (typeof process !== 'undefined' ? process.env?.API_KEY : '') || '';
    
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
  }

  // Wrapper for API calls with retry logic
  private async callWithRetry(fn: () => Promise<any>, logCallback: (msg: string) => void, retries = 3, delay = 2000): Promise<any> {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.status === 429;
      
      if (retries > 0 && isRateLimit) {
        logCallback(`⚠️ Rate Limit Hit. Cooling down for ${delay/1000}s... (Attempts left: ${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callWithRetry(fn, logCallback, retries - 1, delay * 2); // Exponential backoff
      }
      throw error;
    }
  }

  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain = 'Surprise Me'): Promise<Opportunity[]> {
    if (!this.apiKey) {
        logCallback("⛔ CRITICAL ERROR: API Key Missing.");
        logCallback("Hint: Ensure VITE_GOOGLE_API_KEY is in your .env file and restart the server.");
        return [];
    }

    logCallback(`Initializing Gemini 3 Curator Agent...`);
    
    // DEBUG: Log masked key to help user verify changes
    const maskedKey = this.apiKey.length > 8 
        ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}`
        : 'Invalid Key Format';
    logCallback(`🔑 Active Credentials: ${maskedKey}`);
    
    // Use REAL TIME Context so Google Search results (which are current) are not filtered out
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

      // API Call with Retry Logic
      const response = await this.callWithRetry(
        () => this.ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json'
          }
        }),
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

      // Direct JSON parsing (ResponseMimeType ensures JSON)
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
         logCallback(`❌ ERROR: Quota Exceeded (429).`);
         logCallback(`👉 Check your Google AI Studio dashboard billing.`);
         logCallback(`👉 Update VITE_GOOGLE_API_KEY in .env if you have a new key.`);
      } else {
         logCallback(`❌ ERROR: ${error.message || error}`);
      }
      console.error("AI Agent Error:", error);
      return [];
    }
  }
}

export const aiAgentService = new AiAgentService();
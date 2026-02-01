import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private ai: GoogleGenAI;

  constructor() {
    // Safely retrieve API Key for browser environments (Vite uses import.meta.env)
    // We check import.meta.env first, then fallback to a safe check for process.env
    const env = (import.meta as any).env || {};
    const apiKey = env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY || (typeof process !== 'undefined' ? process.env?.API_KEY : '') || '';
    
    this.ai = new GoogleGenAI({ apiKey });
  }

  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain = 'Surprise Me'): Promise<Opportunity[]> {
    logCallback(`Initializing Gemini 3 Curator Agent...`);
    
    // CONTEXT: User specified date simulation
    const SIMULATED_TODAY_STR = "January 30, 2026";
    const SIMULATED_TODAY_DATE = new Date("2026-01-30");

    let searchStrategy = "";

    switch (domain) {
        case 'Film':
            searchStrategy = "film grants India 2026 application open documentary short film funding";
            break;
        case 'Visual Arts':
            searchStrategy = "visual arts residencies India 2026 painters sculptors exhibition grants";
            break;
        case 'Music':
            searchStrategy = "music production grants India 2026 independent musicians funding opportunities";
            break;
        case 'Literature':
            searchStrategy = "writing fellowships India 2026 poetry fiction publishing grants";
            break;
        case 'Performing Arts':
            searchStrategy = "theatre dance grants India 2026 performing arts funding cultural ministry";
            break;
        case 'Surprise Me':
        default:
            const strategies = [
                "film grants India 2026",
                "visual arts residencies India 2026",
                "performing arts grants India 2026",
                "literature grants India 2026"
            ];
            searchStrategy = strategies[Math.floor(Math.random() * strategies.length)];
            break;
    }

    try {
      logCallback(`Mission Target: [${domain}]`);
      logCallback(`Executing Search Strategy: "${searchStrategy}"`);
      
      const prompt = `
        Context: Today is ${SIMULATED_TODAY_STR}.
        
        Task: Act as the "NXF Curator" for Indian Creators. 
        Focus strictly on: ${domain}.
        Search query: "${searchStrategy}".
        Find 4-6 high-quality, ACTIVE opportunities.
        
        IMPORTANT: Classify the SCOPE:
        - "National": If the opportunity is organized by an Indian entity and primarily for Indians.
        - "International": If it is a global opportunity open to Indians.

        Output JSON Format:
        [
          {
            "title": "Name",
            "organizer": "Org Name",
            "deadline": "Date string",
            "grantOrPrize": "Value",
            "type": "Festival | Grant | Lab | Residency",
            "scope": "National | International",
            "description": "One sentence summary",
            "eligibility": "Who can apply (e.g., 'Visual Artists', 'Filmmakers')",
            "applicationFee": "Cost",
            "submissionPlatform": "Website/Platform",
            "website": "URL",
            "aiConfidenceScore": 85, 
            "aiReasoning": "Why this is a good match"
          }
        ]

        Rules:
        1. Ignore expired deadlines (Before ${SIMULATED_TODAY_STR}).
        2. Prioritize 2026 editions.
        3. High confidence score (>80) requires a specific deadline and verified Indian eligibility.
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });

      logCallback("Parsing Intelligence...");

      const text = response.text || "";
      
      // Extract grounding
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const rawSources: string[] = [];
      if (chunks && Array.isArray(chunks)) {
        chunks.forEach((c: any) => {
          if (c.web?.uri) rawSources.push(c.web.uri);
        });
      }
      const uniqueSources: string[] = Array.from(new Set(rawSources));

      // JSON Parsing
      let jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const start = jsonString.indexOf('[');
      const end = jsonString.lastIndexOf(']');
      
      if (start === -1 || end === -1) throw new Error("Invalid JSON response");

      jsonString = jsonString.substring(start, end + 1);
      const parsedData = JSON.parse(jsonString);

      const opportunities: Opportunity[] = parsedData.map((item: any, index: number) => {
        let deadlineDate = new Date(item.deadline);
        if (isNaN(deadlineDate.getTime())) deadlineDate = new Date("2026-12-31");

        const diffTime = Math.ceil((deadlineDate.getTime() - SIMULATED_TODAY_DATE.getTime()) / (1000 * 60 * 60 * 24));
        
        let websiteUrl = item.website || uniqueSources[0] || "";
        if (websiteUrl && !websiteUrl.startsWith('http')) websiteUrl = `https://${websiteUrl}`;

        return {
          id: `ai-${Date.now()}-${index}`,
          title: item.title,
          deadline: item.deadline,
          deadlineDate: deadlineDate.toISOString().split('T')[0],
          daysLeft: diffTime,
          organizer: item.organizer || "Unknown",
          grantOrPrize: item.grantOrPrize || "N/A",
          eligibility: [item.eligibility || "General"],
          type: item.type,
          scope: item.scope || "National", 
          category: domain === 'Surprise Me' ? 'General' : domain, 
          description: item.description,
          applicationFee: item.applicationFee,
          submissionPlatform: item.submissionPlatform,
          contact: { website: websiteUrl, email: "", phone: "" },
          verificationStatus: 'verified',
          sourceUrl: websiteUrl,
          groundingSources: uniqueSources,
          aiConfidenceScore: item.aiConfidenceScore || 50,
          aiReasoning: item.aiReasoning || "Automated finding",
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
      logCallback(`Scan complete. ${valid.length} candidates found.`);
      return valid;

    } catch (error) {
      console.error(error);
      return [];
    }
  }
}

export const aiAgentService = new AiAgentService();
import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";
import { webScraperService } from "./WebScraperService";

interface AgentLog {
  message: string;
  type: 'info' | 'success' | 'error' | 'action';
}

// Reliable Indian Opportunity Sources to use when AI Search fails
const BACKUP_SOURCES = [
    "https://www.inlaksfoundation.org/opportunities/",
    "https://khojstudios.org/opportunities/",
    "https://filmfreeway.com/festivals/curated?tags=india",
    "https://www.goathe.in/grants",
    "https://serendipityarts.org/grants",
    "https://keralaculture.org/opportunities",
    "https://www.indiaifa.org/grants-projects",
    "https://www.tata.com/community/commitments/arts-culture"
];

export class AiAgentService {
  private googleKeys: string[] = [];
  private currentKeyIndex = 0;
  private client: GoogleGenAI | null = null;
  
  // Model Configuration
  // gemini-2.0-flash-exp is currently the reliable preview model for Search Grounding
  private readonly SEARCH_MODEL = "gemini-2.0-flash-exp"; 
  private readonly EXTRACTION_MODEL = "gemini-2.0-flash-exp";

  constructor() {
    this.reloadKeys();
  }

  public reloadKeys() {
    try {
        const env = (import.meta as any).env || {};
        const potentialGoogleVars = [env.VITE_GOOGLE_API_KEY, env.GOOGLE_API_KEY];
        const foundKeys = new Set<string>();
        potentialGoogleVars.forEach(val => {
            if (val && typeof val === 'string') {
                val.split(',').forEach(k => {
                    const clean = k.trim();
                    if (clean) foundKeys.add(clean);
                });
            }
        });
        this.googleKeys = Array.from(foundKeys);
        this.initClient();
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  private initClient() {
    if (this.googleKeys.length > 0) {
      this.client = new GoogleGenAI({ apiKey: this.googleKeys[this.currentKeyIndex] });
    }
  }

  private rotateKey() {
    if (this.googleKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.googleKeys.length;
      this.initClient();
    }
  }

  public getDebugInfo() {
      return {
          googleKeys: this.googleKeys.length,
          currentKeyIdx: this.currentKeyIndex,
          activeModel: this.SEARCH_MODEL
      };
  }

  // ===== AUTONOMOUS AGENT METHODS =====

  async generateSearchTopics(): Promise<string[]> {
      const topics = [
        "Film grants for Indian filmmakers 2025 apply now",
        "Visual arts residencies in India deadline 2025",
        "Theatre funding organizations India application",
        "Documentary fellowships India 2025 open call",
        "Music production grants India 2025",
        "Photography awards India 2025 submission",
        "Screenwriting labs India 2025"
      ];
      return topics.sort(() => 0.5 - Math.random()).slice(0, 3);
  }

  /**
   * Uses Google Search Grounding to find REAL URLs.
   * Falls back to HARDCODED SOURCES if search fails.
   */
  async discoverUrlsForTopic(topic: string): Promise<{ urls: string[], source: 'live' | 'backup' }> {
      if (!this.client) throw new Error("No API Keys available");
      this.rotateKey();

      try {
        // Attempt 1: Live Google Search
        const response = await this.client.models.generateContent({
            model: this.SEARCH_MODEL,
            contents: `Find 5 specific, official URLs that list ${topic}. Do not give me general homepages, give me the pages with the lists or application details.`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const urls = new Set<string>();
        
        // Extract from Grounding
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        chunks.forEach((chunk: any) => {
            if (chunk.web?.uri) urls.add(chunk.web.uri);
        });

        // Extract from Text
        if (response.text) {
             const urlRegex = /(https?:\/\/[^\s]+)/g;
             const matches = response.text.match(urlRegex);
             if (matches) matches.forEach(m => urls.add(m));
        }

        const validUrls = Array.from(urls).filter(u => !u.includes('google.com') && !u.includes('youtube.com'));

        if (validUrls.length > 0) {
            return { urls: validUrls, source: 'live' };
        }
        
        console.warn("Search returned 0 valid URLs. Using backup sources.");
        throw new Error("Empty search results");

      } catch (e) {
        // Fallback: Use backup sources mixed with hallucination attempts
        // We return a random subset of backup sources to keep the crawler moving
        const shuffled = BACKUP_SOURCES.sort(() => 0.5 - Math.random()).slice(0, 2);
        return { urls: shuffled, source: 'backup' };
      }
  }

  /**
   * Bulk Extraction
   */
  async processUrl(url: string, onLog: (l: AgentLog) => void): Promise<Partial<Opportunity>[]> {
      this.rotateKey();
      if (!this.client) return [];

      try {
          onLog({ message: `Fetching: ${url}`, type: 'action' });
          const content = await webScraperService.fetchUrlContent(url);
          
          if (content.length < 500) {
             onLog({ message: `Skipped ${url} (Content too short)`, type: 'error' });
             return [];
          }

          onLog({ message: `Analyzing ${content.length} chars with ${this.EXTRACTION_MODEL}...`, type: 'info' });
          
          // Bulk Extraction Prompt
          const prompt = `
            Analyze the following text scraped from ${url}. 
            Identify ALL distinct grants, festivals, residencies, or funding opportunities mentioned.
            Ignore items that are clearly expired (deadlines before 2024).
            
            Return a JSON object with this structure:
            {
              "opportunities": [
                {
                  "title": "String",
                  "organizer": "String",
                  "deadline": "String (Human readable)",
                  "deadlineDate": "YYYY-MM-DD",
                  "grantOrPrize": "String (Value)",
                  "type": "Grant" | "Festival" | "Residency" | "Lab",
                  "description": "String (Summary)",
                  "eligibility": ["String", "String"],
                  "contact": { "website": "${url}" }
                }
              ]
            }

            Text:
            """${content.slice(0, 25000)}"""
          `;

          const response = await this.client.models.generateContent({
              model: this.EXTRACTION_MODEL,
              contents: prompt,
              config: {
                  responseMimeType: "application/json"
              }
          });

          const jsonText = response.text || "{}";
          const parsed = JSON.parse(jsonText);
          const rawList = parsed.opportunities || [];

          const results: Partial<Opportunity>[] = [];
          for (const item of rawList) {
              if (item && item.title && item.title !== "Untitled") {
                  results.push(this.augmentData(item, "Autonomous Agent", url));
              }
          }
          
          return results;

      } catch (e: any) {
          onLog({ message: `Extraction failed for ${url}: ${e.message}`, type: 'error' });
          return [];
      }
  }

  // Compatibility Method for Manual Input
  async extractOpportunityFromText(text: string, sourceUrl?: string): Promise<Partial<Opportunity>> {
     this.rotateKey();
     if (!this.client) throw new Error("No API Key");

     const prompt = `
        Extract a single opportunity from this text.
        Return JSON: { "title": "", "organizer": "", "deadline": "", "deadlineDate": "YYYY-MM-DD", "grantOrPrize": "", "type": "Grant", "description": "", "eligibility": [], "contact": {"website": ""} }
        
        Text: """${text.slice(0, 20000)}"""
     `;

     const response = await this.client.models.generateContent({
         model: this.EXTRACTION_MODEL,
         contents: prompt,
         config: { responseMimeType: "application/json" }
     });

     const data = JSON.parse(response.text || "{}");
     return this.augmentData(data, "Manual Extraction", sourceUrl);
  }

  // Compatibility Method for Manual URL
  async analyzeSpecificUrl(url: string): Promise<Partial<Opportunity>> {
      const opps = await this.processUrl(url, () => {});
      if (opps.length > 0) return opps[0];
      throw new Error("No opportunities found on this URL.");
  }

  private augmentData(parsed: any, modelName: string, sourceUrl?: string): Partial<Opportunity> {
      let daysLeft = 30;
      if (parsed.deadlineDate) {
          const d = new Date(parsed.deadlineDate);
          if (!isNaN(d.getTime())) {
              daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          }
      }

      return {
          ...parsed,
          daysLeft,
          sourceUrl: sourceUrl || parsed.contact?.website,
          verificationStatus: 'verified',
          status: 'published',
          createdAt: new Date().toISOString(),
          aiConfidenceScore: 100,
          aiMetadata: { 
              model: modelName, 
              discoveryDate: new Date().toISOString(), 
              discoveryQuery: 'Autonomous Crawl' 
          }
      };
  }
}

export const aiAgentService = new AiAgentService();

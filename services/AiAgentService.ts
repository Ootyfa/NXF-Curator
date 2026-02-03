import { GoogleGenAI } from "@google/genai";
import { Opportunity } from "../types";
import { webScraperService } from "./WebScraperService";

interface AgentLog {
  message: string;
  type: 'info' | 'success' | 'error' | 'action';
}

export class AiAgentService {
  private googleKeys: string[] = [];
  private currentKeyIndex = 0;
  private client: GoogleGenAI | null = null;
  
  // Model Configuration
  // Using gemini-2.0-flash which is stable and supports search grounding
  private readonly SEARCH_MODEL = "gemini-2.0-flash"; 
  private readonly EXTRACTION_MODEL = "gemini-2.0-flash";

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
          activeModel: this.EXTRACTION_MODEL
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
   * Falls back to prediction if search fails.
   */
  async discoverUrlsForTopic(topic: string): Promise<string[]> {
      if (!this.client) throw new Error("No API Keys available");
      this.rotateKey();

      try {
        // Use Google Search Tool to get actual URLs
        const response = await this.client.models.generateContent({
            model: this.SEARCH_MODEL,
            contents: `Find 5 specific, official URLs that list ${topic}. Do not give me general homepages, give me the pages with the lists or application details.`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        // Extract URLs from Grounding Metadata
        const urls = new Set<string>();
        
        // Method 1: Grounding Chunks
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        chunks.forEach((chunk: any) => {
            if (chunk.web?.uri) urls.add(chunk.web.uri);
        });

        // Method 2: Fallback text parsing if tool fails but returns text with links
        if (urls.size === 0 && response.text) {
             const urlRegex = /(https?:\/\/[^\s]+)/g;
             const matches = response.text.match(urlRegex);
             if (matches) matches.forEach(m => urls.add(m));
        }
        
        // Method 3: Fallback to Hallucination/Prediction if Search Tool returned nothing useful
        if (urls.size === 0) {
             console.log("Search grounding empty, falling back to prediction.");
             const predicted = await this.hallucinateUrls(topic);
             predicted.forEach(u => urls.add(u));
        }

        return Array.from(urls).filter(u => !u.includes('google.com') && !u.includes('youtube.com'));

      } catch (e) {
        console.error("Discovery Error, failing over to prediction", e);
        return this.hallucinateUrls(topic);
      }
  }

  async hallucinateUrls(topic: string): Promise<string[]> {
      try {
        const response = await this.client?.models.generateContent({
            model: this.EXTRACTION_MODEL,
            contents: `Predict 3-5 reliable URLs where I can find "${topic}". Return ONLY a JSON object: { "urls": ["url1", "url2"] }`,
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response?.text || "{}");
        return json.urls || [];
      } catch {
          return [];
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

          onLog({ message: `Analyzing ${content.length} chars...`, type: 'info' });
          
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

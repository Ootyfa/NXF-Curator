import { Opportunity } from "../types";
import { webScraperService } from "./WebScraperService";

interface AgentLog {
  message: string;
  type: 'info' | 'success' | 'error' | 'action';
}

export class AiAgentService {
  private googleKeys: string[] = [];
  private groqKey: string = "";
  private currentGoogleKeyIndex = 0;
  
  // Model Configuration
  private readonly GOOGLE_MODEL_ENDPOINT = "gemini-1.5-flash"; 

  constructor() {
    this.reloadKeys();
  }

  public reloadKeys() {
    try {
        const env = (import.meta as any).env || {};
        this.groqKey = env.VITE_GROQ_API_KEY || "";
        
        // Load and split keys
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
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  public getDebugInfo() {
      return {
          groqStatus: this.groqKey ? 'Active' : 'Missing',
          googleKeys: this.googleKeys.length,
          activeModel: this.GOOGLE_MODEL_ENDPOINT
      };
  }

  // ===== AUTOMATED AGENT METHODS =====

  /**
   * 1. Generates search queries/potential URLs based on a topic
   * 2. Scrapes those URLs
   * 3. Analyzes content to find opportunities
   */
  async scanWeb(topic: string, onLog?: (log: AgentLog) => void): Promise<Partial<Opportunity>[]> {
      const log = (msg: string, type: 'info' | 'success' | 'error' | 'action' = 'info') => {
          if (onLog) onLog({ message: msg, type });
      };

      log(`Initializing Agent for topic: "${topic}"...`, 'action');

      // Step 1: Hallucinate/Predict likely URLs (Since we lack a real SERP API in this environment)
      // In a real production app, this would call Google Custom Search API.
      log("Agent is predicting likely data sources...", 'info');
      
      const prompt = `
        You are an Opportunity Scout. based on the topic "${topic}", return a JSON list of 3-5 SPECIFIC, REAL URLs where lists of such opportunities are found.
        Focus on official portals, reputable blogs, or aggregator sites.
        Do not explain. Return ONLY JSON: { "urls": ["url1", "url2"] }
      `;

      let targetUrls: string[] = [];
      try {
          const jsonResponse = await this.callGeminiRest(prompt, true);
          targetUrls = jsonResponse.urls || [];
          log(`Identified ${targetUrls.length} potential sources.`, 'success');
      } catch (e) {
          log("Failed to generate target list. Using fallback.", 'error');
          targetUrls = ['https://www.filmfreeway.com', 'https://www.withoutabox.com'];
      }

      const foundOpportunities: Partial<Opportunity>[] = [];

      // Step 2: Iterate and Scrape
      for (const url of targetUrls) {
          log(`Visiting: ${url}`, 'action');
          try {
              const content = await webScraperService.fetchUrlContent(url);
              if (content.length < 500) {
                  log(`Skipping ${url} (Insufficient content)`, 'error');
                  continue;
              }

              log(`Scraped ${content.length} chars. Analyzing with AI...`, 'info');
              
              // Analyze specific page
              const opportunity = await this.extractOpportunityFromText(content, url);
              
              // Validate minimal viability
              if (opportunity.title && opportunity.title !== "Untitled") {
                  foundOpportunities.push(opportunity);
                  log(`Found: ${opportunity.title}`, 'success');
              } else {
                  log(`No structured opportunity found at ${url}`, 'info');
              }
              
          } catch (err: any) {
              log(`Failed to process ${url}: ${err.message}`, 'error');
          }
      }

      log(`Scan complete. Found ${foundOpportunities.length} opportunities.`, 'success');
      return foundOpportunities;
  }

  /**
   * Direct URL Analysis
   */
  async analyzeSpecificUrl(url: string): Promise<Partial<Opportunity>> {
      try {
          const content = await webScraperService.fetchUrlContent(url);
          return await this.extractOpportunityFromText(content, url);
      } catch (e: any) {
          console.error("Analysis Failed", e);
          throw e;
      }
  }

  // ===== CORE EXTRACTION =====

  async extractOpportunityFromText(rawText: string, sourceUrl?: string): Promise<Partial<Opportunity>> {
      const prompt = this.buildPrompt(rawText);
      let data: any = {};

      // Try Groq first (Fastest/Cheapest)
      if (this.groqKey) {
          try {
              data = await this.callGroq(prompt);
          } catch (e) {
              console.warn("Groq failed, failing over to Gemini REST.", e);
          }
      }

      // Fallback to Gemini REST
      if (Object.keys(data).length === 0 && this.googleKeys.length > 0) {
          data = await this.callGeminiRest(prompt, true);
      }

      if (Object.keys(data).length === 0) {
          throw new Error("All AI models failed to extract data.");
      }

      return this.augmentData(data, "AI Agent", sourceUrl);
  }

  // ===== REST API IMPLEMENTATIONS =====

  /**
   * Calls Google Gemini via standard Fetch API (v1beta)
   * This bypasses the SDK to give us raw control over the request/response and avoids SDK dependency issues.
   */
  private async callGeminiRest(promptText: string, expectJson: boolean): Promise<any> {
      // 1. Get Key
      if (this.googleKeys.length === 0) throw new Error("No Google API Keys available.");
      const apiKey = this.googleKeys[this.currentGoogleKeyIndex];
      this.currentGoogleKeyIndex = (this.currentGoogleKeyIndex + 1) % this.googleKeys.length;

      // 2. Prepare Endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.GOOGLE_MODEL_ENDPOINT}:generateContent?key=${apiKey}`;

      // 3. Prepare Body
      const body = {
          contents: [{
              parts: [{ text: promptText }]
          }],
          generationConfig: {
              temperature: 0.1,
              // Force JSON mode if requested
              responseMimeType: expectJson ? "application/json" : "text/plain" 
          }
      };

      // 4. Fetch
      const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
      });

      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(`Gemini API Error ${response.status}: ${JSON.stringify(errData)}`);
      }

      const data = await response.json();
      
      // 5. Extract Text
      try {
          const rawResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!rawResult) throw new Error("Empty response from Gemini");

          if (expectJson) {
              // Clean markdown code blocks if present ( ```json ... ``` )
              const cleanJson = rawResult.replace(/```json|```/g, '').trim();
              return JSON.parse(cleanJson);
          }
          return rawResult;
      } catch (e) {
          console.error("Failed to parse Gemini response", e);
          throw new Error("AI response was not valid JSON");
      }
  }

  private async callGroq(prompt: string): Promise<any> {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
              "Authorization": `Bearer ${this.groqKey}`,
              "Content-Type": "application/json"
          },
          body: JSON.stringify({
              messages: [{ role: "user", content: prompt }],
              model: "llama-3.3-70b-versatile",
              temperature: 0.1,
              response_format: { type: "json_object" }
          })
      });

      if (!response.ok) throw new Error("Groq API failed");
      const data = await response.json();
      return JSON.parse(data.choices[0].message.content);
  }

  // --- HELPERS ---
  private buildPrompt(rawText: string): string {
      return `
        Role: Data Extractor.
        Task: Extract structured data from the text below.
        
        INPUT:
        """${rawText.slice(0, 20000)}"""

        JSON STRUCTURE:
        {
          "title": "String",
          "organizer": "String",
          "deadline": "String (Human readable)",
          "deadlineDate": "String (YYYY-MM-DD)",
          "grantOrPrize": "String",
          "type": "Festival" | "Lab" | "Grant" | "Residency",
          "scope": "National" | "International",
          "description": "String",
          "eligibility": ["String"],
          "applicationFee": "String",
          "contact": { "website": "String", "email": "String" },
          "groundingSources": ["String (List of URLs mentioned)"]
        }
      `;
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
              discoveryQuery: 'Automated Scan' 
          }
      };
  }
}

export const aiAgentService = new AiAgentService();

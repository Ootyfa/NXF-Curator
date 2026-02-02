import { Opportunity } from "../types";

export type SearchDomain = 'Film' | 'Visual Arts' | 'Music' | 'Literature' | 'Performing Arts' | 'Surprise Me';

export class AiAgentService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private lastRequestTime = 0;
  private keyLastUsedTime: Map<string, number> = new Map();
  private keyFailureCount: Map<string, number> = new Map();
  private readonly MIN_REQUEST_INTERVAL = 3000;
  private readonly KEY_COOLDOWN_PERIOD = 60000;

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
        
        this.apiKeys.forEach(key => {
            this.keyLastUsedTime.set(key, 0);
            this.keyFailureCount.set(key, 0);
        });
        
        if (this.apiKeys.length > 0) {
            console.log(`✅ AiAgentService initialized with ${this.apiKeys.length} API key(s): ${this.apiKeys.map(k => '...' + k.slice(-4)).join(', ')}`);
        } else {
            console.error('❌ No API keys found! Please check your environment variables.');
        }
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  private async enforceRateLimit(logCallback?: (msg: string) => void) {
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      
      if (timeSinceLast < this.MIN_REQUEST_INTERVAL) {
          const wait = this.MIN_REQUEST_INTERVAL - timeSinceLast;
          if (logCallback) logCallback(`⏳ Throttling: Waiting ${Math.round(wait/100)/10}s...`);
          await new Promise(r => setTimeout(r, wait));
      }
      this.lastRequestTime = Date.now();
  }

  private getBestAvailableKey(): string | null {
      if (this.apiKeys.length === 0) return null;
      
      const now = Date.now();
      let bestKey: string | null = null;
      let oldestUsageTime = Infinity;
      
      for (const key of this.apiKeys) {
          const lastUsed = this.keyLastUsedTime.get(key) || 0;
          const failures = this.keyFailureCount.get(key) || 0;
          
          if (failures > 0 && (now - lastUsed) < this.KEY_COOLDOWN_PERIOD) {
              const cooldownRemaining = Math.ceil((this.KEY_COOLDOWN_PERIOD - (now - lastUsed)) / 1000);
              console.log(`⏭️ Skipping key ...${key.slice(-4)} (cooldown: ${cooldownRemaining}s remaining)`);
              continue;
          }
          
          if (failures > 0 && (now - lastUsed) >= this.KEY_COOLDOWN_PERIOD) {
              this.keyFailureCount.set(key, 0);
          }
          
          if (lastUsed < oldestUsageTime) {
              oldestUsageTime = lastUsed;
              bestKey = key;
          }
      }
      
      if (bestKey) {
          this.keyLastUsedTime.set(bestKey, now);
          console.log(`🔑 Using key ...${bestKey.slice(-4)}`);
      }
      
      return bestKey;
  }

  private markKeyAsFailed(key: string) {
      const currentFailures = this.keyFailureCount.get(key) || 0;
      this.keyFailureCount.set(key, currentFailures + 1);
      console.log(`❌ Marked key ...${key.slice(-4)} as failed (failures: ${currentFailures + 1})`);
  }

  // ===== RAW API CALL (NO SDK) =====
  private async callGeminiAPI(
    apiKey: string,
    prompt: string,
    useGrounding: boolean = true
  ): Promise<any> {
      // Use v1 endpoint (NOT v1beta)
      const model = "gemini-1.5-flash-latest";
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
      
      const requestBody: any = {
          contents: [{
              role: "user",
              parts: [{ text: prompt }]
          }]
      };
      
      // Add grounding if requested
      if (useGrounding) {
          requestBody.tools = [{
              googleSearchRetrieval: {}
          }];
      }
      
      const response = await fetch(url, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      
      return await response.json();
  }

  private async executeWithRetry(
    prompt: string,
    logCallback: (msg: string) => void,
    useGrounding: boolean = true
  ): Promise<any> {
      
      if (this.apiKeys.length === 0) {
          throw new Error("No API Keys configured.");
      }

      const maxAttempts = Math.max(5, this.apiKeys.length * 2);
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const apiKey = this.getBestAvailableKey();
          
          if (!apiKey) {
              logCallback(`⏸️ All keys rate-limited. Waiting 10s...`);
              await new Promise(r => setTimeout(r, 10000));
              this.apiKeys.forEach(key => this.keyFailureCount.set(key, 0));
              continue;
          }

          try {
              await this.enforceRateLimit(logCallback);
              logCallback(`🚀 Attempt ${attempt}/${maxAttempts}...`);
              
              const result = await this.callGeminiAPI(apiKey, prompt, useGrounding);
              
              // Success!
              this.keyFailureCount.set(apiKey, 0);
              logCallback(`✅ Success with key ...${apiKey.slice(-4)}`);
              return result;

          } catch (error: any) {
              lastError = error;
              const msg = error.message || JSON.stringify(error);
              
              // Check for rate limiting
              if (msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED')) {
                   logCallback(`⚠️ Rate limited on key ...${apiKey.slice(-4)}`);
                   this.markKeyAsFailed(apiKey);
                   continue;
              }
              
              // Check for quota exceeded
              if (msg.includes('quota') || msg.includes('QUOTA_EXCEEDED')) {
                  logCallback(`⚠️ Quota exceeded on key ...${apiKey.slice(-4)}`);
                  this.markKeyAsFailed(apiKey);
                  continue;
              }
              
              // For other errors, log and retry
              console.warn(`⚠️ Error on attempt ${attempt}: ${msg}`);
              
              if (attempt === maxAttempts) {
                  throw new Error(`All attempts failed: ${msg}`);
              }
          }
      }
      
      throw new Error(`Request failed: ${lastError?.message || 'Unknown error'}`);
  }

  private normalizeUrl(url: string): string {
      try {
          return url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '').toLowerCase().split('?')[0];
      } catch {
          return url;
      }
  }

  private extractTextFromResponse(response: any): string {
      try {
          if (response.candidates && response.candidates[0]?.content?.parts) {
              const parts = response.candidates[0].content.parts;
              return parts.map((p: any) => p.text || '').join('');
          }
          return '';
      } catch {
          return '';
      }
  }

  private extractGroundingSources(response: any): Set<string> {
      const urls = new Set<string>();
      try {
          const metadata = response.candidates?.[0]?.groundingMetadata;
          if (metadata?.groundingChunks) {
              metadata.groundingChunks.forEach((chunk: any) => {
                  if (chunk.web?.uri) {
                      urls.add(chunk.web.uri);
                  }
              });
          }
      } catch (e) {
          console.warn('Could not extract grounding sources:', e);
      }
      return urls;
  }

  // ===== MAIN DISCOVERY FUNCTION =====
  async scanWeb(logCallback: (msg: string) => void, domain: SearchDomain): Promise<Opportunity[]> {
    const TODAY_STR = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    const CURRENT_YEAR = new Date().getFullYear();
    const TARGET_YEAR_1 = CURRENT_YEAR + 1;
    const TARGET_YEAR_2 = CURRENT_YEAR + 2;
    
    const searchStrategy = `"${domain}" artist grants India deadline ${TARGET_YEAR_1} ${TARGET_YEAR_2} open call`;
    logCallback(`🔍 SEARCHING: "${searchStrategy}"...`);

    const prompt = `Context: Today is ${TODAY_STR}.
Role: You are a research assistant finding opportunities for Indian artists.

Task: Find 10 active opportunities for Indian artists in ${domain}.

SEARCH FOR:
- Opportunities with deadlines in ${TARGET_YEAR_1} or ${TARGET_YEAR_2}
- Grants, residencies, festivals, competitions
- Open to Indian citizens or international applicants

IGNORE:
- Past deadlines (before ${TODAY_STR})
- Opportunities not open to Indians

Return ONLY valid JSON array (no markdown, no explanation):
[{
  "title": "Full opportunity name",
  "organizer": "Organization name",
  "deadline": "YYYY-MM-DD",
  "grantOrPrize": "Amount or 'See Website'",
  "type": "Grant|Residency|Festival|Competition",
  "description": "Brief description",
  "website": "URL"
}]`;

    try {
        const response = await this.executeWithRetry(prompt, logCallback, true);
        
        logCallback("✅ Data received. Processing...");

        // Extract grounding sources
        const verifiedUrls = this.extractGroundingSources(response);
        
        // Extract text
        const text = this.extractTextFromResponse(response);
        
        if (!text) {
            throw new Error('No text content in response');
        }

        // Parse JSON
        let rawData: any[] = [];
        try {
            rawData = JSON.parse(text);
        } catch {
            // Try to extract JSON from markdown
            const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (match) {
                rawData = JSON.parse(match[1] || match[0]);
            } else {
                throw new Error('Could not parse JSON from response');
            }
        }

        if (!Array.isArray(rawData)) {
            rawData = [rawData];
        }

        // Validate and convert to opportunities
        const validOpportunities: Opportunity[] = [];
        const today = new Date();

        rawData.forEach((item, index) => {
            if (!item.title || !item.deadline) return;
            
            let deadlineDate = new Date(item.deadline);
            if (isNaN(deadlineDate.getTime())) return;
            if (deadlineDate < today) return;
            
            const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const sourceUrl = item.website || (verifiedUrls.size > 0 ? Array.from(verifiedUrls)[0] : '');

            validOpportunities.push({
                id: `web-${Date.now()}-${index}`,
                title: item.title,
                organizer: item.organizer || "Unknown",
                deadline: item.deadline,
                deadlineDate: deadlineDate.toISOString().split('T')[0],
                daysLeft: daysLeft,
                grantOrPrize: item.grantOrPrize || "See Website",
                eligibility: ["Indian Citizens"],
                type: item.type || 'Grant',
                scope: 'National',
                category: domain,
                description: item.description || '',
                contact: { website: sourceUrl, email: "", phone: "" },
                verificationStatus: 'draft',
                sourceUrl: sourceUrl,
                groundingSources: Array.from(verifiedUrls),
                aiConfidenceScore: 85,
                aiReasoning: `Found via Google Search`,
                status: 'draft',
                createdAt: new Date().toISOString(),
                aiMetadata: {
                    model: 'Gemini-1.5-Flash',
                    discoveryQuery: searchStrategy,
                    discoveryDate: new Date().toISOString()
                }
            });
        });

        logCallback(`✅ Found ${validOpportunities.length} opportunities`);
        return validOpportunities;

    } catch (error: any) {
        logCallback(`❌ Search failed: ${error.message}`);
        throw error;
    }
  }

  // ===== URL ANALYZER =====
  async analyzeSpecificUrl(logCallback: (msg: string) => void, url: string): Promise<Opportunity[]> {
    logCallback(`🔍 Analyzing: ${url}`);
    
    const prompt = `Analyze this webpage: ${url}

Extract opportunity information and return ONLY JSON (no markdown, no explanation):
{
  "title": "Opportunity name",
  "organizer": "Organization",
  "deadline": "YYYY-MM-DD",
  "prize": "Amount or benefit",
  "type": "Grant|Residency|Festival|Competition",
  "description": "What this opportunity offers"
}`;

    try {
        const response = await this.executeWithRetry(prompt, logCallback, true);
        
        const text = this.extractTextFromResponse(response);
        
        if (!text) {
            throw new Error('No text content in response');
        }

        let data: any = {};
        try {
            data = JSON.parse(text);
        } catch {
            const match = text.match(/\{[\s\S]*\}/);
            if (match) data = JSON.parse(match[0]);
        }
        
        if (!data.title) {
            try {
                const urlObj = new URL(url);
                data.title = urlObj.pathname.split('/').pop()?.replace(/-/g, ' ') || "Untitled";
            } catch {
                data.title = "Untitled";
            }
        }

        return [{
            id: `url-${Date.now()}`,
            title: data.title || "Unknown",
            organizer: data.organizer || "Unknown",
            deadline: data.deadline || "See Website",
            daysLeft: 30,
            grantOrPrize: data.prize || "See Website",
            type: data.type || "Grant",
            scope: "National",
            description: data.description || "Imported from URL",
            contact: { website: url, email: "", phone: "" },
            verificationStatus: 'draft',
            sourceUrl: url,
            groundingSources: [url],
            eligibility: [],
            status: 'draft',
            createdAt: new Date().toISOString(),
            aiConfidenceScore: 80,
            aiReasoning: "Direct URL analysis",
            aiMetadata: { 
                model: 'Gemini-1.5-Flash',
                discoveryQuery: url, 
                discoveryDate: new Date().toISOString() 
            }
        }];

    } catch (error: any) {
        logCallback(`❌ Analysis failed: ${error.message}`);
        throw error;
    }
  }
}

export const aiAgentService = new AiAgentService();
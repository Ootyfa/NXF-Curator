import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Opportunity } from "../types";

export class AiAgentService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;

  // Use specific model versions to avoid 404 errors with aliases in v1beta
  private readonly PRIMARY_MODEL = "gemini-1.5-flash-002";
  private readonly FALLBACK_MODEL = "gemini-2.0-flash-exp"; 

  constructor() {
    try {
        const env = (import.meta as any).env || {};
        // Support multiple environment variables and comma-separated keys
        const potentialVars = [
            env.VITE_GOOGLE_API_KEY,          
            env.GOOGLE_API_KEY,
            (typeof process !== 'undefined' ? process.env?.API_KEY : '')
        ];
        
        const foundKeys = new Set<string>();
        potentialVars.forEach(val => {
            if (val && typeof val === 'string') {
                val.split(',').forEach(k => {
                    const clean = k.trim();
                    if (clean) foundKeys.add(clean);
                });
            }
        });

        this.apiKeys = Array.from(foundKeys);
        
        if (this.apiKeys.length === 0) {
            console.warn("AiAgentService: No API keys found. Please set VITE_GOOGLE_API_KEY.");
        } else {
            console.log(`AiAgentService: Loaded ${this.apiKeys.length} API key(s).`);
        }
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  /**
   * Get the next API key in the rotation.
   */
  private getNextKey(): string {
      if (this.apiKeys.length === 0) throw new Error("No API Keys configured");
      const key = this.apiKeys[this.currentKeyIndex];
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      return key;
  }

  // ===== CORE FUNCTION: RAW TEXT -> JSON =====
  async extractOpportunityFromText(rawText: string): Promise<Partial<Opportunity>> {
      // Schema definition for structured JSON output
      const schema: Schema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          organizer: { type: Type.STRING },
          deadline: { type: Type.STRING, description: "Human readable deadline e.g. March 15, 2025" },
          deadlineDate: { type: Type.STRING, description: "ISO Date YYYY-MM-DD" },
          grantOrPrize: { type: Type.STRING, description: "Value of the opportunity" },
          type: { type: Type.STRING, enum: ['Grant', 'Residency', 'Festival', 'Lab'] },
          scope: { type: Type.STRING, enum: ['National', 'International'] },
          description: { type: Type.STRING },
          eligibility: { type: Type.ARRAY, items: { type: Type.STRING } },
          applicationFee: { type: Type.STRING },
          contact: { 
              type: Type.OBJECT,
              properties: {
                  website: { type: Type.STRING },
                  email: { type: Type.STRING }
              }
          }
        },
        required: ["title", "organizer", "type"]
      };

      const prompt = `
        Role: Data Extractor for an Arts Funding Database (NXF Curator).
        Task: Extract structured data from the unstructured text below.
        
        INPUT TEXT:
        """
        ${rawText.slice(0, 30000)}
        """

        INSTRUCTIONS:
        1. Extract the following fields based on the schema.
        2. If a field is missing, use null or "TBD".
        3. 'deadline' should be a human readable string (e.g. "March 20, 2025").
        4. 'deadlineDate' MUST be YYYY-MM-DD.
      `;

      // Execute with smart retry logic handling 404s and 429s
      return this.executeWithSmartRetry(async (apiKey, modelId) => {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
              model: modelId,
              contents: prompt,
              config: {
                  responseMimeType: 'application/json',
                  responseSchema: schema
              }
          });
          return response.text;
      });
  }

  /**
   * Executes an operation with:
   * 1. Round-robin key rotation
   * 2. Exponential backoff
   * 3. Model fallback on 404
   */
  private async executeWithSmartRetry(
      operation: (apiKey: string, modelId: string) => Promise<string | undefined>
  ): Promise<Partial<Opportunity>> {
      let lastError: any;
      const MAX_ATTEMPTS = 5;
      
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const apiKey = this.getNextKey();
          
          try {
              let text: string | undefined;
              let usedModel = this.PRIMARY_MODEL;

              try {
                  text = await operation(apiKey, this.PRIMARY_MODEL);
              } catch (err: any) {
                  // Handle Model Not Found (404) specifically by trying fallback model
                  if (this.isModelNotFoundError(err)) {
                      console.warn(`AiAgent: Model ${this.PRIMARY_MODEL} not found/supported. Retrying with ${this.FALLBACK_MODEL}`);
                      usedModel = this.FALLBACK_MODEL;
                      text = await operation(apiKey, this.FALLBACK_MODEL);
                  } else {
                      throw err; // Re-throw for outer catch to handle quota/rotation
                  }
              }

              if (!text) throw new Error("Empty response from AI");
              
              const parsed = JSON.parse(text);
              return this.augmentData(parsed, usedModel);

          } catch (error: any) {
              lastError = error;
              console.warn(`AiAgent: Attempt ${attempt} failed (Key ending ...${apiKey.slice(-4)}): ${error.message}`);

              const isQuota = this.isQuotaError(error);
              
              if (attempt === MAX_ATTEMPTS) break;

              // Backoff Strategy
              // If it's a quota error, we've already rotated the key for the next loop (via getNextKey)
              // We add a delay to allow the system to recover or to just space out requests.
              let backoff = 1000;
              if (isQuota) {
                   // Exponential backoff for quota errors: 1s, 2s, 4s, 8s
                   backoff = Math.pow(2, attempt - 1) * 1000;
              } else {
                   // Shorter backoff for transient network errors
                   backoff = 500;
              }
              
              await new Promise(r => setTimeout(r, backoff));
          }
      }

      throw lastError || new Error("Failed to extract opportunity after multiple attempts. All keys/models may be exhausted.");
  }

  private isQuotaError(error: any): boolean {
      const msg = error.message?.toLowerCase() || '';
      return error.status === 429 || error.status === 503 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted');
  }

  private isModelNotFoundError(error: any): boolean {
       const msg = error.message?.toLowerCase() || '';
       return error.status === 404 || msg.includes('404') || msg.includes('not found');
  }

  private augmentData(parsed: any, model: string): Partial<Opportunity> {
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
          verificationStatus: 'verified',
          status: 'published',
          createdAt: new Date().toISOString(),
          aiConfidenceScore: 100,
          aiMetadata: { model: model, discoveryDate: new Date().toISOString(), discoveryQuery: 'Manual Paste' }
      };
  }
}

export const aiAgentService = new AiAgentService();

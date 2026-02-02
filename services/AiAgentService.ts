import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Opportunity } from "../types";

export class AiAgentService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  
  // REVISED MODEL STRATEGY: 
  // Use high-level aliases instead of specific versions (like -001) to avoid 404s.
  private readonly MODELS = [
    "gemini-1.5-flash",      // Standard stable alias
    "gemini-2.0-flash-exp",  // Latest experimental (often very fast)
    "gemini-1.5-pro",        // Reliable backup
    "gemini-1.5-flash-8b"    // Lightweight backup
  ];

  constructor() {
    try {
        const env = (import.meta as any).env || {};
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
            console.log(`AiAgentService: Initialized with ${this.apiKeys.length} API key(s).`);
        }
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  // ===== CORE FUNCTION: RAW TEXT -> JSON =====
  async extractOpportunityFromText(rawText: string): Promise<Partial<Opportunity>> {
      // Define schema
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

      return this.executeWithSmartRetry(async (apiKey, modelId) => {
          const ai = new GoogleGenAI({ apiKey });
          
          try {
            // Attempt 1: Strict JSON Schema
            const response = await ai.models.generateContent({
                model: modelId,
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            });
            return response.text;
          } catch (innerError: any) {
             // Attempt 2: Loose JSON (if Schema fails with 400 or generic error)
             // Some models/endpoints don't support Schema perfectly yet
             if (innerError.message?.includes('400') || innerError.message?.includes('schema') || innerError.message?.includes('found')) {
                 console.warn(`Schema/Model issue for ${modelId}, retrying with loose JSON...`);
                 const looseResponse = await ai.models.generateContent({
                    model: modelId,
                    contents: prompt + "\n\nOutput strictly valid JSON.",
                    config: { responseMimeType: 'application/json' }
                 });
                 return looseResponse.text;
             }
             throw innerError;
          }
      });
  }

  /**
   * Smart Execution Strategy:
   * - 404 (Not Found) -> Change MODEL
   * - 429 (Quota) -> Change KEY
   * - 403 (Auth) -> Change KEY
   */
  private async executeWithSmartRetry(
      operation: (apiKey: string, modelId: string) => Promise<string | undefined>
  ): Promise<Partial<Opportunity>> {
      
      let lastError: any;
      const MAX_TOTAL_ATTEMPTS = 12; 
      
      let modelIndex = 0;
      
      for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
          if (this.apiKeys.length === 0) throw new Error("No API keys available.");

          const apiKey = this.apiKeys[this.currentKeyIndex]; 
          const modelId = this.MODELS[modelIndex];

          try {
              const text = await operation(apiKey, modelId);
              
              if (!text) throw new Error("Empty response from AI");
              
              const parsed = JSON.parse(text);
              return this.augmentData(parsed, modelId);

          } catch (error: any) {
              lastError = error;
              const msg = error.message?.toLowerCase() || '';
              const status = error.status || 0;

              // Error Classification
              const isQuota = status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted');
              const isModelError = status === 404 || msg.includes('404') || msg.includes('not found') || msg.includes('unsupported');
              const isAuthError = status === 403 || msg.includes('key') || msg.includes('permission');

              console.warn(`[AiAgent] Attempt ${attempt} Failed. Key:...${apiKey.slice(-4)} | Model:${modelId} | Error:${msg}`);

              if (attempt === MAX_TOTAL_ATTEMPTS) break;

              if (isModelError) {
                  // Strategy: Model is broken/missing. Try NEXT MODEL. Keep key.
                  modelIndex = (modelIndex + 1) % this.MODELS.length;
                  // If we cycled back to start, trigger a key rotation just in case
                  if (modelIndex === 0) this.rotateKey();
                  await this.delay(500);
              } 
              else if (isQuota) {
                  // Strategy: Key is exhausted. Try NEXT KEY. Keep model.
                  this.rotateKey();
                  await this.delay(1000 * Math.pow(1.5, attempt)); // Backoff
              } 
              else if (isAuthError) {
                  // Strategy: Key is invalid. Try NEXT KEY.
                  this.rotateKey();
                  await this.delay(500);
              }
              else {
                  // Strategy: Unknown error. Change BOTH.
                  modelIndex = (modelIndex + 1) % this.MODELS.length;
                  this.rotateKey();
                  await this.delay(2000);
              }
          }
      }

      throw lastError || new Error("Failed to extract opportunity after multiple attempts.");
  }

  private rotateKey() {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
  }

  private delay(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
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

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Opportunity } from "../types";

export class AiAgentService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  
  // List of models to try in order. 
  // If one fails with 404 (Not Found) or 503 (Overloaded), we try the next.
  private readonly MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-flash-002",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro",
    "gemini-1.5-flash-8b"
  ];

  constructor() {
    try {
        const env = (import.meta as any).env || {};
        // Support multiple environment variables and comma-separated keys for pool management
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

  private getNextKey(): string {
      if (this.apiKeys.length === 0) throw new Error("No API Keys configured");
      const key = this.apiKeys[this.currentKeyIndex];
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      return key;
  }

  // ===== CORE FUNCTION: RAW TEXT -> JSON =====
  async extractOpportunityFromText(rawText: string): Promise<Partial<Opportunity>> {
      // Define strictly typed schema for the AI response
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

      // Execute with robustness strategy
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
   * Smart Execution Strategy:
   * 1. Iterates through attempts.
   * 2. If 404 (Model Not Found) -> Switches to next Model in list.
   * 3. If 429 (Quota) -> Switches to next API Key.
   * 4. If other error -> Retries with backoff.
   */
  private async executeWithSmartRetry(
      operation: (apiKey: string, modelId: string) => Promise<string | undefined>
  ): Promise<Partial<Opportunity>> {
      
      let lastError: any;
      const MAX_TOTAL_ATTEMPTS = 8; // Allow enough tries for model switching AND key rotation
      let currentModelIndex = 0;

      for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
          // Get current key (rotates only on specific triggers or natural round-robin if desired, 
          // here we assume getNextKey() gives us the current one to use)
          const apiKey = this.apiKeys[this.currentKeyIndex]; 
          const modelId = this.MODELS[currentModelIndex];

          try {
              const text = await operation(apiKey, modelId);
              
              if (!text) throw new Error("Empty response from AI");
              
              const parsed = JSON.parse(text);
              return this.augmentData(parsed, modelId);

          } catch (error: any) {
              lastError = error;
              const msg = error.message?.toLowerCase() || '';
              const isQuota = error.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted');
              const isModelError = error.status === 404 || msg.includes('404') || msg.includes('not found') || msg.includes('unsupported');

              console.warn(`AiAgent Attempt ${attempt} failed | Key: ...${apiKey.slice(-4)} | Model: ${modelId} | Error: ${msg}`);

              if (attempt === MAX_TOTAL_ATTEMPTS) break;

              if (isModelError) {
                  // Strategy: Try next model
                  console.warn(`-> Model ${modelId} failed. Switching model.`);
                  currentModelIndex = (currentModelIndex + 1) % this.MODELS.length;
                  // Don't sleep long for 404s, just try next config
                  await new Promise(r => setTimeout(r, 500));
              } else if (isQuota) {
                  // Strategy: Rotate Key
                  console.warn(`-> Quota exceeded. Rotating API Key.`);
                  this.getNextKey(); // Advances index
                  // Exponential backoff
                  const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
                  await new Promise(r => setTimeout(r, backoff));
              } else {
                  // Strategy: Transient error, wait and retry (maybe rotate key too just in case)
                  this.getNextKey(); 
                  await new Promise(r => setTimeout(r, 2000));
              }
          }
      }

      throw lastError || new Error("Failed to extract opportunity after multiple attempts. All keys/models may be exhausted.");
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

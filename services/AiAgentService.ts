import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Opportunity } from "../types";

export class AiAgentService {
  private googleKeys: string[] = [];
  private groqKey: string = "";
  private currentGoogleKeyIndex = 0;
  
  // FIXED MODELS - No Arrays, No Experimental Versions
  private readonly GROQ_MODEL = "llama-3.3-70b-versatile"; 
  private readonly GOOGLE_MODEL = "gemini-1.5-flash"; 

  constructor() {
    this.reloadKeys();
  }

  public reloadKeys() {
    try {
        const env = (import.meta as any).env || {};
        
        // 1. Load Groq Key
        this.groqKey = env.VITE_GROQ_API_KEY || "";

        // 2. Load Google Keys
        const potentialGoogleVars = [
            env.VITE_GOOGLE_API_KEY,          
            env.GOOGLE_API_KEY
        ];
        
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
        console.log(`AiAgentService: Loaded. Groq=${!!this.groqKey}, GoogleKeys=${this.googleKeys.length}`);
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  // Debugging helper to show on frontend
  public getDebugInfo() {
      return {
          groqStatus: this.groqKey ? 'Active' : 'Missing (Check VITE_GROQ_API_KEY)',
          googleKeys: this.googleKeys.length,
          activeGoogleModel: this.GOOGLE_MODEL,
          activeGroqModel: this.GROQ_MODEL
      };
  }

  // ===== CORE FUNCTION =====
  async extractOpportunityFromText(rawText: string): Promise<Partial<Opportunity>> {
      const prompt = this.buildPrompt(rawText);

      // STRATEGY 1: Groq (Preferred)
      if (this.groqKey) {
          try {
              return await this.callGroq(prompt);
          } catch (e: any) {
              console.warn("AiAgent: Groq failed, failing over to Gemini.", e);
          }
      }

      // STRATEGY 2: Google Gemini (Fallback)
      if (this.googleKeys.length > 0) {
          return this.callGemini(prompt);
      }

      throw new Error("No working API keys found. Please add VITE_GROQ_API_KEY or VITE_GOOGLE_API_KEY to Netlify.");
  }

  // --- GROQ IMPLEMENTATION ---
  private async callGroq(prompt: string): Promise<Partial<Opportunity>> {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
              "Authorization": `Bearer ${this.groqKey}`,
              "Content-Type": "application/json"
          },
          body: JSON.stringify({
              messages: [
                  { 
                    role: "system", 
                    content: "You are a specialized Data Extraction AI. Output ONLY valid JSON." 
                  },
                  { 
                    role: "user", 
                    content: prompt 
                  }
              ],
              model: this.GROQ_MODEL,
              temperature: 0.1,
              response_format: { type: "json_object" }
          })
      });

      if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Groq API returned ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const jsonContent = data.choices[0]?.message?.content || "{}";
      return this.augmentData(JSON.parse(jsonContent), "Groq Llama 3");
  }

  // --- GEMINI IMPLEMENTATION ---
  private async callGemini(prompt: string): Promise<Partial<Opportunity>> {
      // Rotate keys
      const apiKey = this.googleKeys[this.currentGoogleKeyIndex];
      this.currentGoogleKeyIndex = (this.currentGoogleKeyIndex + 1) % this.googleKeys.length;

      const schema: Schema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          organizer: { type: Type.STRING },
          deadline: { type: Type.STRING },
          deadlineDate: { type: Type.STRING },
          grantOrPrize: { type: Type.STRING },
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

      const ai = new GoogleGenAI({ apiKey });
      
      try {
          const result = await ai.models.generateContent({
              model: this.GOOGLE_MODEL, // Using gemini-1.5-flash
              contents: prompt,
              config: {
                  responseMimeType: 'application/json',
                  responseSchema: schema
              }
          });

          return this.augmentData(JSON.parse(result.text), "Gemini Flash");
      } catch (e: any) {
          // If 404 occurs here, it means the model string is wrong.
          // Since we hardcoded 'gemini-1.5-flash', this should be impossible unless Google is down.
          console.error("Gemini Error:", e);
          throw new Error(`Gemini Error: ${e.message}`);
      }
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
          "contact": { "website": "String", "email": "String" }
        }
      `;
  }

  private augmentData(parsed: any, modelName: string): Partial<Opportunity> {
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
          aiMetadata: { model: modelName, discoveryDate: new Date().toISOString(), discoveryQuery: 'Manual Paste' }
      };
  }
}

export const aiAgentService = new AiAgentService();

import { Opportunity } from "../types";

export class AiAgentService {
  private apiKeys: string[] = [];

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
        
        if (this.apiKeys.length === 0) {
            console.warn("AiAgentService: No API keys found.");
        }
    } catch (e) {
        console.error("Failed to load keys", e);
    }
  }

  private getApiKey(): string {
      if (this.apiKeys.length === 0) return '';
      return this.apiKeys[0];
  }

  // ===== CORE FUNCTION: RAW TEXT -> JSON =====
  async extractOpportunityFromText(rawText: string): Promise<Partial<Opportunity>> {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error("No API Key configured");

      // Using v1beta to ensure stability with gemini-1.5-flash as requested
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      
      const prompt = `
        Role: Data Extractor for an Arts Funding Database (NXF Curator).
        Task: Extract structured data from the unstructured text below.
        
        INPUT TEXT:
        """
        ${rawText.slice(0, 30000)}
        """

        INSTRUCTIONS:
        1. Extract the following fields.
        2. If a field is missing, use null or "TBD".
        3. 'deadline' should be a human readable string (e.g. "March 20, 2025").
        4. 'deadlineDate' MUST be YYYY-MM-DD.
        5. 'type' must be one of: Grant, Residency, Festival, Lab.
        6. 'eligibility' should be an array of short strings (e.g. ["Indian Citizens", "Filmmakers"]).

        RETURN JSON ONLY:
        {
          "title": "String",
          "organizer": "String",
          "deadline": "String",
          "deadlineDate": "YYYY-MM-DD",
          "grantOrPrize": "String (e.g. ₹5,00,000)",
          "type": "Grant|Residency|Festival|Lab",
          "scope": "National|International",
          "description": "String (Summary)",
          "eligibility": ["String"],
          "applicationFee": "String",
          "contact": { "website": "String", "email": "String" }
        }
      `;

      try {
          const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }]
              })
          });

          if (!response.ok) {
              const err = await response.text();
              throw new Error(`Gemini API Error: ${err}`);
          }

          const data = await response.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!candidate) throw new Error("No response from AI");

          // Clean markdown
          const jsonStr = candidate.replace(/```json/g, '').replace(/```/g, '').trim();
          let parsed;
          try {
              parsed = JSON.parse(jsonStr);
          } catch (e) {
              console.error("Failed to parse JSON", jsonStr);
              throw new Error("AI returned invalid JSON");
          }

          // Calculate Days Left
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
              aiMetadata: { model: 'Gemini-1.5-Flash', discoveryDate: new Date().toISOString(), discoveryQuery: 'Manual Paste' }
          };

      } catch (error) {
          console.error("AI Extraction Failed:", error);
          throw error;
      }
  }
}

export const aiAgentService = new AiAgentService();
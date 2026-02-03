import { Opportunity } from "../types";
import { geminiCall, safeParseJSON } from "./GeminiClient";

// ============================================================
// SIMPLE TEXT PARSER SERVICE
// No crawling. No agents. Just formatting text into JSON.
// ============================================================
export class AiAgentService {
  
  /**
   * Takes raw pasted text and organizes it into the Opportunity structure.
   */
  async parseOpportunityText(rawText: string): Promise<Partial<Opportunity>> {
      if (!rawText || rawText.trim().length < 10) {
          throw new Error("Please paste some content first.");
      }

      const prompt = `
      Analyze the following text and extract opportunity details.
      
      Return a SINGLE JSON object with these exact keys:
      {
        "title": "Name of the grant/festival",
        "organizer": "Who is organizing it",
        "deadline": "YYYY-MM-DD" (if not found, guess based on context or use today + 30 days),
        "grantOrPrize": "Value or Award details",
        "type": "Grant" or "Residency" or "Festival" or "Lab",
        "description": "Short summary (max 3 sentences)",
        "eligibility": ["List", "of", "requirements"],
        "website": "URL if found in text, else empty string"
      }

      RAW TEXT TO ANALYZE:
      """
      ${rawText.substring(0, 30000)}
      """
      `;

      try {
          // We use geminiCall strictly for its text-processing ability
          const { text } = await geminiCall(prompt, { grounding: false });
          const data = safeParseJSON<any>(text);
          
          if (!data) throw new Error("Could not organize text. Please try again.");

          // Format Date
          let deadlineDate = data.deadline;
          // specific check if it's a valid date string, else default
          if (!deadlineDate || isNaN(new Date(deadlineDate).getTime())) {
              deadlineDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
          }

          const deadlineObj = new Date(deadlineDate);
          const daysLeft = Math.ceil((deadlineObj.getTime() - Date.now()) / 86400000);

          // Return structured object mapped to our App's type
          return {
              title: data.title || "Untitled Opportunity",
              organizer: data.organizer || "Unknown Organizer",
              deadline: deadlineObj.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' }),
              deadlineDate: deadlineDate,
              daysLeft: daysLeft > 0 ? daysLeft : 0,
              grantOrPrize: data.grantOrPrize || "See Details",
              type: data.type || "Grant",
              description: data.description || "",
              eligibility: Array.isArray(data.eligibility) ? data.eligibility : [],
              contact: { website: data.website || "", email: "", phone: "" },
              verificationStatus: "verified", // Admin is manually adding it, so it's verified
              status: "published",
              createdAt: new Date().toISOString(),
              aiConfidenceScore: 100,
              aiReasoning: "Manual Admin Entry",
              sourceUrl: data.website || ""
          };

      } catch (e: any) {
          console.error("Parse Error", e);
          throw new Error("Failed to parse text: " + e.message);
      }
  }

  // Debug helper
  public getDebugInfo() {
      return { status: "Manual Mode Active" };
  }
}

export const aiAgentService = new AiAgentService();

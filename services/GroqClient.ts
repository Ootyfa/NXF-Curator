
// ============================================================
// GroqClient.ts
//
// SINGLE source of truth for Groq API calls.
// Uses Llama-3.3-70b-versatile for high quality parsing.
// ============================================================

const BASE = "https://api.groq.com/openai/v1/chat/completions";

// ------------------------------------------------------------
// KEY MANAGER (Singleton)
// ------------------------------------------------------------
class KeyManager {
  private keys: string[] = [];
  private static instance: KeyManager;

  private constructor() {
    try {
        const env = (import.meta as any).env || {};
        const raw = env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || "";
        this.keys = raw
          .split(",")
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0);
    } catch(e) {
        console.error("KeyManager Error:", e);
    }
  }

  static get(): KeyManager {
    if (!KeyManager.instance) KeyManager.instance = new KeyManager();
    return KeyManager.instance;
  }

  pick(): string | null {
    if (this.keys.length === 0) return null;
    // Simple rotation or random pick
    return this.keys[Math.floor(Math.random() * this.keys.length)];
  }

  count() {
    return this.keys.length;
  }
}

// ------------------------------------------------------------
// EXPORTED HELPERS
// ------------------------------------------------------------
export function safeParseJSON<T>(text: string): T | null {
  if (!text) return null;
  
  // 1. Try direct parse
  try { return JSON.parse(text) as T; } catch {}

  // 2. Try markdown code blocks
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (mdMatch) { try { return JSON.parse(mdMatch[1]) as T; } catch {} }

  // 3. Try finding first { and last }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
      try { return JSON.parse(text.substring(start, end + 1)) as T; } catch {}
  }

  return null;
}

// ------------------------------------------------------------
// MAIN CALL
// ------------------------------------------------------------
export async function groqCall(
  prompt: string,
  options: { jsonMode?: boolean; log?: (msg: string) => void } = {}
): Promise<{ text: string; usedModel: string }> {
  const km = KeyManager.get();
  if (km.count() === 0) throw new Error("No Groq API keys found. Please check .env file.");

  const log = options.log || (() => {});
  const key = km.pick();
  
  if (!key) throw new Error("Failed to retrieve API Key");

  // Model Selection: Llama 3.3 is excellent for instruction following
  const model = "llama-3.3-70b-versatile";

  try {
    const body: any = {
      model: model,
      messages: [
          { role: "system", content: "You are a helpful data extraction assistant. You output strict JSON when asked." },
          { role: "user", content: prompt }
      ],
      temperature: 0.1, // Low temp for deterministic data extraction
    };

    if (options.jsonMode) {
        body.response_format = { type: "json_object" };
    }

    const res = await fetch(BASE, {
      method: "POST",
      headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Groq API Error (${res.status}): ${txt}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";

    return { text: content, usedModel: model };

  } catch (err: any) {
    throw new Error(`Groq Call Failed: ${err.message}`);
  }
}

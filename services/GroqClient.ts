// ============================================================
// GroqClient.ts
//
// SINGLE source of truth for Groq API calls.
// Now supports model selection for performance vs quality.
// Includes Rate Limiting and Backoff strategies.
// ============================================================

const BASE = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_MODELS = {
  FAST: "llama-3.1-8b-instant",     // Good for simple summaries, chat
  QUALITY: "llama-3.3-70b-versatile" // Best for complex extraction, JSON
};

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ------------------------------------------------------------
// MAIN CALL
// ------------------------------------------------------------
export interface GroqOptions {
  jsonMode?: boolean;
  log?: (msg: string) => void;
  model?: string; // Override default model
  temperature?: number;
  topP?: number;
}

export async function groqCall(
  prompt: string,
  options: GroqOptions = {}
): Promise<{ text: string; usedModel: string }> {
  const km = KeyManager.get();
  if (km.count() === 0) throw new Error("No Groq API keys found. Please check .env file.");

  // Intelligent Model Selection:
  // If jsonMode is true, we likely need the reasoning/extraction power of 70b (QUALITY).
  // Otherwise, we default to 8b (FAST) for speed and efficiency.
  const defaultModel = options.jsonMode ? GROQ_MODELS.QUALITY : GROQ_MODELS.FAST;
  const model = options.model || defaultModel;

  // Parameter Tuning
  // For QUALITY/Extraction tasks (Llama 3.3 70b), we want high determinism (low temp)
  // For FAST/Creative tasks (Llama 3.1 8b), we can allow slightly more freedom
  const defaultTemp = model === GROQ_MODELS.QUALITY ? 0.0 : 0.6;
  const temperature = options.temperature ?? defaultTemp;
  const topP = options.topP ?? 0.9;

  let attempt = 0;
  const maxRetries = 3;
  let lastError: any;

  while (attempt <= maxRetries) {
    const key = km.pick();
    if (!key) throw new Error("Failed to retrieve API Key");

    try {
      const body: any = {
        model: model,
        messages: [
            { role: "system", content: "You are a helpful data extraction assistant. You output strict JSON when asked." },
            { role: "user", content: prompt }
        ],
        temperature: temperature,
        top_p: topP
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

      // Handle Rate Limiting (429)
      if (res.status === 429) {
          const retryAfterHeader = res.headers.get("Retry-After");
          let waitTime = 2000 * Math.pow(2, attempt); // Default exponential backoff: 2s, 4s, 8s, 16s
          
          if (retryAfterHeader) {
             const seconds = parseInt(retryAfterHeader, 10);
             if (!isNaN(seconds)) waitTime = seconds * 1000;
          }
          
          // Cap wait time at 30 seconds to avoid hanging too long
          waitTime = Math.min(waitTime, 30000);

          if (options.log) options.log(`Rate limit hit. Retrying in ${Math.round(waitTime/1000)}s...`);
          console.warn(`[Groq] Rate Limit 429. Retrying in ${waitTime}ms...`);
          
          await delay(waitTime);
          attempt++;
          continue;
      }

      if (!res.ok) {
          // If server error (5xx), we retry. If client error (4xx), we throw unless it's 429 handled above.
          if (res.status >= 500) {
              console.warn(`[Groq] Server Error ${res.status}. Retrying...`);
              await delay(1000 * Math.pow(2, attempt));
              attempt++;
              continue;
          }

          const txt = await res.text();
          throw new Error(`Groq API Error (${res.status}): ${txt}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || "";

      return { text: content, usedModel: model };

    } catch (err: any) {
      lastError = err;
      console.warn(`[Groq] Attempt ${attempt + 1} failed: ${err.message}`);
      
      // Stop retrying on auth errors
      if (err.message.includes("401") || err.message.includes("403")) {
         throw err; 
      }

      const backoff = 1000 * Math.pow(2, attempt);
      await delay(backoff);
      attempt++;
    }
  }

  throw new Error(`Groq Call Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

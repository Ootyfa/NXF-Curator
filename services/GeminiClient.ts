
// ============================================================
// GeminiClient.ts
//
// SINGLE source of truth for all Gemini API calls.
// Robust: Falls back to known models if discovery fails.
// Zero SDK. Pure fetch().
// ============================================================

const BASE = "https://generativelanguage.googleapis.com";

// ------------------------------------------------------------
// KEY MANAGER (Singleton)
// ------------------------------------------------------------
class KeyManager {
  private keys: string[] = [];
  private cooldownUntil: Map<string, number> = new Map();
  private lastUsedAt: Map<string, number> = new Map();
  private static instance: KeyManager;

  private constructor() {
    try {
        const env = (import.meta as any).env || {};
        const raw = env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY || "";
        this.keys = raw
          .split(",")
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0);
        
        this.keys.forEach((k) => {
          this.cooldownUntil.set(k, 0);
          this.lastUsedAt.set(k, 0);
        });
    } catch(e) {
        console.error("KeyManager Error:", e);
    }
  }

  static get(): KeyManager {
    if (!KeyManager.instance) KeyManager.instance = new KeyManager();
    return KeyManager.instance;
  }

  pick(): string | null {
    const now = Date.now();
    let best: string | null = null;
    let bestTime = Infinity;
    for (const key of this.keys) {
      if ((this.cooldownUntil.get(key) || 0) > now) continue;
      const t = this.lastUsedAt.get(key) || 0;
      if (t < bestTime) {
        bestTime = t;
        best = key;
      }
    }
    if (best) this.lastUsedAt.set(best, now);
    return best;
  }

  setCooldown(key: string, seconds = 60) {
    this.cooldownUntil.set(key, Date.now() + seconds * 1000);
  }

  resetAll() {
    this.keys.forEach((k) => this.cooldownUntil.set(k, 0));
  }

  count() {
    return this.keys.length;
  }
}

// ------------------------------------------------------------
// MODEL DISCOVERY
// ------------------------------------------------------------
let discoveredModel: string | null = null;
let discoveredEndpoint: string | null = null;

async function ensureModel(key: string, log: (msg: string) => void): Promise<void> {
  if (discoveredModel && discoveredEndpoint) return;

  log("🔍 Connecting to Gemini...");

  const endpoints = ["v1beta", "v1"];
  
  // 1. Try to list models (Best case: find the newest model)
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE}/${ep}/models?key=${key}`);
      if (res.ok) {
        const json = await res.json();
        const models: string[] = (json.models || []).map((m: any) => m.name);
        
        // Priority List
        const priority = [
          "models/gemini-2.0-flash",
          "models/gemini-1.5-flash",
          "models/gemini-1.5-pro",
        ];

        for (const p of priority) {
          if (models.includes(p)) {
            discoveredModel = p.replace("models/", "");
            discoveredEndpoint = ep;
            return;
          }
        }
        
        // Fallback to any flash
        const flash = models.find(m => m.includes("flash"));
        if (flash) {
            discoveredModel = flash.replace("models/", "");
            discoveredEndpoint = ep;
            return;
        }
      }
    } catch (e) {
      // Ignore network errors here, we'll hit fallback
    }
  }

  // 2. FALLBACK: If ListModels failed (e.g. key has no list permission), 
  // assume gemini-1.5-flash exists on v1beta.
  discoveredModel = "gemini-1.5-flash";
  discoveredEndpoint = "v1beta";
}

// ------------------------------------------------------------
// EXPORTED HELPERS
// ------------------------------------------------------------
export function getDebugConfig() {
    return {
        keyCount: KeyManager.get().count(),
        model: discoveredModel ? `${discoveredModel} (${discoveredEndpoint})` : "Not initialized"
    };
}

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
export async function geminiCall(
  prompt: string,
  options: { grounding?: boolean; log?: (msg: string) => void } = {}
): Promise<{ text: string; sources: string[]; usedModel: string }> {
  const km = KeyManager.get();
  if (km.count() === 0) throw new Error("No API keys found. Please check .env file.");

  const log = options.log || (() => {});
  const maxAttempts = 3; // Reduced attempts to fail faster
  let lastError = "";
  let fullErrorDetails = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const key = km.pick();
    if (!key) {
      if (km.count() === 1) {
         // If only 1 key, waiting won't help if it's dead, but we wait for rate limits
         await new Promise((r) => setTimeout(r, 2000));
         km.resetAll();
      } else {
         km.resetAll();
      }
      continue;
    }

    // Ensure model is selected
    await ensureModel(key, log);

    try {
      const url = `${BASE}/${discoveredEndpoint}/models/${discoveredModel}:generateContent?key=${key}`;

      const body: any = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };

      // Only add tools if explicitly requested AND endpoint supports it
      if (options.grounding && discoveredEndpoint === 'v1beta') {
        body.tools = [{ googleSearch: {} }];
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 503) {
        log(`⚠️ Rate limit (429/503). Retrying...`);
        km.setCooldown(key, 10);
        continue;
      }

      // If 404, the fallback model might be wrong.
      if (res.status === 404) {
         log(`⚠️ Model ${discoveredModel} not found (404). Retrying with different key/model...`);
         discoveredModel = null; // Force re-discovery/reset
         continue;
      }

      const txt = await res.text();

      if (!res.ok) {
        try {
            const errJson = JSON.parse(txt);
            fullErrorDetails = errJson.error?.message || txt;
        } catch {
            fullErrorDetails = txt;
        }
        lastError = `HTTP ${res.status}: ${fullErrorDetails.substring(0, 100)}...`;
        continue;
      }

      // ✅ Success
      const json = JSON.parse(txt);
      const candidates = json.candidates || [];
      if (candidates.length === 0) {
          // Safety block or empty response
          if (json.promptFeedback) {
             throw new Error(`Blocked: ${JSON.stringify(json.promptFeedback)}`);
          }
          throw new Error("Empty response from AI");
      }

      const parts = candidates[0].content?.parts || [];
      const text = parts.map((p: any) => p.text || "").join("");

      const sources: string[] = [];
      (candidates[0].groundingMetadata?.groundingChunks || []).forEach(
        (c: any) => {
          if (c.web?.uri) sources.push(c.web.uri);
        }
      );

      return { text, sources, usedModel: discoveredModel || "unknown" };

    } catch (err: any) {
      lastError = err.message || String(err);
    }
  }

  // Final failure message
  throw new Error(`${lastError} (Model: ${discoveredModel})`);
}

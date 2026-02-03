
// ============================================================
// GeminiClient.ts
//
// SINGLE source of truth for all Gemini API calls.
// Calls ListModels FIRST to discover real model names.
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
// Calls ListModels with the REAL key → gets REAL model list
// ------------------------------------------------------------
let discoveredModel: string | null = null;
let discoveredEndpoint: string | null = null;

async function discoverModel(key: string, log: (msg: string) => void): Promise<void> {
  log("🔍 Auto-detecting best available Gemini model...");

  // Prefer v1beta for Tools/Grounding support
  const endpoints = ["v1beta", "v1"];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE}/${ep}/models?key=${key}`);
      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const models: string[] = (json.models || []).map((m: any) => m.name);
      
      // Priority order — pick the best one available to this key
      const priority = [
        "models/gemini-2.0-flash",
        "models/gemini-2.0-flash-lite",
        "models/gemini-1.5-flash",
        "models/gemini-1.5-flash-latest",
        "models/gemini-1.5-pro",
        "models/gemini-1.5-pro-latest",
      ];

      for (const p of priority) {
        if (models.includes(p)) {
          discoveredModel = p.replace("models/", "");
          discoveredEndpoint = ep;
          log(`✅ Locked in: ${discoveredModel} (${ep})`);
          return;
        }
      }

      // Fallback: first flash model in the list
      const flash = models.find((m: string) => m.includes("flash"));
      if (flash) {
        discoveredModel = flash.replace("models/", "");
        discoveredEndpoint = ep;
        log(`✅ Locked in (fallback): ${discoveredModel} (${ep})`);
        return;
      }

      // Last resort: first model at all
      if (models.length > 0) {
        discoveredModel = models[0].replace("models/", "");
        discoveredEndpoint = ep;
        log(`✅ Locked in (generic): ${discoveredModel} (${ep})`);
        return;
      }
    } catch (e) {
      console.warn(`ListModels/${ep} error:`, e);
    }
  }

  throw new Error("❌ No compatible models found. Check API key.");
}

// ------------------------------------------------------------
// EXPORTED HELPERS
// ------------------------------------------------------------
export function getDebugConfig() {
    return {
        keyCount: KeyManager.get().count(),
        model: discoveredModel ? `${discoveredModel} (${discoveredEndpoint})` : null
    };
}

export function safeParseJSON<T>(text: string): T | null {
  const tries = [
    text,
    (text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [])[1],
    (text.match(/\[[\s\S]*\]/) || [])[0],
    (text.match(/\{[\s\S]*\}/) || [])[0],
  ];
  for (const t of tries) {
    if (!t) continue;
    try {
      return JSON.parse(t) as T;
    } catch {}
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
  if (km.count() === 0) throw new Error("No API keys found in .env");

  const log = options.log || (() => {});
  const maxAttempts = 5;
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const key = km.pick();
    if (!key) {
      log("⏸️ All keys cooling. Waiting 10s...");
      await new Promise((r) => setTimeout(r, 10000));
      km.resetAll();
      continue;
    }

    // Auto-discover on first call if not ready
    if (!discoveredModel || !discoveredEndpoint) {
      try {
        await discoverModel(key, log);
      } catch (e: any) {
        lastError = e.message;
        continue; // Try next key/attempt
      }
    }

    // Throttle slightly
    await new Promise((r) => setTimeout(r, 1000));

    try {
      const url = `${BASE}/${discoveredEndpoint}/models/${discoveredModel}:generateContent?key=${key}`;

      const body: any = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };

      // FIX: Use 'googleSearch' for public API v1beta
      if (options.grounding && discoveredEndpoint === 'v1beta') {
        body.tools = [{ googleSearch: {} }];
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 503) {
        log(`⚠️ Rate limit. Switching keys...`);
        km.setCooldown(key, 60);
        continue;
      }

      if (res.status === 404) {
        log(`⚠️ 404 — Model ${discoveredModel} missing. Re-discovering...`);
        discoveredModel = null;
        discoveredEndpoint = null;
        continue;
      }

      if (!res.ok) {
        const txt = await res.text();
        try {
            const errJson = JSON.parse(txt);
            lastError = errJson.error?.message || txt;
        } catch {
            lastError = txt;
        }
        // log(`⚠️ HTTP ${res.status}: ${lastError}`);
        continue;
      }

      // ✅ Success
      const json = await res.json();
      const parts = json.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p: any) => p.text || "").join("");

      const sources: string[] = [];
      (json.candidates?.[0]?.groundingMetadata?.groundingChunks || []).forEach(
        (c: any) => {
          if (c.web?.uri) sources.push(c.web.uri);
        }
      );

      return { text, sources, usedModel: discoveredModel || "unknown" };
    } catch (err: any) {
      lastError = err.message || String(err);
    }
  }

  throw new Error(`Gemini failed after ${maxAttempts} attempts. Last: ${lastError}`);
}


/**
 * DEPRECATED
 * This application has migrated to Groq (Llama-3).
 * Do not import or use this file.
 */

export async function geminiCall(prompt: string, options: any) {
    throw new Error("GeminiClient is deprecated. Please use GroqClient.");
}

export function safeParseJSON(text: string) {
    return null;
}

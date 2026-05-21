import OpenAI from "openai";

let _openai: OpenAI | null = null;

/**
 * Singleton OpenAI client yang menggunakan Replit AI Integrations proxy.
 * Gunakan fungsi ini di semua route yang butuh OpenAI (aiAgent, scanDocument,
 * correspondences, podOcr) agar konfigurasi dan key cukup di satu tempat.
 *
 * Env vars yang digunakan:
 *  - AI_INTEGRATIONS_OPENAI_API_KEY  (diisi otomatis oleh Replit Integrations)
 *  - AI_INTEGRATIONS_OPENAI_BASE_URL (diisi otomatis oleh Replit Integrations)
 *  - OPENAI_API_KEY                  (fallback jika tidak menggunakan Integrations)
 */
export function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key tidak dikonfigurasi. Set AI_INTEGRATIONS_OPENAI_API_KEY atau OPENAI_API_KEY.");
    }
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

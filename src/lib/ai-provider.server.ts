// Resolves the AI provider config for a given user (BYO keys + model selection).
// All four providers expose an OpenAI-compatible /chat/completions endpoint,
// so a single streamed caller works across them.

import { createClient } from "@supabase/supabase-js";

export type ProviderId = "lovable" | "groq" | "openrouter" | "gemini";

export type ProviderConfig = {
  provider: ProviderId;
  model: string;
  endpoint: string;
  headers: Record<string, string>;
};

const ENDPOINTS: Record<ProviderId, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

const DEFAULT_MODELS: Record<ProviderId, string> = {
  lovable: "google/gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.5-flash",
  gemini: "gemini-2.5-flash",
};

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function resolveProvider(userId: string): Promise<ProviderConfig> {
  const { data } = await admin()
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const provider = (data?.ai_provider ?? "lovable") as ProviderId;
  const model = data?.selected_model?.trim() || DEFAULT_MODELS[provider];
  const endpoint = ENDPOINTS[provider];

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  const missing = (name: string) => {
    throw new Error(
      `No ${name} API key configured. Add one in Settings, or switch to Lovable AI (default).`,
    );
  };

  switch (provider) {
    case "lovable": {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("LOVABLE_API_KEY missing on server");
      headers["Lovable-API-Key"] = key;
      break;
    }
    case "groq": {
      const key = data?.groq_api_key;
      if (!key) missing("Groq");
      headers["Authorization"] = `Bearer ${key}`;
      break;
    }
    case "openrouter": {
      const key = data?.openrouter_api_key;
      if (!key) missing("OpenRouter");
      headers["Authorization"] = `Bearer ${key}`;
      headers["HTTP-Referer"] = "https://anolux.lovable.app";
      headers["X-Title"] = "ANOLUX Intelligence Engine";
      break;
    }
    case "gemini": {
      const key = data?.gemini_api_key;
      if (!key) missing("Gemini");
      headers["Authorization"] = `Bearer ${key}`;
      break;
    }
  }

  return { provider, model, endpoint, headers };
}

/** Minimal non-streaming call used to test connectivity from Settings. */
export async function pingProvider(cfg: ProviderConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: cfg.headers,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: "You are a connection test. Reply with exactly: OK" },
          { role: "user", content: "ping" },
        ],
        max_tokens: 10,
        stream: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const j = await res.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "";
    return { ok: true, message: content.trim() || "Connected." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

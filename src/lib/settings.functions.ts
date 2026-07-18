import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SaveInput = z.object({
  ai_provider: z.enum(["lovable", "groq", "openrouter", "gemini"]),
  selected_model: z.string().trim().min(1).max(200),
  groq_api_key: z.string().trim().max(500).optional().nullable(),
  openrouter_api_key: z.string().trim().max(500).optional().nullable(),
  gemini_api_key: z.string().trim().max(500).optional().nullable(),
});

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (
      data ?? {
        ai_provider: "lovable",
        selected_model: "google/gemini-2.5-flash",
        groq_api_key: null,
        openrouter_api_key: null,
        gemini_api_key: null,
      }
    );
  });

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_settings").upsert(
      {
        user_id: context.userId,
        ai_provider: data.ai_provider,
        selected_model: data.selected_model,
        groq_api_key: data.groq_api_key || null,
        openrouter_api_key: data.openrouter_api_key || null,
        gemini_api_key: data.gemini_api_key || null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveProvider, pingProvider } = await import("./ai-provider.server");
    const cfg = await resolveProvider(context.userId);
    const result = await pingProvider(cfg);
    return { ...result, provider: cfg.provider, model: cfg.model };
  });

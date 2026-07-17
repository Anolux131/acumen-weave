import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SECTIONS, ACTIVE_SECTION_NUMBERS } from "./section-config";

const CreateJobInput = z.object({
  company_name: z.string().trim().min(1).max(200),
  company_url: z.string().trim().max(500).optional().nullable(),
  industry: z.string().trim().max(200).optional().nullable(),
  analysis_depth: z.enum(["quick", "executive", "comprehensive"]).default("comprehensive"),
});

/**
 * Create a research job and kick off the orchestrator in the background.
 * Returns the new job id immediately; the client subscribes to realtime for progress.
 */
export const createResearchJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateJobInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Insert the job as the authenticated user (RLS enforced)
    const { data: job, error } = await supabase
      .from("research_jobs")
      .insert({
        user_id: userId,
        company_name: data.company_name,
        company_url: data.company_url || null,
        industry: data.industry || null,
        analysis_depth: data.analysis_depth,
        status: "planning",
        current_phase: "Initializing agents",
        total_sections: ACTIVE_SECTION_NUMBERS.length,
      })
      .select()
      .single();
    if (error || !job) throw new Error(error?.message ?? "Failed to create job");

    // Pre-create section rows for each active section
    const sectionRows = ACTIVE_SECTION_NUMBERS.map((n) => {
      const meta = SECTIONS.find((s) => s.number === n)!;
      return {
        job_id: job.id,
        user_id: userId,
        section_number: n,
        section_name: meta.name,
        status: "pending" as const,
      };
    });
    await supabase.from("section_results").insert(sectionRows);

    // Fire-and-forget: POST to our own public route so the orchestrator runs
    // in a fresh Worker invocation that outlives this request.
    const origin = new URL(process.env.SUPABASE_URL ?? "https://localhost").origin;
    // Rebuild origin from the incoming request instead — the Supabase URL is
    // not the app's URL. Use the request headers.
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const appOrigin = new URL(req.url).origin;
    const token = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

    // Do NOT await — kick off the HTTP request and return immediately.
    void fetch(`${appOrigin}/api/public/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, token }),
    }).catch((err) => console.error("[research.functions] orchestrator kick failed:", err));

    // Silence unused-var lint for origin (kept as a defensive fallback pattern)
    void origin;

    return { job_id: job.id };
  });

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
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
 * Create a research job and trigger the background orchestrator.
 * Returns the new job id immediately; the client subscribes to realtime for progress.
 */
export const createResearchJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateJobInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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

    // Pre-create one section_results row per active section so the UI can render
    // the full grid immediately.
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

    // Fire-and-forget kick to a public API route: a separate Worker
    // invocation that outlives this request, since floating promises inside
    // this handler would be cancelled when the response finalizes.
    const appOrigin = new URL(getRequest().url).origin;
    const token = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    void fetch(`${appOrigin}/api/public/orchestrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, token }),
    }).catch((err) => console.error("[research.functions] orchestrator kick failed:", err));

    return { job_id: job.id };
  });

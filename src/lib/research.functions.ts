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
 * Create a research job and hand the orchestrator to Cloudflare's
 * ctx.waitUntil so it survives past this request's response.
 *
 * Previously this fire-and-forgot a fetch() to /api/public/orchestrate,
 * but workerd cancels any un-awaited subrequest the moment the outer
 * handler returns — so the orchestrator never actually started and jobs
 * sat in "planning" forever.
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

    // Hand the orchestrator to ctx.waitUntil so it runs past this response.
    const [{ runResearchJob }, { getExecutionCtx }] = await Promise.all([
      import("./research-agent.server"),
      import("../server"),
    ]);
    const jobId = job.id;
    const kicked = runResearchJob(jobId).catch(async (err) => {
      console.error(`[orchestrator] Job ${jobId} crashed:`, err);
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await admin
          .from("research_jobs")
          .update({
            status: "failed",
            current_phase: "Orchestrator crashed",
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", jobId);
      } catch {
        /* swallow */
      }
    });
    const ctx = getExecutionCtx();
    if (ctx?.waitUntil) {
      ctx.waitUntil(kicked);
    } else {
      void kicked;
    }

    return { job_id: job.id };
  });

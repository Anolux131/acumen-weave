// Public API route that runs a research job's orchestrator.
// Triggered by createResearchJob via fetch() so it runs in its own Worker
// invocation (fire-and-forget across HTTP is reliable; in-process floating
// promises get cancelled when the parent request finishes).
//
// Security: /api/public/* bypasses auth. We verify a shared secret from the
// SUPABASE_SERVICE_ROLE_KEY (already server-only) so only our own serverFn
// can invoke this. We also fetch the job with the service-role client to
// verify it exists before running.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  job_id: z.string().uuid(),
  token: z.string().min(1),
});

export const Route = createFileRoute("/api/public/orchestrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch (e) {
          return new Response("Bad request", { status: 400 });
        }

        // Timing-safe compare against the service role key (shared secret only
        // the server function knows).
        const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
        if (!expected || parsed.token.length !== expected.length) {
          return new Response("Unauthorized", { status: 401 });
        }
        let mismatch = 0;
        for (let i = 0; i < expected.length; i++) {
          mismatch |= expected.charCodeAt(i) ^ parsed.token.charCodeAt(i);
        }
        if (mismatch !== 0) return new Response("Unauthorized", { status: 401 });

        // Run the orchestrator. This Worker invocation lives for the duration
        // of the job (parallel section fan-out keeps wall time bounded).
        const { runResearchJob } = await import("@/lib/research-agent.server");
        try {
          await runResearchJob(parsed.job_id);
        } catch (err) {
          console.error(`[orchestrate] Job ${parsed.job_id} failed:`, err);
          return new Response(JSON.stringify({ ok: false, error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

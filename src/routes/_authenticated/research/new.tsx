import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createResearchJob } from "@/lib/research.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Radar, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/research/new")({
  component: NewResearch,
});

function NewResearch() {
  const navigate = useNavigate();
  const create = useServerFn(createResearchJob);
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim()) return;
    setSubmitting(true);
    try {
      const { job_id } = await create({
        data: {
          company_name: company.trim(),
          company_url: url.trim() || null,
          industry: industry.trim() || null,
          analysis_depth: "comprehensive",
        },
      });
      toast.success("Agents deployed", { description: "Watch progress live." });
      navigate({ to: "/research/$id", params: { id: job_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start research");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Deploy</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Intelligence Research</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a company. 14 autonomous agents will produce a full intelligence dossier.
          </p>
        </div>

        <Card className="border-border bg-panel/80 p-8 shadow-panel backdrop-blur">
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="company">
                Company name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company"
                placeholder="e.g. Notion"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="url">Website</Label>
                <Input
                  id="url"
                  placeholder="notion.so"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  placeholder="Productivity SaaS"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary">
                <Sparkles className="h-3.5 w-3.5" /> This run will produce
              </div>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li>• Executive Intelligence</li>
                <li>• Market Position</li>
                <li>• Customer Intelligence</li>
                <li>• Website Intelligence</li>
                <li>• AI Visibility (GEO)</li>
                <li>• Search Intelligence (SEO)</li>
                <li>• Messaging Intelligence</li>
                <li>• Content Intelligence</li>
                <li>• Funnel Intelligence</li>
                <li>• Product Intelligence</li>
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground/70">
                Phase 3 — 10 of 14 sections active. Watch the Deep Researcher stream live.
                Estimated runtime: 2–4 minutes.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate({ to: "/dashboard" })}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !company.trim()}
                className="bg-gradient-primary text-primary-foreground glow-primary"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying agents…
                  </>
                ) : (
                  <>
                    <Radar className="mr-2 h-4 w-4" />
                    Launch research
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

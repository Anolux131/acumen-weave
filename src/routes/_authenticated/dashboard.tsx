import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Radar, Loader2, CheckCircle2, XCircle, Clock, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "@/lib/utils-time";

type Job = Database["public"]["Tables"]["research_jobs"]["Row"];

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("research_jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted) {
        setJobs(data ?? []);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel(`dashboard:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_jobs", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  const running = jobs.filter((j) => j.status === "researching" || j.status === "planning").length;
  const done = jobs.filter((j) => j.status === "complete").length;

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">Control</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Research Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Deploy autonomous intelligence agents on any company.
            </p>
          </div>
          <Button
            className="bg-gradient-primary text-primary-foreground glow-primary"
            onClick={() => navigate({ to: "/research/new" })}
          >
            <Plus className="mr-2 h-4 w-4" /> New Research
          </Button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Total jobs" value={jobs.length} icon={Radar} />
          <StatCard label="In progress" value={running} icon={Loader2} accent />
          <StatCard label="Completed" value={done} icon={CheckCircle2} />
        </div>

        <Card className="border-border bg-panel/70 backdrop-blur">
          <div className="border-b border-border px-5 py-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Intelligence Jobs
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" /> Loading jobs…
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-16 text-center">
              <Radar className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-4 text-sm font-medium">No research jobs yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Kick off your first intelligence run to see it here.
              </p>
              <Button
                className="mt-6 bg-gradient-primary text-primary-foreground"
                onClick={() => navigate({ to: "/research/new" })}
              >
                <Plus className="mr-2 h-4 w-4" /> Start research
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {jobs.map((j) => (
                <JobRow key={j.id} job={j} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card className="border-border bg-panel/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <p className={`mt-2 text-3xl font-semibold ${accent ? "text-gradient" : ""}`}>{value}</p>
    </Card>
  );
}

function JobRow({ job }: { job: Job }) {
  const isRunning = job.status === "researching" || job.status === "planning" || job.status === "analyzing";
  const StatusIcon =
    job.status === "complete"
      ? CheckCircle2
      : job.status === "failed"
      ? XCircle
      : isRunning
      ? Loader2
      : Clock;

  const badgeVariant: "default" | "secondary" | "destructive" | "outline" =
    job.status === "complete" ? "default" : job.status === "failed" ? "destructive" : "secondary";

  return (
    <Link
      to="/research/$id"
      params={{ id: job.id }}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface/60"
    >
      <StatusIcon
        className={`h-4 w-4 shrink-0 ${
          isRunning ? "animate-spin text-primary" : job.status === "complete" ? "text-success" : job.status === "failed" ? "text-destructive" : "text-muted-foreground"
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{job.company_name}</p>
          <Badge variant={badgeVariant} className="font-mono text-[10px] uppercase">
            {job.status}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {job.current_phase || job.industry || "—"} • {formatDistanceToNow(new Date(job.created_at))} ago
        </p>
      </div>
      <div className="hidden w-28 shrink-0 sm:block">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-gradient-primary transition-all"
            style={{ width: `${job.progress_percentage}%` }}
          />
        </div>
        <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
          {job.progress_percentage}%
        </p>
      </div>
      <ArrowRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}

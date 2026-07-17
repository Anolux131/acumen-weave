import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Clock, Radar } from "lucide-react";
import { SECTIONS, ACTIVE_SECTION_NUMBERS } from "@/lib/section-config";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Job = Database["public"]["Tables"]["research_jobs"]["Row"];
type SectionRow = Database["public"]["Tables"]["section_results"]["Row"];
type LogRow = Database["public"]["Tables"]["agent_logs"]["Row"];

export const Route = createFileRoute("/_authenticated/research/$id")({
  component: ResearchProgress,
});

function ResearchProgress() {
  const { id } = Route.useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [active, setActive] = useState<number>(ACTIVE_SECTION_NUMBERS[0]);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      const [j, s, l] = await Promise.all([
        supabase.from("research_jobs").select("*").eq("id", id).maybeSingle(),
        supabase.from("section_results").select("*").eq("job_id", id).order("section_number"),
        supabase.from("agent_logs").select("*").eq("job_id", id).order("created_at").limit(500),
      ]);
      if (!mounted) return;
      setJob(j.data);
      setSections(s.data ?? []);
      setLogs(l.data ?? []);
    }
    loadAll();

    const channel = supabase
      .channel(`job:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "research_jobs", filter: `id=eq.${id}` }, (payload) => {
        setJob(payload.new as Job);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "section_results", filter: `job_id=eq.${id}` }, () => {
        supabase.from("section_results").select("*").eq("job_id", id).order("section_number").then(({ data }) => setSections(data ?? []));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_logs", filter: `job_id=eq.${id}` }, (payload) => {
        setLogs((prev) => [...prev, payload.new as LogRow]);
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);

  const progressPct = useMemo(() => {
    if (!sections.length) return job?.progress_percentage ?? 0;
    const complete = sections.filter((s) => s.status === "complete").length;
    const running = sections.filter((s) => s.status === "running").length;
    return Math.min(100, Math.round(((complete + running * 0.5) / sections.length) * 100));
  }, [sections, job?.progress_percentage]);

  const activeSection = sections.find((s) => s.section_number === active);
  const isDone = job?.status === "complete" || job?.status === "failed";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="truncate text-xl font-semibold">{job?.company_name ?? "Loading…"}</h1>
              {job && (
                <Badge
                  variant={
                    job.status === "complete"
                      ? "default"
                      : job.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                  className="font-mono text-[10px] uppercase"
                >
                  {job.status}
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {job?.current_agent && (
                <span className="text-primary">
                  <Radar className="mr-1 inline h-3 w-3 animate-agent-pulse" />
                  {job.current_agent} —
                </span>
              )}{" "}
              {job?.current_phase || "Initializing…"}
            </p>
          </div>
          <div className="w-64">
            <div className="mb-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <span>Progress</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
        {/* Section list */}
        <aside className="space-y-2">
          <p className="px-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Intelligence Sections
          </p>
          {SECTIONS.map((meta) => {
            const row = sections.find((s) => s.section_number === meta.number);
            const isActiveSection = ACTIVE_SECTION_NUMBERS.includes(meta.number);
            const status = row?.status ?? (isActiveSection ? "pending" : "queued");
            const StatusIcon =
              status === "complete" ? CheckCircle2 :
              status === "running" ? Loader2 :
              status === "failed" ? XCircle : Clock;
            const iconClass =
              status === "complete" ? "text-success" :
              status === "running" ? "text-primary animate-spin" :
              status === "failed" ? "text-destructive" : "text-muted-foreground/50";
            const disabled = !isActiveSection;
            const selected = meta.number === active;
            return (
              <button
                key={meta.number}
                onClick={() => !disabled && setActive(meta.number)}
                disabled={disabled}
                className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-primary/50 bg-surface"
                    : "border-border bg-panel/40 hover:bg-surface"
                } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} />
                <span className="mr-1 font-mono text-[10px] text-muted-foreground">
                  {String(meta.number).padStart(2, "0")}
                </span>
                <span className="truncate">{meta.shortName}</span>
                {row?.confidence_score ? (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {row.confidence_score}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </aside>

        {/* Main pane */}
        <div className="space-y-6">
          <Tabs defaultValue="section">
            <TabsList className="bg-surface">
              <TabsTrigger value="section">Section</TabsTrigger>
              <TabsTrigger value="terminal">
                Agent log
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {logs.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="section" className="mt-4">
              <SectionPane row={activeSection} sectionNumber={active} />
            </TabsContent>

            <TabsContent value="terminal" className="mt-4">
              <Card className="border-border bg-black/60 p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    agent_log.stream
                  </p>
                  <span className="h-2 w-2 rounded-full bg-success animate-agent-pulse" />
                </div>
                <ScrollArea className="h-[520px]">
                  <div ref={terminalRef} className="p-4 font-mono text-[11px] leading-relaxed">
                    {logs.length === 0 ? (
                      <p className="text-muted-foreground">Waiting for agent output…</p>
                    ) : (
                      logs.map((l) => (
                        <div key={l.id} className="mb-1">
                          <span className="text-muted-foreground/60">
                            {new Date(l.created_at).toLocaleTimeString()}
                          </span>{" "}
                          <span className="text-primary">[{l.agent_name}]</span>{" "}
                          <span
                            className={
                              l.status === "error"
                                ? "text-destructive"
                                : l.status === "done"
                                ? "text-success"
                                : "text-foreground"
                            }
                          >
                            {l.action}
                          </span>
                          {l.detail && (
                            <div className="ml-6 truncate text-muted-foreground/80">
                              → {l.detail}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    {!isDone && (
                      <div className="mt-2 text-primary">
                        <span className="animate-pulse">▊</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function SectionPane({ row, sectionNumber }: { row: SectionRow | undefined; sectionNumber: number }) {
  const meta = SECTIONS.find((s) => s.number === sectionNumber)!;

  if (!row || row.status === "pending") {
    return (
      <Card className="border-border bg-panel/60 p-10 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Queued</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {meta.name} — awaiting agent deployment.
        </p>
      </Card>
    );
  }
  if (row.status === "running") {
    return (
      <Card className="border-border bg-panel/60 p-10 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium text-primary">Agent working…</p>
        <p className="mt-1 text-xs text-muted-foreground">{meta.focus}</p>
        <div className="mx-auto mt-6 h-1 max-w-xs overflow-hidden rounded-full bg-surface">
          <div className="h-full w-1/3 animate-scan bg-gradient-primary" />
        </div>
      </Card>
    );
  }
  if (row.status === "failed") {
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-10 text-center">
        <XCircle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-3 text-sm font-medium text-destructive">Section failed</p>
        <p className="mt-1 text-xs text-muted-foreground">{row.analyzed_content}</p>
      </Card>
    );
  }

  // complete
  const sources = (row.data_sources as Array<{ url: string; title: string }> | null) ?? [];
  return (
    <div className="space-y-4">
      <Card className="border-border bg-panel/70 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Section {meta.number} • Confidence {row.confidence_score}%
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{meta.name}</h2>
          </div>
          <div className="text-right font-mono text-[10px] text-muted-foreground">
            <p>{row.pages_scraped} pages scraped</p>
            <p>{Math.round((row.processing_time_ms ?? 0) / 1000)}s • {row.tokens_used?.toLocaleString()} tokens</p>
          </div>
        </div>
        <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h2:mt-6 prose-h2:text-lg prose-h2:text-gradient prose-strong:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {row.analyzed_content ?? ""}
          </ReactMarkdown>
        </article>
      </Card>

      {sources.length > 0 && (
        <Card className="border-border bg-panel/50 p-5">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Evidence Sources
          </p>
          <div className="space-y-2">
            {sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate rounded border border-border bg-surface px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                title={s.url}
              >
                <span className="text-primary">→</span> {s.title || s.url}
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

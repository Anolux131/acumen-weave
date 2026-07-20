import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, CircleCheck as CheckCircle2, Circle as XCircle, Loader as Loader2, Clock, Radar, Brain, Search, Globe, FileText, Users, Copy, Download, Mail, Linkedin, Star, FastForward, Activity, Zap, Play, ChevronRight } from "lucide-react";
import { SECTIONS, ACTIVE_SECTION_NUMBERS } from "@/lib/section-config";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Job = Database["public"]["Tables"]["research_jobs"]["Row"];
type SectionRow = Database["public"]["Tables"]["section_results"]["Row"];
type LogRow = Database["public"]["Tables"]["agent_logs"]["Row"];
type ReportRow = Database["public"]["Tables"]["reports"]["Row"];
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

export const Route = createFileRoute("/_authenticated/research/$id")({
  component: ResearchProgress,
});

function ResearchProgress() {
  const { id } = Route.useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [active, setActive] = useState<number>(ACTIVE_SECTION_NUMBERS[0]);

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      const [j, s, l, r, c] = await Promise.all([
        supabase.from("research_jobs").select("*").eq("id", id).maybeSingle(),
        supabase.from("section_results").select("*").eq("job_id", id).order("section_number"),
        supabase.from("agent_logs").select("*").eq("job_id", id).order("created_at").limit(1500),
        supabase.from("reports").select("*").eq("job_id", id).order("created_at", { ascending: false }),
        supabase.from("contacts").select("*").eq("job_id", id).order("outreach_priority"),
      ]);
      if (!mounted) return;
      setJob(j.data);
      setSections(s.data ?? []);
      setLogs(l.data ?? []);
      setReports(r.data ?? []);
      setContacts(c.data ?? []);
    }
    loadAll();

    const channel = supabase
      .channel(`job:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "research_jobs", filter: `id=eq.${id}` },
        (payload) => setJob(payload.new as Job),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "section_results", filter: `job_id=eq.${id}` },
        () => {
          supabase
            .from("section_results")
            .select("*")
            .eq("job_id", id)
            .order("section_number")
            .then(({ data }) => setSections(data ?? []));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_logs", filter: `job_id=eq.${id}` },
        (payload) => setLogs((prev) => [...prev, payload.new as LogRow]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reports", filter: `job_id=eq.${id}` },
        (payload) => setReports((prev) => [payload.new as ReportRow, ...prev]),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts", filter: `job_id=eq.${id}` },
        (payload) => setContacts((prev) => [...prev, payload.new as ContactRow]),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

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
              status === "complete"
                ? CheckCircle2
                : status === "running"
                ? Loader2
                : status === "failed"
                ? XCircle
                : Clock;
            const iconClass =
              status === "complete"
                ? "text-success"
                : status === "running"
                ? "text-primary animate-spin"
                : status === "failed"
                ? "text-destructive"
                : "text-muted-foreground/50";
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
          <Tabs defaultValue={isDone ? "report" : "researcher"}>
            <TabsList className="bg-surface">
              <TabsTrigger value="researcher">
                <Brain className="mr-1.5 h-3.5 w-3.5" />
                Deep Researcher
                {!isDone && (
                  <span className="ml-2 h-1.5 w-1.5 animate-agent-pulse rounded-full bg-success" />
                )}
              </TabsTrigger>
              <TabsTrigger value="section">Section</TabsTrigger>
              <TabsTrigger value="report">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Report
                {reports.length > 0 && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {reports.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="contacts">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Contacts
                {contacts.length > 0 && (
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    {contacts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="terminal">
                Log
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {logs.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="researcher" className="mt-4">
              <DeepResearcher activeSection={active} sections={sections} logs={logs} isDone={isDone} />
            </TabsContent>

            <TabsContent value="section" className="mt-4">
              <SectionPane row={activeSection} sectionNumber={active} />
            </TabsContent>

            <TabsContent value="report" className="mt-4">
              <ReportPane reports={reports} isDone={isDone} companyName={job?.company_name ?? ""} />
            </TabsContent>

            <TabsContent value="contacts" className="mt-4">
              <ContactsPane contacts={contacts} isDone={isDone} />
            </TabsContent>

            <TabsContent value="terminal" className="mt-4">
              <TerminalLog logs={logs} isDone={isDone} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Deep Researcher panel                            */
/* -------------------------------------------------------------------------- */

type Batch = {
  number: number;
  name: string;
  shortName: string;
  status: SectionRow["status"] | "queued";
  thoughts: LogRow[];
  queries: { query: string; at: string }[];
  sources: { domain: string; title: string; url: string; score: number; snippet?: string }[];
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function DeepResearcher({
  activeSection,
  sections,
  logs,
  isDone,
}: {
  activeSection: number;
  sections: SectionRow[];
  logs: LogRow[];
  isDone: boolean;
}) {
  const [autoStream, setAutoStream] = useState(true);
  const [manualBatch, setManualBatch] = useState<number | null>(null);
  const thoughtsRef = useRef<HTMLDivElement>(null);

  // Build batches from ACTIVE sections; each section = one batch.
  const batches: Batch[] = useMemo(() => {
    return ACTIVE_SECTION_NUMBERS.map((num) => {
      const meta = SECTIONS.find((s) => s.number === num)!;
      const row = sections.find((s) => s.section_number === num);
      const sectionLogs = logs.filter(
        (l) => (l.metadata as { sectionNumber?: number } | null)?.sectionNumber === num,
      );

      const thoughts = sectionLogs.filter((l) => l.log_kind === "thought");

      const queriesMap = new Map<string, string>();
      for (const l of sectionLogs) {
        if (l.log_kind !== "query") continue;
        const q = (l.metadata as { query?: string } | null)?.query ?? l.detail ?? "";
        if (q && !queriesMap.has(q)) queriesMap.set(q, l.created_at);
      }
      const queries = Array.from(queriesMap.entries()).map(([query, at]) => ({ query, at }));

      const sourcesMap = new Map<
        string,
        { domain: string; title: string; url: string; score: number; snippet?: string }
      >();
      for (const l of sectionLogs) {
        if (l.log_kind !== "source") continue;
        const md = (l.metadata as {
          url?: string;
          title?: string;
          score?: number;
          snippet?: string;
        } | null) ?? {};
        const url = md.url ?? "";
        if (!url || sourcesMap.has(url)) continue;
        sourcesMap.set(url, {
          domain: hostOf(url),
          title: md.title ?? l.detail ?? url,
          url,
          score: typeof md.score === "number" ? md.score : 0.6,
          snippet: md.snippet,
        });
      }
      const sources = Array.from(sourcesMap.values()).sort((a, b) => b.score - a.score);

      return {
        number: meta.number,
        name: meta.name,
        shortName: meta.shortName,
        status: row?.status ?? "queued",
        thoughts,
        queries,
        sources,
      };
    });
  }, [sections, logs]);

  // Determine the "latest active" batch — the currently-running section, or the
  // last one with activity.
  const latestBatchIndex = useMemo(() => {
    const runningIdx = batches.findIndex((b) => b.status === "running");
    if (runningIdx >= 0) return runningIdx;
    let last = 0;
    batches.forEach((b, i) => {
      if (b.thoughts.length + b.queries.length + b.sources.length > 0) last = i;
    });
    return last;
  }, [batches]);

  // Auto-select: prefer the section the user picked in the sidebar; otherwise
  // follow the latest active batch when auto-stream is on.
  const sidebarIdx = batches.findIndex((b) => b.number === activeSection);
  const effectiveIdx =
    manualBatch != null
      ? manualBatch
      : sidebarIdx >= 0 && !autoStream
      ? sidebarIdx
      : autoStream
      ? latestBatchIndex
      : sidebarIdx >= 0
      ? sidebarIdx
      : 0;

  const active = batches[effectiveIdx] ?? batches[0];

  // Auto-scroll thoughts stream when new content arrives on the active batch.
  useEffect(() => {
    if (!autoStream) return;
    thoughtsRef.current?.scrollTo({
      top: thoughtsRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [active?.thoughts.length, autoStream]);

  const totalQueries = active?.queries.length ?? 0;
  const totalSources = active?.sources.length ?? 0;
  const totalThoughts = active?.thoughts.length ?? 0;

  const selectBatch = (i: number) => {
    setAutoStream(false);
    setManualBatch(i);
  };

  const enableAutoStream = () => {
    setAutoStream(true);
    setManualBatch(null);
  };

  return (
    <div className="space-y-3">
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-panel/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Deep Researcher</span>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {active?.shortName ?? "—"} | B{effectiveIdx + 1}/{batches.length}
          </Badge>
          {active?.status === "running" && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase text-primary">
              <span className="h-1.5 w-1.5 animate-agent-pulse rounded-full bg-primary" />
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase text-muted-foreground">
          <span className="flex items-center gap-1">
            <Search className="h-3 w-3" /> {totalQueries} queries
          </span>
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" /> {totalSources} sources
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" /> {totalThoughts} thoughts
          </span>
        </div>
      </div>

      {/* Batch control strip */}
      <div className="flex items-center gap-2 rounded-md border border-border/70 bg-surface/40 px-2 py-1.5">
        <div className="flex shrink-0 items-center gap-1.5 pr-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
          <span>Batches</span>
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            {batches.map((b, i) => {
              const isActive = i === effectiveIdx;
              const populated =
                b.thoughts.length + b.queries.length + b.sources.length > 0 ||
                b.status === "running";
              const failed = b.status === "failed";
              const complete = b.status === "complete";
              return (
                <button
                  key={b.number}
                  onClick={() => selectBatch(i)}
                  title={`${b.name} — ${b.status}`}
                  className={`group relative flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] transition-all ${
                    isActive
                      ? "border-primary/60 bg-primary/10 text-primary shadow-[0_0_8px_-1px_oklch(0.62_0.19_275/0.55)]"
                      : failed
                      ? "border-destructive/40 text-destructive/70 hover:border-destructive/60"
                      : complete
                      ? "border-success/30 text-success/80 hover:border-success/50"
                      : populated
                      ? "border-border text-muted-foreground hover:text-foreground"
                      : "border-border/40 bg-transparent text-muted-foreground/40 hover:border-border hover:text-muted-foreground"
                  }`}
                >
                  {isActive && b.status === "running" && (
                    <span className="h-1.5 w-1.5 animate-agent-pulse rounded-full bg-primary" />
                  )}
                  <span>B{i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={autoStream ? () => setAutoStream(false) : enableAutoStream}
          className={`flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
            autoStream
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-muted-foreground"
          }`}
          title={autoStream ? "Locked to latest active batch" : "Click to lock to latest active batch"}
        >
          <FastForward className={`h-3 w-3 ${autoStream ? "animate-pulse" : ""}`} />
          {autoStream ? "Live" : "Hold"}
        </button>
      </div>

      {/* Three-panel grid */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
        {/* Thoughts stream */}
        <Card className="border-border bg-panel/60 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Model thoughts
              </p>
            </div>
            {active?.status === "running" && totalThoughts > 0 && (
              <span className="h-2 w-2 animate-agent-pulse rounded-full bg-primary" />
            )}
          </div>
          <ScrollArea className="h-[560px]">
            <div
              ref={thoughtsRef}
              key={`thoughts-${effectiveIdx}`}
              className="animate-in fade-in p-4 duration-300"
            >
              {totalThoughts > 0 ? (
                <div className="space-y-1.5 font-mono text-[12px] leading-relaxed text-foreground/90">
                  {active!.thoughts.map((t) => (
                    <span key={t.id} className="inline">
                      {t.detail}
                    </span>
                  ))}
                  {active?.status === "running" && (
                    <span className="ml-0.5 inline-block animate-pulse text-primary">▊</span>
                  )}
                </div>
              ) : active?.status === "failed" ? (
                <p className="text-[12px] text-destructive/80">
                  Section failed. See log tab for error trace.
                </p>
              ) : (
                <ThoughtSkeleton count={4} />
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Web queries */}
        <Card className="border-border bg-panel/60 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Web queries
              </p>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{totalQueries}</span>
          </div>
          <ScrollArea className="h-[560px]">
            <div
              key={`queries-${effectiveIdx}`}
              className="animate-in fade-in p-3 duration-300"
            >
              {totalQueries > 0 ? (
                <div className="grid gap-1">
                  {active!.queries.map((q, i) => (
                    <div
                      key={q.query}
                      className="flex items-center gap-2 rounded border border-border/60 bg-surface/50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-mono text-[9px] text-primary/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-primary">›</span>
                      <span className="flex-1 truncate font-mono text-[11px] text-foreground/85">
                        {q.query}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <QuerySkeleton count={6} />
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Live sources */}
        <Card className="border-border bg-panel/60 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Live sources
              </p>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{totalSources}</span>
          </div>
          <ScrollArea className="h-[560px]">
            <div
              key={`sources-${effectiveIdx}`}
              className="animate-in fade-in p-3 duration-300"
            >
              {totalSources > 0 ? (
                <div className="grid gap-1.5">
                  {active!.sources.map((s) => (
                    <a
                      key={s.url}
                      href={s.url.startsWith("#") ? undefined : s.url}
                      target={s.url.startsWith("#") ? undefined : "_blank"}
                      rel="noopener noreferrer"
                      className="block rounded-md border border-border/60 bg-surface/40 p-2 transition-colors hover:border-primary/50 hover:bg-surface"
                    >
                      <div className="flex items-center gap-2">
                        <FaviconDot host={s.domain} />
                        <p className="flex-1 truncate text-[11px] font-medium text-foreground/90">
                          {s.title}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-muted-foreground">
                        <span className="truncate">{s.domain || s.url}</span>
                        <span className="shrink-0 text-primary/70">
                          {Math.round((s.score || 0) * 100)}%
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <SourceSkeleton count={6} />
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

function ThoughtSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3 p-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3 w-[90%] animate-pulse rounded bg-primary/10 font-mono" />
          <div className="h-3 w-[75%] animate-pulse rounded bg-primary/10 font-mono" />
          <div className="h-3 w-[82%] animate-pulse rounded bg-primary/10 font-mono" />
        </div>
      ))}
    </div>
  );
}

function QuerySkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded border border-border/40 bg-surface/30 px-2.5 py-1.5"
        >
          <div className="h-2 w-3 animate-pulse rounded bg-primary/10 font-mono" />
          <span className="text-primary/30">›</span>
          <div className="h-2.5 flex-1 animate-pulse rounded bg-primary/10 font-mono" />
        </div>
      ))}
    </div>
  );
}

function SourceSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border/40 bg-surface/30 p-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 shrink-0 animate-pulse rounded-sm bg-primary/10" />
            <div className="h-2.5 flex-1 animate-pulse rounded bg-primary/10" />
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <div className="h-2 w-20 animate-pulse rounded bg-primary/10 font-mono" />
            <div className="h-2 w-6 animate-pulse rounded bg-primary/10 font-mono" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FaviconDot({ host }: { host: string }) {
  if (!host) return <span className="h-4 w-4 shrink-0 rounded-sm bg-surface" />;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
      alt=""
      className="h-4 w-4 shrink-0 rounded-sm"
      loading="lazy"
      onError={(e) => ((e.currentTarget.style.visibility = "hidden"))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                              Terminal + Section                             */
/* -------------------------------------------------------------------------- */

function TerminalLog({ logs, isDone }: { logs: LogRow[]; isDone: boolean }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);
  const shown = logs.filter((l) => l.log_kind !== "thought");
  return (
    <Card className="border-border bg-black/60 p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          agent_log.stream
        </p>
        <span className="h-2 w-2 rounded-full bg-success animate-agent-pulse" />
      </div>
      <ScrollArea className="h-[520px]">
        <div ref={terminalRef} className="p-4 font-mono text-[11px] leading-relaxed">
          {shown.length === 0 ? (
            <p className="text-muted-foreground">Waiting for agent output…</p>
          ) : (
            shown.map((l) => (
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
                  <div className="ml-6 truncate text-muted-foreground/80">→ {l.detail}</div>
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
        <p className="mt-4 text-[11px] text-muted-foreground/70">
          Switch to <span className="text-primary">Deep Researcher</span> to watch queries, sources
          and reasoning stream live.
        </p>
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
            <p>
              {Math.round((row.processing_time_ms ?? 0) / 1000)}s •{" "}
              {row.tokens_used?.toLocaleString()} tokens
            </p>
          </div>
        </div>
        <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h2:mt-6 prose-h2:text-lg prose-h2:text-gradient prose-strong:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{row.analyzed_content ?? ""}</ReactMarkdown>
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

/* -------------------------------------------------------------------------- */
/*                                Report Pane                                  */
/* -------------------------------------------------------------------------- */

function ReportPane({
  reports,
  isDone,
  companyName,
}: {
  reports: ReportRow[];
  isDone: boolean;
  companyName: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = reports.find((r) => r.id === activeId) ?? reports[0];

  if (reports.length === 0) {
    return (
      <Card className="border-border bg-panel/60 p-10 text-center">
        {isDone ? (
          <>
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No report generated</p>
            <p className="mt-1 text-xs text-muted-foreground">
              All sections may have failed. Check the log tab.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium text-primary">Compiling dossier…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Executive brief and full dossier appear here once research completes.
            </p>
          </>
        )}
      </Card>
    );
  }

  const copyMarkdown = async () => {
    if (!active?.markdown_content) return;
    await navigator.clipboard.writeText(active.markdown_content);
    toast.success("Markdown copied to clipboard");
  };

  const download = () => {
    if (!active?.markdown_content) return;
    const blob = new Blob([active.markdown_content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${companyName.toLowerCase().replace(/\s+/g, "-")}-${active.report_type}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadPdf = async () => {
    if (!active?.markdown_content) return;
    const { downloadReportAsPdf } = await import("@/lib/pdf-report");
    downloadReportAsPdf({
      markdown: active.markdown_content,
      title: active.title || `${companyName} — Intelligence Report`,
      subtitle:
        active.report_type === "executive_brief"
          ? "Executive Brief"
          : "Full Intelligence Dossier",
      filename: `${companyName.toLowerCase().replace(/\s+/g, "-")}-${active.report_type}.pdf`,
    });
    toast.success("PDF generated");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {reports.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                active?.id === r.id
                  ? "border-primary/60 bg-surface text-foreground"
                  : "border-border bg-panel/40 text-muted-foreground hover:bg-surface"
              }`}
            >
              {r.report_type === "executive_brief" ? "Executive Brief" : "Full Dossier"}
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                {r.page_count}p
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyMarkdown}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy MD
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> .md
          </Button>
          <Button size="sm" onClick={downloadPdf}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
          </Button>
        </div>
      </div>

      <Card className="border-border bg-panel/70 p-8">
        <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h1:text-gradient prose-h2:mt-6 prose-h2:text-lg prose-strong:text-foreground prose-table:text-xs">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {active?.markdown_content ?? ""}
          </ReactMarkdown>
        </article>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Contacts Pane                                 */
/* -------------------------------------------------------------------------- */

function ContactsPane({ contacts, isDone }: { contacts: ContactRow[]; isDone: boolean }) {
  if (contacts.length === 0) {
    return (
      <Card className="border-border bg-panel/60 p-10 text-center">
        {isDone ? (
          <>
            <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No contacts discovered</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Hunter.io returned no emails for this domain, or no company URL was provided.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium text-primary">Enriching contacts…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buying-committee contacts appear here once research completes.
            </p>
          </>
        )}
      </Card>
    );
  }

  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...contacts].sort(
    (a, b) =>
      (priorityRank[a.outreach_priority ?? "low"] ?? 3) -
      (priorityRank[b.outreach_priority ?? "low"] ?? 3),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-md border border-border bg-panel/50 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{contacts.length} contacts</span>
        <span>
          <span className="text-success">{contacts.filter((c) => c.outreach_priority === "high").length}</span>{" "}
          high priority
        </span>
        <span>{contacts.filter((c) => c.email).length} with email</span>
      </div>

      <div className="grid gap-2">
        {sorted.map((c) => (
          <Card
            key={c.id}
            className="border-border bg-panel/60 p-4 transition-colors hover:border-primary/40"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium text-primary">
                {(c.full_name ?? c.email ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">
                    {c.full_name || "(name unavailable)"}
                  </p>
                  {c.outreach_priority && (
                    <PriorityBadge priority={c.outreach_priority} />
                  )}
                  {c.buying_role && (
                    <Badge variant="outline" className="font-mono text-[9px] uppercase">
                      {c.buying_role.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.job_title ?? c.seniority_level ?? "—"}
                  {c.department ? ` • ${c.department}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      {c.email}
                    </a>
                  )}
                  {c.email_confidence != null && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      confidence {c.email_confidence}%
                    </span>
                  )}
                  {c.linkedin_url && (
                    <a
                      href={c.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Linkedin className="h-3 w-3" /> LinkedIn
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const cfg = {
    high: { label: "High", cls: "bg-success/15 text-success border-success/30" },
    medium: { label: "Medium", cls: "bg-primary/15 text-primary border-primary/30" },
    low: { label: "Low", cls: "bg-muted/30 text-muted-foreground border-border" },
  }[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cfg.cls}`}
    >
      <Star className="h-2.5 w-2.5" /> {cfg.label}
    </span>
  );
}

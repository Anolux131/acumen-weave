import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Radar,
  Brain,
  Search,
  Globe,
  FileDown,
  FileText,
  Users,
  Copy,
  Download,
  Mail,
  Linkedin,
  Star,
} from "lucide-react";
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
      const [j, s, l] = await Promise.all([
        supabase.from("research_jobs").select("*").eq("id", id).maybeSingle(),
        supabase.from("section_results").select("*").eq("job_id", id).order("section_number"),
        supabase.from("agent_logs").select("*").eq("job_id", id).order("created_at").limit(1500),
      ]);
      if (!mounted) return;
      setJob(j.data);
      setSections(s.data ?? []);
      setLogs(l.data ?? []);
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
          <Tabs defaultValue={isDone ? "section" : "researcher"}>
            <TabsList className="bg-surface">
              <TabsTrigger value="researcher">
                <Brain className="mr-1.5 h-3.5 w-3.5" />
                Deep Researcher
                {!isDone && (
                  <span className="ml-2 h-1.5 w-1.5 animate-agent-pulse rounded-full bg-success" />
                )}
              </TabsTrigger>
              <TabsTrigger value="section">Section</TabsTrigger>
              <TabsTrigger value="terminal">
                Log
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {logs.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="researcher" className="mt-4">
              <DeepResearcher logs={logs} activeSection={active} isDone={isDone} />
            </TabsContent>

            <TabsContent value="section" className="mt-4">
              <SectionPane row={activeSection} sectionNumber={active} />
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

type SourceMeta = { url?: string; title?: string; snippet?: string; score?: number; query?: string };
type QueryMeta = { query?: string };
type ScrapeMeta = { url?: string; chars?: number; error?: string };

function DeepResearcher({
  logs,
  activeSection,
  isDone,
}: {
  logs: LogRow[];
  activeSection: number;
  isDone: boolean;
}) {
  const activeMeta = SECTIONS.find((s) => s.number === activeSection);
  const agentName = activeMeta ? `${activeMeta.shortName} Agent` : "";

  const filtered = useMemo(
    () => logs.filter((l) => l.agent_name === agentName || l.agent_name === "Orchestrator"),
    [logs, agentName],
  );

  const thoughts = filtered.filter((l) => l.log_kind === "thought");
  const queries = filtered.filter((l) => l.log_kind === "query");
  const sources = filtered.filter((l) => l.log_kind === "source");
  const scrapes = filtered.filter((l) => l.log_kind === "scrape");

  // Auto-scroll thought stream to bottom
  const thoughtsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thoughtsRef.current?.scrollTo({ top: thoughtsRef.current.scrollHeight, behavior: "smooth" });
  }, [thoughts.length]);

  const thoughtStream = thoughts.map((t) => t.detail ?? "").join("");

  return (
    <div className="space-y-4">
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-panel/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Deep Researcher</span>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {activeMeta?.shortName ?? "—"}
          </Badge>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase text-muted-foreground">
          <span className="flex items-center gap-1">
            <Search className="h-3 w-3" /> {queries.length} queries
          </span>
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" /> {sources.length} sources
          </span>
          <span className="flex items-center gap-1">
            <FileDown className="h-3 w-3" /> {scrapes.filter((s) => (s.metadata as ScrapeMeta | null)?.chars).length} scraped
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Thoughts stream */}
        <Card className="border-border bg-panel/60 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Model thoughts
              </p>
            </div>
            {!isDone && thoughts.length > 0 && (
              <span className="h-2 w-2 animate-agent-pulse rounded-full bg-primary" />
            )}
          </div>
          <ScrollArea className="h-[560px]">
            <div ref={thoughtsRef} className="p-4">
              {thoughtStream ? (
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                  {thoughtStream}
                  {!isDone && <span className="ml-0.5 animate-pulse text-primary">▊</span>}
                </div>
              ) : (
                <EmptyHint
                  icon={Brain}
                  title="Waiting for reasoning"
                  hint="Model output will stream here in real time as the agent synthesizes the section."
                />
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Queries + Sources column */}
        <div className="space-y-4">
          <Card className="border-border bg-panel/60 p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-primary" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Web queries
                </p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{queries.length}</span>
            </div>
            <ScrollArea className="h-[180px]">
              <div className="space-y-1 p-3">
                {queries.length === 0 ? (
                  <EmptyHint icon={Search} title="No searches yet" />
                ) : (
                  queries.map((q) => {
                    const meta = (q.metadata as QueryMeta | null) ?? {};
                    const hits = sources.filter(
                      (s) => ((s.metadata as SourceMeta | null)?.query ?? "") === meta.query,
                    ).length;
                    return (
                      <div
                        key={q.id}
                        className="flex items-center gap-2 rounded border border-border/60 bg-surface/50 px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-mono text-[10px] text-muted-foreground/70">
                          {new Date(q.created_at).toLocaleTimeString([], {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <span className="text-primary">›</span>
                        <span className="flex-1 truncate">{meta.query ?? q.detail}</span>
                        {hits > 0 && (
                          <Badge variant="outline" className="font-mono text-[9px]">
                            {hits}
                          </Badge>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>

          <Card className="border-border bg-panel/60 p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Live sources
                </p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{sources.length}</span>
            </div>
            <ScrollArea className="h-[360px]">
              <div className="space-y-2 p-3">
                {sources.length === 0 ? (
                  <EmptyHint icon={Globe} title="No sources yet" />
                ) : (
                  sources.slice(-40).reverse().map((s) => {
                    const meta = (s.metadata as SourceMeta | null) ?? {};
                    const host = hostOf(meta.url);
                    return (
                      <a
                        key={s.id}
                        href={meta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-md border border-border/60 bg-surface/40 p-2.5 transition-colors hover:border-primary/50 hover:bg-surface"
                      >
                        <div className="flex items-center gap-2">
                          <FaviconDot host={host} />
                          <p className="flex-1 truncate text-[12px] font-medium text-foreground/90">
                            {meta.title ?? meta.url}
                          </p>
                          <span className="font-mono text-[9px] text-muted-foreground">{host}</span>
                        </div>
                        {meta.snippet && (
                          <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
                            {highlightSnippet(meta.snippet, meta.query)}
                          </p>
                        )}
                      </a>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Icon className="h-6 w-6 text-muted-foreground/40" />
      <p className="mt-2 text-xs font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[11px] text-muted-foreground/70">{hint}</p>}
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

function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function highlightSnippet(snippet: string, query?: string) {
  if (!query) return snippet;
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 3 && !/^(the|and|with|from|that|this|for)$/.test(t)),
    ),
  );
  if (terms.length === 0) return snippet;
  const pattern = new RegExp(`(${terms.map(escapeRe).join("|")})`, "gi");
  const parts = snippet.split(pattern);
  return parts.map((p, i) =>
    pattern.test(p) ? (
      <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-primary">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

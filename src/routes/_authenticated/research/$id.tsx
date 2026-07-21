import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, CircleCheck as CheckCircle2, Loader as Loader2, Globe, Users, Copy, Download, Mail, Linkedin, Star, Zap, Play, ChevronRight } from "lucide-react";
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
  const deepResearchComplete = job?.status === "complete";

  // ---- Pipeline phase (UI state; advances on user handoff) ----
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [maxReachedPhase, setMaxReachedPhase] = useState<1 | 2 | 3 | 4>(1);

  // ---- Derived data for right canvas ----
  const domain = useMemo(() => {
    if (job?.company_url) {
      try {
        return new URL(job.company_url).hostname.replace(/^www\./, "");
      } catch { /* noop */ }
    }
    return job?.company_name ?? "target";
  }, [job?.company_url, job?.company_name]);

  const resolvedSources = useMemo(() => {
    const map = new Map<string, { domain: string; url: string; title: string }>();
    for (const l of logs) {
      if (l.log_kind !== "source") continue;
      const md = (l.metadata as { url?: string; title?: string } | null) ?? {};
      const url = md.url ?? "";
      if (!url) continue;
      const d = hostOf(url);
      if (!d || map.has(d)) continue;
      map.set(d, { domain: d, url, title: md.title ?? d });
    }
    return Array.from(map.values());
  }, [logs]);

  const telemetry = useMemo(() => {
    // For each active section that has activity, produce { headline, subs[] }
    const completedCount = sections.filter((s) => s.status === "complete").length;
    const items: { headline: string; subs: string[]; status: string }[] = [];

    // Batch summaries (only sections with real data)
    for (const num of ACTIVE_SECTION_NUMBERS) {
      const meta = SECTIONS.find((s) => s.number === num)!;
      const row = sections.find((s) => s.section_number === num);
      if (!row) continue;
      const sectionLogs = logs.filter(
        (l) => (l.metadata as { sectionNumber?: number } | null)?.sectionNumber === num,
      );
      const subs: string[] = [];
      const qCount = sectionLogs.filter((l) => l.log_kind === "query").length;
      const sCount = sectionLogs.filter((l) => l.log_kind === "source").length;
      if (qCount) subs.push(`${qCount} web queries executed`);
      if (sCount) subs.push(`${sCount} sources indexed`);
      if (row.confidence_score) subs.push(`confidence ${row.confidence_score}%`);
      if (row.pages_scraped) subs.push(`${row.pages_scraped} pages scraped`);
      const label =
        row.status === "complete"
          ? `Batch ${num}/${ACTIVE_SECTION_NUMBERS.length} — ${meta.shortName} complete`
          : row.status === "running"
            ? `Batch ${num}/${ACTIVE_SECTION_NUMBERS.length} — ${meta.shortName} in progress`
            : row.status === "failed"
              ? `Batch ${num}/${ACTIVE_SECTION_NUMBERS.length} — ${meta.shortName} failed`
              : `Batch ${num}/${ACTIVE_SECTION_NUMBERS.length} — ${meta.shortName} queued`;
      items.push({ headline: label, subs, status: row.status });
    }

    if (deepResearchComplete) {
      items.push({
        headline: `Deep Web Scrape Complete (${completedCount}/${ACTIVE_SECTION_NUMBERS.length})`,
        subs: [
          `${resolvedSources.length} unique target endpoints mapped`,
          `${sections.reduce((n, s) => n + (s.pages_scraped ?? 0), 0)} pages scraped`,
          `Intelligence matrix indexed and ready for dossier handoff`,
        ],
        status: "complete",
      });
    }
    return items.reverse();
  }, [sections, logs, deepResearchComplete, resolvedSources.length]);

  const fullDossier = reports.find((r) => r.report_type === "full_dossier");
  const execBrief = reports.find((r) => r.report_type === "executive_brief");

  // Auto-advance phase as backend artifacts arrive (user can still click back).
  useEffect(() => {
    let latest: 1 | 2 | 3 | 4 = 1;
    if (deepResearchComplete) latest = 2;
    if (fullDossier) latest = 3;
    if (execBrief) latest = 4;
    if (latest > maxReachedPhase) {
      setMaxReachedPhase(latest);
      setPhase(latest);
    }
  }, [deepResearchComplete, fullDossier, execBrief, maxReachedPhase]);

  // Phase config
  const phases = [
    { id: 1 as const, label: "DEEP RESEARCH & CRAWL" },
    { id: 2 as const, label: "FULL DOSSIER GEN (30-100p)" },
    { id: 3 as const, label: "EXECUTIVE BRIEF (2-5p)" },
    { id: 4 as const, label: "OUTREACH & EMAIL MATRIX" },
  ];

  const canProceed =
    (phase === 1 && deepResearchComplete) ||
    (phase === 2 && !!fullDossier) ||
    (phase === 3 && !!execBrief) ||
    phase === 4;

  const handoffLabel =
    phase === 1
      ? "Proceed to Dossier Gen"
      : phase === 2
        ? "Proceed to Executive Brief"
        : phase === 3
          ? "Proceed to Outreach Matrix"
          : "Export Outreach Package";

  const handoffTelemetry =
    phase === 1
      ? deepResearchComplete
        ? "Deep Research phase complete. Context fully indexed."
        : `Deep Research in progress — ${sections.filter((s) => s.status === "complete").length}/${ACTIVE_SECTION_NUMBERS.length} sections indexed.`
      : phase === 2
        ? fullDossier
          ? `Full dossier compiled — ${fullDossier.page_count ?? "—"} pages.`
          : "Compiling full intelligence dossier…"
        : phase === 3
          ? execBrief
            ? `Executive brief distilled — ${execBrief.page_count ?? "—"} pages.`
            : "Distilling executive brief…"
          : `${contacts.length} contacts prepared for outreach.`;

  return (
    <div className="min-h-screen bg-[oklch(0.08_0.012_275)]">
      {/* Workspace header */}
      <header className="border-b border-border/50 px-6 pt-5 pb-3">
        <div className="mx-auto max-w-[1400px]">
          <Link
            to="/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Workspaces
          </Link>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              <span className="text-muted-foreground/80">Anolux Workspace: </span>
              <span className="text-foreground">Operational Intelligence Target</span>
              <span className="text-muted-foreground/60"> — </span>
              <span className="text-gradient font-bold">{job?.company_name ?? "Loading…"}</span>
            </h1>
            {job && (
              <Badge
                variant={
                  job.status === "complete"
                    ? "default"
                    : job.status === "failed"
                      ? "destructive"
                      : "secondary"
                }
                className="font-mono text-[9px] uppercase tracking-widest"
              >
                {job.status}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Pipeline tracker */}
      <div className="border-b border-border/50 bg-[oklch(0.07_0.012_275)] px-6 py-4">
        <div className="mx-auto max-w-[1400px]">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Pipeline Tracker: Dynamic Phase Progression
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {phases.map((p, i) => {
              const isActive = phase === p.id;
              const isPast = phase > p.id;
              const clickable = p.id <= phase || (p.id === phase + 1 && canProceed);
              return (
                <button
                  key={p.id}
                  disabled={!clickable}
                  onClick={() => setPhase(p.id)}
                  className={`group relative flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[11px] tracking-wide transition-all ${
                    isActive
                      ? "border-primary/60 bg-gradient-to-r from-primary/25 to-secondary/20 text-foreground shadow-[0_0_18px_-2px_oklch(0.62_0.19_275/0.6)] ring-1 ring-primary/40"
                      : isPast
                        ? "border-success/30 bg-success/5 text-success/80"
                        : "border-border/60 bg-transparent text-muted-foreground/60"
                  } ${!clickable ? "cursor-not-allowed opacity-70" : "hover:text-foreground"}`}
                >
                  {isActive ? (
                    <span className="relative flex h-2 w-2 items-center justify-center">
                      <span className="absolute h-2 w-2 animate-agent-pulse rounded-full bg-primary" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                  ) : isPast ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Play className="h-2.5 w-2.5 opacity-60" />
                  )}
                  <span className="font-semibold">
                    {p.id}. {p.label}
                  </span>
                  {i < phases.length - 1 && (
                    <ChevronRight className="ml-1 h-3 w-3 text-muted-foreground/30" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main workspace grid */}
      <div className="mx-auto max-w-[1400px] p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]">
          {/* LEFT column */}
          <div className="flex flex-col gap-4">
            {/* Target info node */}
            <Card className="border-border/60 bg-[oklch(0.1_0.012_275)] p-5">
              <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                Target Info Node
              </p>
              <div className="rounded-lg border border-border/50 bg-[oklch(0.07_0.012_275)] p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 ring-1 ring-primary/25">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold">{job?.company_name ?? "—"}</h2>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Lookup result: {domain}
                    </p>
                    <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-muted-foreground/70">
                      {job?.company_url ? (
                        <a
                          href={job.company_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-primary"
                        >
                          {job.company_url}
                        </a>
                      ) : (
                        `${domain} Matrix — target endpoint pending`
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[9px] uppercase">
                      <span className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 text-muted-foreground">
                        {ACTIVE_SECTION_NUMBERS.length} batches
                      </span>
                      <span className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 text-muted-foreground">
                        {resolvedSources.length} sources
                      </span>
                      <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">
                        {progressPct}% indexed
                      </span>
                    </div>
                    <div className="mt-3">
                      <Progress value={progressPct} className="h-1" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Engine handoff control */}
            <Card className="border-border/60 bg-[oklch(0.1_0.012_275)] p-5">
              <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
                Engine Handoff Control
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">{handoffTelemetry}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {phase === 1
                  ? "Once complete, hand off indexed context to the Dossier Generation engine."
                  : phase === 2
                    ? "Full dossier will be summarized into an executive brief on the next stage."
                    : phase === 3
                      ? "Executive brief will drive contact prioritization for outreach."
                      : "Outreach package can now be exported and dispatched."}
              </p>

              <button
                disabled={!canProceed}
                onClick={() => {
                  if (!canProceed) return;
                  if (phase < 4) setPhase((p) => (p + 1) as 2 | 3 | 4);
                  else {
                    // Phase 4: export outreach as CSV
                    if (!contacts.length) return;
                    const rows = [
                      ["name", "title", "email", "priority", "linkedin"],
                      ...contacts.map((c) => [
                        c.full_name ?? "",
                        c.job_title ?? "",
                        c.email ?? "",
                        c.outreach_priority ?? "",
                        c.linkedin_url ?? "",
                      ]),
                    ];
                    const csv = rows
                      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
                      .join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${(job?.company_name ?? "target").toLowerCase().replace(/\s+/g, "-")}-outreach.csv`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    toast.success("Outreach CSV exported");
                  }
                }}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold tracking-wide transition-all ${
                  canProceed
                    ? "bg-gradient-to-r from-primary via-primary to-secondary text-primary-foreground shadow-[0_0_22px_-4px_oklch(0.62_0.19_275/0.7)] hover:brightness-110"
                    : "cursor-not-allowed border border-border/60 bg-surface/40 text-muted-foreground/50"
                }`}
              >
                <Zap className={`h-4 w-4 ${canProceed ? "" : "opacity-50"}`} />
                {handoffLabel}
              </button>
            </Card>
          </div>

          {/* RIGHT column — Active discovery canvas */}
          <Card className="border-border/60 bg-[oklch(0.1_0.012_275)] p-0">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  {phase === 1
                    ? "Active Discovery & Telemetry Live Stream"
                    : phase === 2
                      ? "Dossier Generation Stream"
                      : phase === 3
                        ? "Executive Brief Synthesis"
                        : "Outreach Matrix"}
                </p>
              </div>
              <span className="font-mono text-[9px] uppercase text-muted-foreground/50">
                {phase === 1 ? `${telemetry.length} events` : ""}
              </span>
            </div>

            {phase === 1 && (
              <PhaseOneCanvas
                telemetry={telemetry}
                resolvedSources={resolvedSources}
                deepResearchComplete={deepResearchComplete}
              />
            )}
            {phase === 2 && (
              <PhaseReportCanvas
                report={fullDossier}
                emptyLabel="Compiling full intelligence dossier from indexed batches…"
              />
            )}
            {phase === 3 && (
              <PhaseReportCanvas
                report={execBrief}
                emptyLabel="Distilling executive brief from full dossier…"
              />
            )}
            {phase === 4 && <PhaseOutreachCanvas contacts={contacts} />}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Right-canvas phase views                          */
/* -------------------------------------------------------------------------- */

const FAVICON_HUES = [
  "bg-[oklch(0.35_0.15_260)]",
  "bg-[oklch(0.4_0.18_25)]",
  "bg-[oklch(0.4_0.15_150)]",
  "bg-[oklch(0.4_0.18_300)]",
  "bg-[oklch(0.4_0.15_75)]",
  "bg-[oklch(0.4_0.15_200)]",
];

function PhaseOneCanvas({
  telemetry,
  resolvedSources,
  deepResearchComplete,
}: {
  telemetry: { headline: string; subs: string[]; status: string }[];
  resolvedSources: { domain: string; url: string; title: string }[];
  deepResearchComplete: boolean;
}) {
  return (
    <div className="grid grid-rows-[1fr_auto]">
      <ScrollArea className="max-h-[420px]">
        <div className="space-y-5 px-5 py-4">
          {telemetry.length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Awaiting agent telemetry…
            </p>
          ) : (
            telemetry.map((t, i) => (
              <div key={i} className="flex gap-3">
                <span
                  className={`mt-1 text-sm ${
                    t.status === "complete"
                      ? "text-primary"
                      : t.status === "running"
                        ? "text-primary animate-pulse"
                        : t.status === "failed"
                          ? "text-destructive"
                          : "text-muted-foreground/60"
                  }`}
                >
                  ✦
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t.headline}</p>
                  {t.subs.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {t.subs.map((s, j) => (
                        <li key={j}>— {s}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))
          )}
          {!deepResearchComplete && (
            <div className="flex gap-3">
              <span className="mt-1 text-sm text-primary animate-pulse">✦</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Automated System Prompt Structuring…
                </p>
                <p className="mt-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  Injecting {ACTIVE_SECTION_NUMBERS.length}-batch telemetry matrix payload into the
                  Dossier Generation foundational context windows.
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border/50 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-4 w-4 place-items-center rounded-sm bg-surface">
            <span className="text-[8px] text-primary">▦</span>
          </div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
            Resolved Matrix Sources (Multi-Batch)
          </p>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">
            {resolvedSources.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {resolvedSources.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded border border-border/40 bg-surface/30 p-1.5"
                >
                  <div className="h-5 w-5 shrink-0 animate-pulse rounded-sm bg-primary/10" />
                  <div className="h-2 flex-1 animate-pulse rounded bg-primary/10" />
                </div>
              ))
            : resolvedSources.slice(0, 24).map((s, i) => (
                <a
                  key={s.domain}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.title}
                  className="group flex items-center gap-2 rounded border border-border/50 bg-surface/40 p-1.5 transition-colors hover:border-primary/40 hover:bg-surface"
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-sm text-[10px] font-bold text-foreground ${FAVICON_HUES[i % FAVICON_HUES.length]}`}
                  >
                    {s.domain.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
                    {s.domain}
                  </span>
                </a>
              ))}
        </div>
      </div>
    </div>
  );
}

function PhaseReportCanvas({
  report,
  emptyLabel,
}: {
  report: ReportRow | undefined;
  emptyLabel: string;
}) {
  return (
    <ScrollArea className="h-[560px]">
      <div className="p-5">
        {report?.markdown_content ? (
          <article className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h1:text-gradient prose-h2:mt-5 prose-h2:text-base prose-strong:text-foreground prose-table:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.markdown_content}</ReactMarkdown>
          </article>
        ) : (
          <div className="grid place-items-center py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm font-medium text-primary">{emptyLabel}</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function PhaseOutreachCanvas({ contacts }: { contacts: ContactRow[] }) {
  if (contacts.length === 0) {
    return (
      <div className="grid place-items-center py-16 text-center">
        <Users className="h-6 w-6 text-muted-foreground/50" />
        <p className="mt-3 text-sm">No contacts discovered</p>
      </div>
    );
  }
  return (
    <ScrollArea className="h-[560px]">
      <div className="grid gap-2 p-4">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded border border-border/50 bg-surface/40 p-3"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
              {(c.full_name ?? c.email ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {c.full_name || "(name unavailable)"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {c.job_title ?? c.seniority_level ?? "—"}
                {c.email ? ` • ${c.email}` : ""}
              </p>
            </div>
            {c.outreach_priority && (
              <Badge
                variant="outline"
                className={`font-mono text-[9px] uppercase ${
                  c.outreach_priority === "high"
                    ? "border-success/40 text-success"
                    : c.outreach_priority === "medium"
                      ? "border-primary/40 text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {c.outreach_priority}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Deep Researcher panel                            */
/* -------------------------------------------------------------------------- */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}


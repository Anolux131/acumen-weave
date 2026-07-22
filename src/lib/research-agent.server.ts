// Server-only research agent. Never import from client-reachable modules.
// Uses Tavily (search) + Firecrawl (scrape) + Lovable AI Gateway (analysis,
// streamed so the UI can render live "thoughts").

import { createClient } from "@supabase/supabase-js";
import { getSection, ACTIVE_SECTION_NUMBERS } from "./section-config";
import { resolveProvider, type ProviderConfig } from "./ai-provider.server";

type TavilyResult = { url: string; title: string; content: string; score?: number };
type ScrapeResult = { url: string; markdown: string; error?: string };
type LogKind = "status" | "query" | "source" | "scrape" | "thought";

const TAVILY_URL = "https://api.tavily.com/search";
const FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function log(
  jobId: string,
  agent: string,
  kind: LogKind,
  action: string,
  detail?: string,
  metadata?: Record<string, unknown>,
  status: "started" | "working" | "done" | "error" = "working",
) {
  try {
    await admin().from("agent_logs").insert({
      job_id: jobId,
      agent_name: agent,
      action,
      detail: detail ?? null,
      status,
      log_kind: kind,
      metadata: metadata ?? null,
    });
  } catch (e) {
    console.error("agent_log insert failed", e);
  }
}

async function tavilySearch(query: string, maxResults = 5): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY missing");
  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "basic",
        include_raw_content: false,
        max_results: maxResults,
      }),
    });
    if (!res.ok) {
      console.error("tavily error", res.status, (await res.text()).slice(0, 200));
      return [];
    }
    const j = await res.json();
    return (j.results ?? []) as TavilyResult[];
  } catch (e) {
    console.error("tavily fetch failed", e);
    return [];
  }
}

// Simple concurrency-limited map
async function pMap<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/** Non-streaming JSON-ish AI call. Used for planning & query generation. */
async function aiComplete(provider: ProviderConfig, system: string, user: string, maxTokens = 1400): Promise<string> {
  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      stream: false,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return (j?.choices?.[0]?.message?.content ?? "").trim();
}

function parseJsonLoose<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  // Strip ``` fences
  const cleaned = raw.replace(/```json\s*|```/gi, "").trim();
  const firstBrace = cleaned.search(/[\[{]/);
  const lastBrace = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (firstBrace === -1 || lastBrace === -1) return fallback;
  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
  } catch {
    return fallback;
  }
}

async function firecrawlScrape(url: string): Promise<ScrapeResult> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { url, markdown: "", error: "FIRECRAWL_API_KEY missing" };
  try {
    const res = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 25000 }),
    });
    if (!res.ok) return { url, markdown: "", error: `HTTP ${res.status}` };
    const j = await res.json();
    const md: string = j?.data?.markdown ?? j?.markdown ?? "";
    return { url, markdown: (md || "").slice(0, 8000) };
  } catch (e) {
    return { url, markdown: "", error: String(e) };
  }
}

/**
 * Streamed analysis. Emits each ~180-char chunk to agent_logs as a "thought"
 * so the UI can render the model's reasoning as it happens.
 */
async function analyzeStreamed(
  jobId: string,
  agent: string,
  systemPrompt: string,
  userContext: string,
  provider: ProviderConfig,
  sectionMeta?: { number: number; name: string },
): Promise<{ text: string; tokens: number }> {
  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContext },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider.provider} ${res.status}: ${body.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let pending = "";
  const CHUNK = 180;

  const flush = async (force = false) => {
    while (pending.length >= CHUNK || (force && pending.length > 0)) {
      const slice = pending.slice(0, CHUNK);
      pending = pending.slice(slice.length);
      await log(jobId, agent, "thought", "reasoning", slice, sectionMeta ? { sectionNumber: sectionMeta.number } : undefined);
      if (!force) break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload);
        const delta: string = j?.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          pending += delta;
          await flush(false);
        }
      } catch {
        // ignore keepalives / partial frames
      }
    }
  }
  await flush(true);

  // Rough token estimate (streaming responses may omit usage).
  return { text: full, tokens: Math.round(full.length / 4) };
}

function extractConfidence(text: string): number {
  const m = text.match(/Confidence:\s*(HIGH|MEDIUM|LOW)/i);
  if (!m) return 60;
  const l = m[1].toUpperCase();
  return l === "HIGH" ? 88 : l === "MEDIUM" ? 68 : 45;
}

function extractKeyFindings(text: string): string[] {
  const idx = text.toLowerCase().indexOf("key findings");
  if (idx === -1) return [];
  const tail = text.slice(idx, idx + 2000);
  const bullets = tail.match(/^\s*[-*•]\s+.+$/gm) ?? [];
  return bullets.slice(0, 6).map((b) => b.replace(/^\s*[-*•]\s+/, "").trim());
}

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export type ResearchPlan = {
  summary: string;
  angles: string[];
  overlooked: string[];
  section_briefs: Record<string, string>;
};

/**
 * Ask the AI to build a research plan BEFORE any searches run. The plan
 * covers: overall angle for this target, per-section emphasis, and
 * "overlooked" topics the user didn't mention but matter.
 */
export async function planResearch(opts: {
  jobId: string;
  companyName: string;
  companyUrl?: string;
  industry?: string;
  provider: ProviderConfig;
}): Promise<ResearchPlan> {
  const sectionsBrief = ACTIVE_SECTION_NUMBERS.filter((n) => !getSection(n).synthesis)
    .map((n) => {
      const s = getSection(n);
      return `${n}. ${s.name} — ${s.focus}`;
    })
    .join("\n");

  const system = `You are the Chief Research Strategist for ANOLUX Intelligence Engine.
You produce a research plan BEFORE any web queries fire. Output STRICT JSON only, no prose.`;

  const user = `Target company: ${opts.companyName}
Website: ${opts.companyUrl ?? "unknown"}
Industry: ${opts.industry ?? "unspecified — infer"}

Sections that will be researched:
${sectionsBrief}

Produce a JSON object with keys:
{
  "summary": "1–2 sentence framing of what this target is and why they matter",
  "angles": ["5–8 concrete investigative angles a smart analyst would pursue"],
  "overlooked": ["5–8 topics the user likely did NOT emphasize but that would materially change conclusions"],
  "section_briefs": { "1": "one-line emphasis", ... one entry per section number listed above }
}
Return JSON only.`;

  let parsed: ResearchPlan;
  try {
    const raw = await aiComplete(opts.provider, system, user, 1800);
    parsed = parseJsonLoose<ResearchPlan>(raw, {
      summary: `Deep-research plan for ${opts.companyName}`,
      angles: [],
      overlooked: [],
      section_briefs: {},
    });
  } catch (e) {
    parsed = {
      summary: `Deep-research plan for ${opts.companyName} (planner fallback: ${e instanceof Error ? e.message : String(e)})`,
      angles: [],
      overlooked: [],
      section_briefs: {},
    };
  }

  await log(opts.jobId, "Chief Strategist", "thought", "Research plan", parsed.summary, { plan: parsed, phase: "planning" }, "done");
  for (const a of parsed.angles.slice(0, 10)) {
    await log(opts.jobId, "Chief Strategist", "thought", "Investigative angle", a, { phase: "planning" });
  }
  for (const o of parsed.overlooked.slice(0, 10)) {
    await log(opts.jobId, "Chief Strategist", "thought", "Overlooked angle", o, { phase: "planning" });
  }
  return parsed;
}

/** Generate 40+ dynamic queries for a section via AI (with fallbacks). */
async function generateSectionQueries(opts: {
  companyName: string;
  companyUrl?: string;
  industry?: string;
  section: ReturnType<typeof getSection>;
  plan: ResearchPlan;
  provider: ProviderConfig;
  target: number;
}): Promise<string[]> {
  const briefKey = String(opts.section.number);
  const emphasis = opts.plan.section_briefs?.[briefKey] ?? opts.section.focus;
  const system = `You generate diverse, high-signal web search queries for a B2B intelligence agent.
Return STRICT JSON array of strings. Each query 5–14 words, mixing quoted names, operators
(site:, filetype:, "vs", "review", "pricing", years). Cover primary facts, second-order effects,
competitor comparisons, customer voice, regulatory/legal, hiring/leadership, financial signals,
negative press. No duplicates.`;

  const user = `Target: ${opts.companyName} (${opts.companyUrl ?? "no website"}, industry: ${opts.industry ?? "unspecified"})
Section ${opts.section.number}: ${opts.section.name}
Emphasis: ${emphasis}
Overlooked angles: ${opts.plan.overlooked.slice(0, 6).join(" | ") || "n/a"}

Return a JSON array of exactly ${opts.target} distinct search queries. JSON only.`;

  let generated: string[] = [];
  try {
    const raw = await aiComplete(opts.provider, system, user, 2200);
    const parsed = parseJsonLoose<string[]>(raw, []);
    generated = parsed
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter((q) => q.length > 4 && q.length < 240);
  } catch {
    generated = [];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of generated) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  if (out.length < 12) {
    const fallback = opts.section.searchTemplates({
      company: opts.companyName,
      url: normalizeUrl(opts.companyUrl),
      industry: opts.industry,
    });
    for (const q of fallback) if (!seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); out.push(q); }
  }
  return out.slice(0, opts.target);
}

/** After the initial pass, ask the model what's still missing. */
async function findResearchGaps(opts: {
  section: ReturnType<typeof getSection>;
  companyName: string;
  snippets: string;
  provider: ProviderConfig;
}): Promise<{ satisfied: boolean; followups: string[]; reasoning: string }> {
  const system = `You audit whether collected search snippets are sufficient to write a rigorous
intelligence section. Output STRICT JSON: {"satisfied": boolean, "reasoning": "1-3 sentences",
"followups": ["additional search queries to fill gaps, 0–12 items"]}. If satisfied, followups=[].`;
  const user = `Section ${opts.section.number}: ${opts.section.name} (focus: ${opts.section.focus})
Target: ${opts.companyName}

Collected snippets (truncated):
${opts.snippets.slice(0, 8000)}

Return JSON only.`;
  try {
    const raw = await aiComplete(opts.provider, system, user, 900);
    return parseJsonLoose(raw, { satisfied: true, followups: [], reasoning: "" });
  } catch {
    return { satisfied: true, followups: [], reasoning: "gap-check skipped" };
  }
}

export async function runSection(opts: {

  jobId: string;
  userId: string;
  sectionNumber: number;
  companyName: string;
  companyUrl?: string;
  industry?: string;
  provider: ProviderConfig;
  plan: ResearchPlan;
  queryTarget?: number;
  followupTarget?: number;
  searchConcurrency?: number;
}): Promise<void> {
  const t0 = Date.now();
  const db = admin();
  const section = getSection(opts.sectionNumber);
  const agent = `${section.shortName} Agent`;
  const QUERY_TARGET = opts.queryTarget ?? 40;
  const FOLLOWUP_TARGET = opts.followupTarget ?? 12;
  const CONCURRENCY = opts.searchConcurrency ?? 6;

  await db
    .from("section_results")
    .update({ status: "running" })
    .eq("job_id", opts.jobId)
    .eq("section_number", opts.sectionNumber);

  await db
    .from("research_jobs")
    .update({ current_agent: agent, current_phase: `Running ${section.name}` })
    .eq("id", opts.jobId);

  const sectionMeta = { number: section.number, name: section.name };
  const slog = (
    kind: LogKind,
    action: string,
    detail?: string,
    metadata?: Record<string, unknown>,
    status: "started" | "working" | "done" | "error" = "working",
  ) =>
    log(opts.jobId, agent, kind, action, detail, { ...(metadata ?? {}), sectionNumber: section.number, sectionName: section.name }, status);

  await slog("status", "Agent deployed", section.focus, {}, "started");

  try {
    const url = normalizeUrl(opts.companyUrl);

    // 0. Plan: emphasis for this section
    const emphasis = opts.plan.section_briefs?.[String(opts.sectionNumber)] ?? section.focus;
    await slog("thought", "Section brief", emphasis, { phase: "planning" });

    // 1. Dynamic query generation (target 40)
    await slog("status", `Generating ${QUERY_TARGET} dynamic queries`);
    const queries = await generateSectionQueries({
      companyName: opts.companyName,
      companyUrl: opts.companyUrl,
      industry: opts.industry,
      section,
      plan: opts.plan,
      provider: opts.provider,
      target: QUERY_TARGET,
    });
    await slog("status", `Query plan ready`, `${queries.length} queries queued`, { count: queries.length });

    // 2. Execute batch 1 — throttled concurrency
    const runBatch = async (batchLabel: string, batch: string[]) => {
      const results: TavilyResult[] = [];
      await pMap(batch, CONCURRENCY, async (q) => {
        await slog("query", `Search (${batchLabel})`, q, { query: q, batch: batchLabel });
        const rs = await tavilySearch(q, 5);
        results.push(...rs);
        for (const r of rs.slice(0, 2)) {
          await slog("source", "Source", r.title, {
            url: r.url,
            title: r.title,
            snippet: (r.content ?? "").slice(0, 320),
            score: r.score,
            query: q,
            batch: batchLabel,
          });
        }
      });
      return results;
    };

    const primary = await runBatch("primary", queries);
    let allResults: TavilyResult[] = [...primary];

    // 3. Gap analysis + follow-up batch
    const uniquePrimary = Array.from(new Map(primary.map((r) => [r.url, r])).values());
    const snippetsForGap = uniquePrimary
      .slice(0, 30)
      .map((r) => `- [${r.title}](${r.url})\n  ${(r.content ?? "").slice(0, 240)}`)
      .join("\n");

    await slog("status", "Reasoning over collected evidence");
    const gap = await findResearchGaps({
      section,
      companyName: opts.companyName,
      snippets: snippetsForGap,
      provider: opts.provider,
    });
    await slog("thought", "Gap analysis", gap.reasoning || (gap.satisfied ? "Coverage sufficient" : "Coverage incomplete"), { satisfied: gap.satisfied, followups: gap.followups.length });

    let followupQueries: string[] = [];
    if (!gap.satisfied && gap.followups.length > 0) {
      followupQueries = gap.followups.slice(0, FOLLOWUP_TARGET);
      await slog("status", `Firing ${followupQueries.length} follow-up queries`);
      const followupResults = await runBatch("followup", followupQueries);
      allResults = [...allResults, ...followupResults];
    }

    const uniqueByUrl = Array.from(new Map(allResults.map((r) => [r.url, r])).values());
    const topResults = uniqueByUrl.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10);


    // 2. Scrape
    const companySiteScrapes: string[] = [];
    if (url && section.scrapePaths) {
      const origin = new URL(url).origin;
      for (const p of section.scrapePaths) companySiteScrapes.push(`${origin}${p}`);
    }
    const urlsToScrape = Array.from(new Set([...companySiteScrapes, ...topResults.slice(0, 5).map((r) => r.url)]));
    await slog("status", `Scraping ${urlsToScrape.length} pages`);
    const scrapes = await Promise.all(
      urlsToScrape.map(async (u) => {
        const s = await firecrawlScrape(u);
        await slog("scrape", s.markdown ? "Extracted" : "Skipped", s.error || `${s.markdown.length.toLocaleString()} chars`, { url: u, chars: s.markdown.length, error: s.error });
        return s;
      }),
    );
    const successful = scrapes.filter((s) => s.markdown.length > 200);

    // 3. Context
    const searchSnippets = topResults
      .map((r) => `### ${r.title}\nURL: ${r.url}\n${r.content}`)
      .join("\n\n")
      .slice(0, 12000);
    const scrapedContent = successful
      .map((s) => `### Scraped: ${s.url}\n${s.markdown}`)
      .join("\n\n")
      .slice(0, 18000);

    const userContext = `Company: ${opts.companyName}
Website: ${url ?? "not provided"}
Industry: ${opts.industry ?? "not specified"}

=== SEARCH RESULT SNIPPETS ===
${searchSnippets}

=== SCRAPED PAGE CONTENT ===
${scrapedContent}

Analyze the above data and produce Section ${section.number}: ${section.name}. Follow the required output structure exactly.`;

    // 4. Streamed analysis
    await slog("status", `Synthesizing with ${opts.provider.provider}:${opts.provider.model}`);
    const { text: analyzed, tokens } = await analyzeStreamed(opts.jobId, agent, section.systemPrompt, userContext, opts.provider, sectionMeta);
    const confidence = extractConfidence(analyzed);
    const findings = extractKeyFindings(analyzed);

    await db
      .from("section_results")
      .update({
        status: "complete",
        analyzed_content: analyzed,
        key_findings: findings,
        confidence_score: confidence,
        data_sources: topResults.map((r) => ({ url: r.url, title: r.title })),
        search_queries_used: [...queries, ...followupQueries],
        pages_scraped: successful.length,
        tokens_used: tokens,
        processing_time_ms: Date.now() - t0,
        raw_research: {
          primaryQueries: queries.length,
          followupQueries: followupQueries.length,
          searchCount: uniqueByUrl.length,
          scrapeCount: successful.length,
          gap: { satisfied: gap.satisfied, reasoning: gap.reasoning },
          emphasis,
        },
      })
      .eq("job_id", opts.jobId)
      .eq("section_number", opts.sectionNumber);

    await bumpProgress(opts.jobId);

    await slog("status", "Section complete", `Confidence ${confidence}% • ${findings.length} findings`, { confidence, findings: findings.length }, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Section ${opts.sectionNumber} failed:`, msg);
    await db
      .from("section_results")
      .update({ status: "failed", analyzed_content: `Error: ${msg}`, processing_time_ms: Date.now() - t0 })
      .eq("job_id", opts.jobId)
      .eq("section_number", opts.sectionNumber);
    await slog("status", "Section failed", msg, { error: msg }, "error");
  }
}

/**
 * Section 14 — Executive Recommendations. Reads the analyzed markdown from
 * all prior completed sections and synthesizes a CEO-grade brief.
 */
export async function runSynthesisSection(opts: {
  jobId: string;
  userId: string;
  sectionNumber: number;
  companyName: string;
  provider: ProviderConfig;
}): Promise<void> {
  const t0 = Date.now();
  const db = admin();
  const section = getSection(opts.sectionNumber);
  const agent = `${section.shortName} Agent`;

  await db.from("section_results").update({ status: "running" }).eq("job_id", opts.jobId).eq("section_number", opts.sectionNumber);
  await db.from("research_jobs").update({ current_agent: agent, current_phase: "Synthesizing executive brief" }).eq("id", opts.jobId);
  const sectionMeta = { number: section.number, name: section.name };
  const slog = (
    kind: LogKind,
    action: string,
    detail?: string,
    metadata?: Record<string, unknown>,
    status: "started" | "working" | "done" | "error" = "working",
  ) =>
    log(opts.jobId, agent, kind, action, detail, { ...(metadata ?? {}), sectionNumber: section.number, sectionName: section.name }, status);

  await slog("status", "Synthesizer deployed", "Reading all prior sections", {}, "started");

  try {
    const { data: priors } = await db
      .from("section_results")
      .select("section_number, section_name, analyzed_content, confidence_score")
      .eq("job_id", opts.jobId)
      .in("status", ["complete"])
      .lt("section_number", section.number)
      .order("section_number");

    if (!priors || priors.length === 0) throw new Error("No completed sections to synthesize");

    const context = priors
      .map((s) => `=== SECTION ${s.section_number}: ${s.section_name} (Confidence ${s.confidence_score}%) ===\n${s.analyzed_content ?? ""}`)
      .join("\n\n")
      .slice(0, 55000);

    const userContext = `Target company: ${opts.companyName}\n\n${context}\n\nProduce the Executive Recommendations brief exactly as specified.`;

    await slog("status", `Synthesizing across ${priors.length} sections`);
    for (const p of priors) {
      await slog("source", "Prior section", `Section ${p.section_number}: ${p.section_name}`, {
        url: `#section-${p.section_number}`,
        title: `Section ${p.section_number}: ${p.section_name}`,
        score: (p.confidence_score ?? 0) / 100,
        snippet: (p.analyzed_content ?? "").slice(0, 320),
      });
    }
    const { text, tokens } = await analyzeStreamed(opts.jobId, agent, section.systemPrompt, userContext, opts.provider, sectionMeta);
    const confidence = extractConfidence(text);
    const findings = extractKeyFindings(text);

    await db
      .from("section_results")
      .update({
        status: "complete",
        analyzed_content: text,
        key_findings: findings,
        confidence_score: confidence,
        tokens_used: tokens,
        processing_time_ms: Date.now() - t0,
        raw_research: { synthesizedFrom: priors.length },
      })
      .eq("job_id", opts.jobId)
      .eq("section_number", opts.sectionNumber);

    await bumpProgress(opts.jobId);
    await slog("status", "Executive brief complete", `Confidence ${confidence}%`, { confidence }, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("section_results").update({ status: "failed", analyzed_content: `Error: ${msg}`, processing_time_ms: Date.now() - t0 }).eq("job_id", opts.jobId).eq("section_number", opts.sectionNumber);
    await slog("status", "Synthesis failed", msg, { error: msg }, "error");
  }
}

async function bumpProgress(jobId: string) {
  const db = admin();
  const { data: doneRows } = await db.from("section_results").select("status").eq("job_id", jobId).eq("status", "complete");
  const done = doneRows?.length ?? 0;
  await db
    .from("research_jobs")
    .update({
      completed_sections: done,
      progress_percentage: Math.min(97, Math.round((done / ACTIVE_SECTION_NUMBERS.length) * 95) + 2),
    })
    .eq("id", jobId);
}

/* -------------------------------------------------------------------------- */
/*                            Hunter.io — contacts                             */
/* -------------------------------------------------------------------------- */

type HunterEmail = {
  value: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  confidence?: number;
};

async function hunterDomainSearch(domain: string): Promise<HunterEmail[]> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=25&type=personal&api_key=${key}`);
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.data?.emails ?? []) as HunterEmail[];
  } catch (e) {
    console.error("hunter error", e);
    return [];
  }
}

function classifyRole(seniority?: string | null, position?: string | null): {
  buying_role: "primary_buyer" | "champion" | "influencer" | "executive_sponsor" | "end_user";
  outreach_priority: "high" | "medium" | "low";
} {
  const p = (position ?? "").toLowerCase();
  const s = (seniority ?? "").toLowerCase();
  if (/(ceo|founder|coo|cto|cmo|cfo|chief|president|vp|vice president)/.test(p) || s === "executive") {
    return { buying_role: "executive_sponsor", outreach_priority: "high" };
  }
  if (/(head|director|principal)/.test(p) || s === "senior") {
    return { buying_role: "primary_buyer", outreach_priority: "high" };
  }
  if (/(manager|lead)/.test(p) || s === "manager") {
    return { buying_role: "champion", outreach_priority: "medium" };
  }
  return { buying_role: "influencer", outreach_priority: "low" };
}

export async function extractContacts(jobId: string, userId: string, companyName: string, companyUrl?: string | null) {
  const db = admin();
  const url = normalizeUrl(companyUrl);
  if (!url) {
    await log(jobId, "Contact Agent", "status", "Skipping contacts", "No company URL provided");
    return;
  }
  const domain = new URL(url).hostname.replace(/^www\./, "");
  await log(jobId, "Contact Agent", "status", "Searching for buying-committee contacts", domain, { domain }, "started");

  const emails = await hunterDomainSearch(domain);
  if (emails.length === 0) {
    await log(jobId, "Contact Agent", "status", "No contacts found", domain, {}, "done");
    return;
  }

  const rows = emails
    .filter((e) => e.value)
    .map((e) => {
      const fullName = [e.first_name, e.last_name].filter(Boolean).join(" ") || null;
      const { buying_role, outreach_priority } = classifyRole(e.seniority, e.position);
      return {
        job_id: jobId,
        user_id: userId,
        company_name: companyName,
        email: e.value,
        email_confidence: e.confidence ?? null,
        full_name: fullName,
        job_title: e.position ?? null,
        seniority_level: e.seniority ?? null,
        department: e.department ?? null,
        linkedin_url: e.linkedin ?? null,
        twitter_handle: e.twitter ?? null,
        buying_role,
        outreach_priority,
        suggested_hook: null,
      };
    });

  if (rows.length > 0) {
    await db.from("contacts").insert(rows);
  }
  await log(jobId, "Contact Agent", "status", `Enriched ${rows.length} contacts`, `${rows.filter((r) => r.outreach_priority === "high").length} high-priority`, { count: rows.length }, "done");
}

/* -------------------------------------------------------------------------- */
/*                           Final report generation                           */
/* -------------------------------------------------------------------------- */

async function generateReport(jobId: string, userId: string, companyName: string) {
  const db = admin();
  await log(jobId, "Report Composer", "status", "Composing final dossier", companyName, {}, "started");

  const { data: sections } = await db
    .from("section_results")
    .select("section_number, section_name, analyzed_content, confidence_score, pages_scraped, tokens_used")
    .eq("job_id", jobId)
    .eq("status", "complete")
    .order("section_number");

  if (!sections || sections.length === 0) {
    await log(jobId, "Report Composer", "status", "No sections to compile", "", {}, "error");
    return;
  }

  const synth = sections.find((s) => s.section_number === 14);
  const cover = `# ${companyName} — Intelligence Dossier
_Generated by ANOLUX Intelligence Engine • ${new Date().toISOString().slice(0, 10)}_

**Sections compiled:** ${sections.length}
**Average confidence:** ${Math.round(sections.reduce((a, s) => a + (s.confidence_score ?? 0), 0) / sections.length)}%
**Pages scraped:** ${sections.reduce((a, s) => a + (s.pages_scraped ?? 0), 0)}

---
`;

  const toc = `## Contents\n${sections.map((s) => `${s.section_number}. ${s.section_name}`).join("\n")}\n\n---\n`;

  const body = sections
    .map((s) => `# ${s.section_number}. ${s.section_name}\n\n${s.analyzed_content ?? ""}\n\n---\n`)
    .join("\n");

  const markdown = cover + toc + body;
  const words = markdown.split(/\s+/).length;
  const pages = Math.max(1, Math.ceil(words / 400));

  // Executive brief = synthesis section alone
  if (synth?.analyzed_content) {
    await db.from("reports").insert({
      job_id: jobId,
      user_id: userId,
      title: `${companyName} — Executive Brief`,
      report_type: "executive_brief",
      markdown_content: `# ${companyName} — Executive Brief\n\n${synth.analyzed_content}`,
      content: { section_ids: [14] },
      word_count: synth.analyzed_content.split(/\s+/).length,
      page_count: Math.max(1, Math.ceil(synth.analyzed_content.split(/\s+/).length / 400)),
    });
  }

  await db.from("reports").insert({
    job_id: jobId,
    user_id: userId,
    title: `${companyName} — Full Dossier`,
    report_type: "full_dossier",
    markdown_content: markdown,
    content: { section_ids: sections.map((s) => s.section_number) },
    word_count: words,
    page_count: pages,
  });

  await log(jobId, "Report Composer", "status", "Dossier composed", `${pages} pages • ${words.toLocaleString()} words`, { pages, words }, "done");
}

/* -------------------------------------------------------------------------- */
/*                                Orchestrator                                 */
/* -------------------------------------------------------------------------- */

export async function runResearchJob(jobId: string): Promise<void> {
  const db = admin();
  const { data: job, error } = await db.from("research_jobs").select("*").eq("id", jobId).single();
  if (error || !job) throw new Error(`Job ${jobId} not found`);

  const allSections = ACTIVE_SECTION_NUMBERS;
  const researchSections = allSections.filter((n) => !getSection(n).synthesis);
  const synthesisSections = allSections.filter((n) => getSection(n).synthesis);

  // Resolve AI provider (BYO keys + model selection) once per job.
  let provider: ProviderConfig;
  try {
    provider = await resolveProvider(job.user_id);
    await log(jobId, "Orchestrator", "status", "AI provider connected", `${provider.provider} • ${provider.model}`, { provider: provider.provider, model: provider.model }, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("research_jobs").update({ status: "failed", current_phase: "AI provider error", error_message: msg }).eq("id", jobId);
    await log(jobId, "Orchestrator", "status", "AI provider not available", msg, { error: msg }, "error");
    throw e;
  }

  await db
    .from("research_jobs")
    .update({
      status: "researching",
      current_phase: `Deploying ${researchSections.length} research agents`,
      progress_percentage: 3,
      total_sections: allSections.length,
    })
    .eq("id", jobId);
  await log(jobId, "Orchestrator", "status", "Launching agents", `${researchSections.length} research + ${synthesisSections.length} synthesis`, { sections: allSections }, "started");

  // Wave 1: research sections (1–13), throttled in waves of 5
  const WAVE = 5;
  for (let i = 0; i < researchSections.length; i += WAVE) {
    const wave = researchSections.slice(i, i + WAVE);
    await Promise.all(
      wave.map((n) =>
        runSection({
          jobId,
          userId: job.user_id,
          sectionNumber: n,
          companyName: job.company_name,
          companyUrl: job.company_url ?? undefined,
          industry: job.industry ?? undefined,
          provider,
        }),
      ),
    );
  }

  // Wave 2: synthesis (14)
  await db.from("research_jobs").update({ current_phase: "Synthesizing", progress_percentage: 92 }).eq("id", jobId);
  for (const n of synthesisSections) {
    await runSynthesisSection({ jobId, userId: job.user_id, sectionNumber: n, companyName: job.company_name, provider });
  }

  // Wave 3: contacts + report — run in parallel
  await db.from("research_jobs").update({ current_phase: "Compiling dossier & extracting contacts", progress_percentage: 96 }).eq("id", jobId);
  await Promise.all([
    extractContacts(jobId, job.user_id, job.company_name, job.company_url),
    generateReport(jobId, job.user_id, job.company_name),
  ]);

  const { data: results } = await db.from("section_results").select("status").eq("job_id", jobId);
  const completed = (results ?? []).filter((r) => r.status === "complete").length;
  const failed = (results ?? []).filter((r) => r.status === "failed").length;

  await db
    .from("research_jobs")
    .update({
      status: failed === allSections.length ? "failed" : "complete",
      progress_percentage: 100,
      current_phase: "Intelligence dossier ready",
      current_agent: "",
      completed_sections: completed,
      error_message:
        failed > 0 && failed < allSections.length
          ? `${failed} section(s) failed`
          : failed === allSections.length
          ? "All sections failed"
          : null,
    })
    .eq("id", jobId);

  await log(jobId, "Orchestrator", "status", "Job complete", `${completed}/${allSections.length} sections • report ready`, { completed, failed }, "done");
}


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

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY missing");
  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "advanced",
      include_raw_content: false,
      max_results: 6,
    }),
  });
  if (!res.ok) {
    console.error("tavily error", res.status, await res.text());
    return [];
  }
  const j = await res.json();
  return (j.results ?? []) as TavilyResult[];
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
      await log(jobId, agent, "thought", "reasoning", slice);
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

export async function runSection(opts: {
  jobId: string;
  userId: string;
  sectionNumber: number;
  companyName: string;
  companyUrl?: string;
  industry?: string;
  provider: ProviderConfig;
}): Promise<void> {
  const t0 = Date.now();
  const db = admin();
  const section = getSection(opts.sectionNumber);
  const agent = `${section.shortName} Agent`;

  await db
    .from("section_results")
    .update({ status: "running" })
    .eq("job_id", opts.jobId)
    .eq("section_number", opts.sectionNumber);

  await db
    .from("research_jobs")
    .update({ current_agent: agent, current_phase: `Running ${section.name}` })
    .eq("id", opts.jobId);

  await log(opts.jobId, agent, "status", "Agent deployed", section.focus, { sectionNumber: section.number, sectionName: section.name }, "started");

  try {
    const url = normalizeUrl(opts.companyUrl);
    const queries = section.searchTemplates({ company: opts.companyName, url, industry: opts.industry }).slice(0, 6);

    // 1. Search
    const allResults: TavilyResult[] = [];
    await Promise.all(
      queries.map(async (q) => {
        await log(opts.jobId, agent, "query", "Search", q, { query: q });
        const rs = await tavilySearch(q);
        allResults.push(...rs);
        for (const r of rs.slice(0, 3)) {
          await log(opts.jobId, agent, "source", "Source", r.title, {
            url: r.url,
            title: r.title,
            snippet: (r.content ?? "").slice(0, 320),
            score: r.score,
            query: q,
          });
        }
      }),
    );
    const uniqueByUrl = Array.from(new Map(allResults.map((r) => [r.url, r])).values());
    const topResults = uniqueByUrl.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);

    // 2. Scrape
    const companySiteScrapes: string[] = [];
    if (url && section.scrapePaths) {
      const origin = new URL(url).origin;
      for (const p of section.scrapePaths) companySiteScrapes.push(`${origin}${p}`);
    }
    const urlsToScrape = Array.from(new Set([...companySiteScrapes, ...topResults.slice(0, 5).map((r) => r.url)]));
    await log(opts.jobId, agent, "status", `Scraping ${urlsToScrape.length} pages`);
    const scrapes = await Promise.all(
      urlsToScrape.map(async (u) => {
        const s = await firecrawlScrape(u);
        await log(opts.jobId, agent, "scrape", s.markdown ? "Extracted" : "Skipped", s.error || `${s.markdown.length.toLocaleString()} chars`, { url: u, chars: s.markdown.length, error: s.error });
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
    await log(opts.jobId, agent, "status", `Synthesizing with ${opts.provider.provider}:${opts.provider.model}`);
    const { text: analyzed, tokens } = await analyzeStreamed(opts.jobId, agent, section.systemPrompt, userContext, opts.provider);
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
        search_queries_used: queries,
        pages_scraped: successful.length,
        tokens_used: tokens,
        processing_time_ms: Date.now() - t0,
        raw_research: { searchCount: uniqueByUrl.length, scrapeCount: successful.length },
      })
      .eq("job_id", opts.jobId)
      .eq("section_number", opts.sectionNumber);

    await bumpProgress(opts.jobId);

    await log(opts.jobId, agent, "status", "Section complete", `Confidence ${confidence}% • ${findings.length} findings`, { confidence, findings: findings.length }, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Section ${opts.sectionNumber} failed:`, msg);
    await db
      .from("section_results")
      .update({ status: "failed", analyzed_content: `Error: ${msg}`, processing_time_ms: Date.now() - t0 })
      .eq("job_id", opts.jobId)
      .eq("section_number", opts.sectionNumber);
    await log(opts.jobId, agent, "status", "Section failed", msg, { error: msg }, "error");
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
}): Promise<void> {
  const t0 = Date.now();
  const db = admin();
  const section = getSection(opts.sectionNumber);
  const agent = `${section.shortName} Agent`;

  await db.from("section_results").update({ status: "running" }).eq("job_id", opts.jobId).eq("section_number", opts.sectionNumber);
  await db.from("research_jobs").update({ current_agent: agent, current_phase: "Synthesizing executive brief" }).eq("id", opts.jobId);
  await log(opts.jobId, agent, "status", "Synthesizer deployed", "Reading all prior sections", { sectionNumber: section.number }, "started");

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

    await log(opts.jobId, agent, "status", `Synthesizing across ${priors.length} sections`);
    const { text, tokens } = await analyzeStreamed(opts.jobId, agent, section.systemPrompt, userContext);
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
    await log(opts.jobId, agent, "status", "Executive brief complete", `Confidence ${confidence}%`, { confidence }, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("section_results").update({ status: "failed", analyzed_content: `Error: ${msg}`, processing_time_ms: Date.now() - t0 }).eq("job_id", opts.jobId).eq("section_number", opts.sectionNumber);
    await log(opts.jobId, agent, "status", "Synthesis failed", msg, { error: msg }, "error");
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
        }),
      ),
    );
  }

  // Wave 2: synthesis (14)
  await db.from("research_jobs").update({ current_phase: "Synthesizing", progress_percentage: 92 }).eq("id", jobId);
  for (const n of synthesisSections) {
    await runSynthesisSection({ jobId, userId: job.user_id, sectionNumber: n, companyName: job.company_name });
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


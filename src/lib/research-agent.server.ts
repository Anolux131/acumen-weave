// Server-only research agent. Never import from client-reachable modules.
// Uses Tavily (search) + Firecrawl (scrape) + Lovable AI Gateway (analysis).

import { createClient } from "@supabase/supabase-js";
import { getSection } from "./section-config";

type TavilyResult = { url: string; title: string; content: string; raw_content?: string; score?: number };
type ScrapeResult = { url: string; markdown: string; error?: string };

const TAVILY_URL = "https://api.tavily.com/search";
const FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ANALYSIS_MODEL = "google/gemini-2.5-flash";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function logAgent(jobId: string, agent: string, action: string, detail?: string, status: "started" | "working" | "done" | "error" = "working") {
  try {
    await admin().from("agent_logs").insert({ job_id: jobId, agent_name: agent, action, detail: detail ?? null, status });
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

async function analyze(systemPrompt: string, userContext: string): Promise<{ text: string; tokens: number }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContext },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lovable AI ${res.status}: ${body.slice(0, 400)}`);
  }
  const j = await res.json();
  const text: string = j?.choices?.[0]?.message?.content ?? "";
  const tokens: number = j?.usage?.total_tokens ?? 0;
  return { text, tokens };
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

  await logAgent(opts.jobId, agent, "Deploying research agent", section.focus, "started");

  try {
    const url = normalizeUrl(opts.companyUrl);
    const queries = section.searchTemplates({ company: opts.companyName, url, industry: opts.industry }).slice(0, 6);

    // 1. Search
    await logAgent(opts.jobId, agent, `Running ${queries.length} Tavily searches`, queries.join(" • "));
    const searchResults = (await Promise.all(queries.map(tavilySearch))).flat();
    const uniqueByUrl = Array.from(new Map(searchResults.map((r) => [r.url, r])).values());
    const topResults = uniqueByUrl.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);
    await logAgent(opts.jobId, agent, `Found ${uniqueByUrl.length} results`, `Selecting top ${topResults.length} for scraping`);

    // 2. Scrape top results in parallel + company-site paths
    const companySiteScrapes: string[] = [];
    if (url && section.scrapePaths) {
      const origin = new URL(url).origin;
      for (const p of section.scrapePaths) companySiteScrapes.push(`${origin}${p}`);
    }
    const urlsToScrape = [...companySiteScrapes, ...topResults.slice(0, 5).map((r) => r.url)];
    await logAgent(opts.jobId, agent, `Scraping ${urlsToScrape.length} pages via Firecrawl`);
    const scrapes = await Promise.all(urlsToScrape.map(firecrawlScrape));
    const successful = scrapes.filter((s) => s.markdown.length > 200);
    await logAgent(opts.jobId, agent, `Extracted ${successful.length} pages`, `${successful.reduce((n, s) => n + s.markdown.length, 0).toLocaleString()} chars total`);

    // 3. Build context (cap at ~30K chars to stay under model limits)
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

    // 4. Analyze
    await logAgent(opts.jobId, agent, `Analyzing with ${ANALYSIS_MODEL}`);
    const { text: analyzed, tokens } = await analyze(section.systemPrompt, userContext);
    const confidence = extractConfidence(analyzed);
    const findings = extractKeyFindings(analyzed);

    // 5. Persist
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

    await logAgent(opts.jobId, agent, "Section complete", `Confidence ${confidence}% • ${findings.length} key findings`, "done");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Section ${opts.sectionNumber} failed:`, msg);
    await db
      .from("section_results")
      .update({ status: "failed", analyzed_content: `Error: ${msg}`, processing_time_ms: Date.now() - t0 })
      .eq("job_id", opts.jobId)
      .eq("section_number", opts.sectionNumber);
    await logAgent(opts.jobId, agent, "Section failed", msg, "error");
  }
}

export async function runResearchJob(jobId: string): Promise<void> {
  const db = admin();
  const { data: job, error } = await db.from("research_jobs").select("*").eq("id", jobId).single();
  if (error || !job) throw new Error(`Job ${jobId} not found`);

  await db.from("research_jobs").update({ status: "researching", current_phase: "Deploying agents", progress_percentage: 5 }).eq("id", jobId);
  await logAgent(jobId, "Orchestrator", "Launching research agents", "Sections 1–4 running in parallel", "started");

  const sections = [1, 2, 3, 4];
  // Run all 4 sections in parallel
  await Promise.all(
    sections.map((n) =>
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

  const { data: results } = await db.from("section_results").select("status").eq("job_id", jobId);
  const completed = (results ?? []).filter((r) => r.status === "complete").length;
  const failed = (results ?? []).filter((r) => r.status === "failed").length;

  await db
    .from("research_jobs")
    .update({
      status: failed === sections.length ? "failed" : "complete",
      progress_percentage: 100,
      current_phase: "Research complete",
      current_agent: "",
      completed_sections: completed,
      error_message: failed > 0 && failed < sections.length ? `${failed} section(s) failed` : failed === sections.length ? "All sections failed" : null,
    })
    .eq("id", jobId);

  await logAgent(jobId, "Orchestrator", "Job complete", `${completed}/${sections.length} sections succeeded`, "done");
}

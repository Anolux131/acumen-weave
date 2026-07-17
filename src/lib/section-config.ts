// Metadata for the 14 intelligence sections. Phase 2 activates 1–4 only.
export type SectionMeta = {
  number: number;
  name: string;
  shortName: string;
  focus: string;
  searchTemplates: (input: { company: string; url?: string; industry?: string }) => string[];
  scrapePaths?: string[]; // paths on the company site to always scrape
  systemPrompt: string;
};

const identity = "You are a senior competitive intelligence analyst. Cite specific evidence from the RAW RESEARCH. Never guess figures. Return well-structured markdown with clear headings and bullet points.";

export const SECTIONS: SectionMeta[] = [
  {
    number: 1,
    name: "Executive Intelligence",
    shortName: "Executive",
    focus: "Funding, leadership, ARR signals, hiring, strategic direction, recent news.",
    searchTemplates: ({ company }) => [
      `${company} funding round Series`,
      `${company} CEO founder leadership`,
      `${company} ARR revenue growth`,
      `${company} employee count hiring`,
      `${company} acquisition news 2025`,
      `${company} crunchbase profile`,
      `${company} company overview`,
      `${company} press release announcement`,
    ],
    scrapePaths: ["/", "/about", "/company", "/team"],
    systemPrompt: `${identity}
Section 1 — Executive Intelligence. Analyze the raw research and produce:
## Company Overview
## Funding & Investors
## Leadership Team
## Revenue & Growth Signals
## Hiring & Team Size
## Strategic Direction
## Recent News (last 12 months)
## Key Findings (3–5 bullets, each cites evidence)
End with a single line: **Confidence: HIGH|MEDIUM|LOW** — based on source quality.`,
  },
  {
    number: 2,
    name: "Market Position",
    shortName: "Market",
    focus: "Competitors, market share, positioning, category dynamics.",
    searchTemplates: ({ company, industry }) => [
      `${company} vs competitors comparison`,
      `${company} alternatives`,
      `top ${industry || "SaaS"} companies market share`,
      `${company} G2 category leaders`,
      `${company} market position analysis`,
      `${company} competitive landscape`,
      `${industry || company} industry report`,
      `${company} best alternatives 2025`,
    ],
    systemPrompt: `${identity}
Section 2 — Market Position. Produce:
## Market Category
## Top 5 Competitors (table: name | 1-line positioning | perceived strength)
## Where They Rank
## Category Dynamics & Trends
## Their Strongest Differentiator
## Biggest Competitive Threat
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 3,
    name: "Customer Intelligence",
    shortName: "Customer",
    focus: "Reviews, quotes, community sentiment, customer segments.",
    searchTemplates: ({ company }) => [
      `${company} reviews G2`,
      `${company} customer reviews Capterra`,
      `${company} customer complaints`,
      `${company} testimonials case study`,
      `${company} reddit review`,
      `${company} customer segments target market`,
      `${company} user experience feedback`,
      `${company} pros and cons`,
    ],
    systemPrompt: `${identity}
Section 3 — Customer Intelligence. Produce:
## Customer Sentiment Overview
## Positive Themes (with quotes)
## Negative Themes (with quotes)
## Primary Customer Segments
## Ideal Customer Profile (as evidenced by reviews)
## Churn / Frustration Signals
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 4,
    name: "Website Intelligence",
    shortName: "Website",
    focus: "Homepage clarity, UX, conversion, technical SEO signals.",
    searchTemplates: ({ company, url }) => [
      `site:${url ? new URL(url.startsWith("http") ? url : `https://${url}`).hostname : company + ".com"}`,
      `${company} website review`,
      `${company} pricing page`,
      `${company} landing page conversion`,
      `${company} homepage design`,
      `${company} SEO analysis`,
    ],
    scrapePaths: ["/", "/pricing", "/product", "/features", "/demo"],
    systemPrompt: `${identity}
Section 4 — Website Intelligence. Produce:
## Homepage Message Clarity
## Value Proposition (as stated)
## Primary CTAs & Conversion Path
## Pricing Page Assessment (or absence thereof)
## UX / Navigation Observations
## Technical & SEO Signals
## Website Vulnerabilities (3+ specific issues)
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  // Placeholders for sections 5–14 (metadata only, not run in Phase 2)
  { number: 5, name: "AI Visibility Intelligence", shortName: "AI Visibility", focus: "LLM discoverability", searchTemplates: () => [], systemPrompt: "" },
  { number: 6, name: "Search Intelligence", shortName: "Search", focus: "SEO", searchTemplates: () => [], systemPrompt: "" },
  { number: 7, name: "Messaging Intelligence", shortName: "Messaging", focus: "Positioning", searchTemplates: () => [], systemPrompt: "" },
  { number: 8, name: "Content Intelligence", shortName: "Content", focus: "Content", searchTemplates: () => [], systemPrompt: "" },
  { number: 9, name: "Funnel Intelligence", shortName: "Funnel", focus: "Conversion", searchTemplates: () => [], systemPrompt: "" },
  { number: 10, name: "Product Intelligence", shortName: "Product", focus: "Features", searchTemplates: () => [], systemPrompt: "" },
  { number: 11, name: "Trust Intelligence", shortName: "Trust", focus: "Reviews", searchTemplates: () => [], systemPrompt: "" },
  { number: 12, name: "Revenue Intelligence", shortName: "Revenue", focus: "ARR", searchTemplates: () => [], systemPrompt: "" },
  { number: 13, name: "Opportunity Intelligence", shortName: "Opportunities", focus: "Strategic", searchTemplates: () => [], systemPrompt: "" },
  { number: 14, name: "Executive Recommendations", shortName: "Recommendations", focus: "CEO roadmap", searchTemplates: () => [], systemPrompt: "" },
];

// Which sections actually run right now (Phase 2)
export const ACTIVE_SECTION_NUMBERS = [1, 2, 3, 4];

export function getSection(n: number): SectionMeta {
  const s = SECTIONS.find((s) => s.number === n);
  if (!s) throw new Error(`Unknown section number: ${n}`);
  return s;
}

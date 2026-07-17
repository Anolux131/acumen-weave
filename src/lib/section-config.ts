// Metadata for the 14 intelligence sections. Phases 2+3 activate sections 1–10.
export type SectionMeta = {
  number: number;
  name: string;
  shortName: string;
  focus: string;
  searchTemplates: (input: { company: string; url?: string; industry?: string }) => string[];
  scrapePaths?: string[];
  systemPrompt: string;
};

const identity =
  "You are a senior competitive intelligence analyst. Cite specific evidence from the RAW RESEARCH. Never guess figures. Return well-structured markdown with clear headings and bullet points.";

const confidenceTail =
  "\nEnd with a single line: **Confidence: HIGH|MEDIUM|LOW** — based on source quality.";

function host(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return "";
  }
}

export const SECTIONS: SectionMeta[] = [
  {
    number: 1,
    name: "Executive Intelligence",
    shortName: "Executive",
    focus: "Funding, leadership, ARR signals, hiring, strategic direction.",
    searchTemplates: ({ company }) => [
      `${company} funding round Series`,
      `${company} CEO founder leadership`,
      `${company} ARR revenue growth`,
      `${company} employee count hiring`,
      `${company} acquisition news 2025`,
      `${company} crunchbase profile`,
      `${company} press release announcement`,
    ],
    scrapePaths: ["/", "/about", "/company", "/team"],
    systemPrompt: `${identity}
Section 1 — Executive Intelligence. Produce:
## Company Overview
## Funding & Investors
## Leadership Team
## Revenue & Growth Signals
## Hiring & Team Size
## Strategic Direction
## Recent News (last 12 months)
## Key Findings (3–5 bullets, each cites evidence)${confidenceTail}`,
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
      `${company} competitive landscape`,
      `${industry || company} industry report`,
      `${company} best alternatives 2025`,
    ],
    systemPrompt: `${identity}
Section 2 — Market Position. Produce:
## Market Category
## Top 5 Competitors (table)
## Where They Rank
## Category Dynamics & Trends
## Their Strongest Differentiator
## Biggest Competitive Threat
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 3,
    name: "Customer Intelligence",
    shortName: "Customer",
    focus: "Reviews, quotes, community sentiment, segments.",
    searchTemplates: ({ company }) => [
      `${company} reviews G2`,
      `${company} customer reviews Capterra`,
      `${company} customer complaints`,
      `${company} testimonials case study`,
      `${company} reddit review`,
      `${company} customer segments target market`,
      `${company} pros and cons`,
    ],
    systemPrompt: `${identity}
Section 3 — Customer Intelligence. Produce:
## Customer Sentiment Overview
## Positive Themes (with quotes)
## Negative Themes (with quotes)
## Primary Customer Segments
## Ideal Customer Profile
## Churn / Frustration Signals
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 4,
    name: "Website Intelligence",
    shortName: "Website",
    focus: "Homepage clarity, UX, conversion, technical SEO signals.",
    searchTemplates: ({ company, url }) => [
      host(url) ? `site:${host(url)}` : `${company} website`,
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
## Value Proposition
## Primary CTAs & Conversion Path
## Pricing Page Assessment
## UX / Navigation Observations
## Technical & SEO Signals
## Website Vulnerabilities (3+ specific issues)
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 5,
    name: "AI Visibility Intelligence",
    shortName: "AI Visibility",
    focus: "How the company appears in LLM answers, AI search, and generative discovery.",
    searchTemplates: ({ company, industry }) => [
      `${company} ChatGPT mentions`,
      `${company} Perplexity answer`,
      `best ${industry || "software"} according to AI`,
      `${company} AI search visibility`,
      `${company} generative engine optimization`,
      `${company} llms.txt`,
      `top ${industry || "tools"} 2025 reddit`,
      `${company} schema markup structured data`,
    ],
    scrapePaths: ["/llms.txt", "/robots.txt", "/sitemap.xml"],
    systemPrompt: `${identity}
Section 5 — AI Visibility Intelligence. Produce:
## LLM Discoverability (are they cited in AI answers?)
## Structured Data & Schema Coverage
## llms.txt / AI-Crawler Readiness
## Reddit / Forum Presence (LLMs weight this heavily)
## Third-Party Authority Signals
## GEO Vulnerabilities (3+ specific)
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 6,
    name: "Search Intelligence",
    shortName: "Search",
    focus: "Organic SEO footprint, ranking keywords, backlinks, technical SEO.",
    searchTemplates: ({ company, url }) => [
      host(url) ? `site:${host(url)}` : `${company}`,
      `${company} SEO`,
      `${company} backlinks`,
      `${company} organic keywords`,
      `${company} domain authority`,
      `${company} SERP ranking`,
      `${company} content strategy blog`,
    ],
    scrapePaths: ["/", "/blog", "/resources", "/sitemap.xml"],
    systemPrompt: `${identity}
Section 6 — Search Intelligence. Produce:
## Estimated Organic Footprint
## Top Ranking Themes / Keywords (evidenced)
## Content Depth (blog / resources)
## Technical SEO Signals
## Backlink Authority Signals
## Content Gaps vs Competitors
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 7,
    name: "Messaging Intelligence",
    shortName: "Messaging",
    focus: "Positioning language, tone of voice, category framing, differentiators claimed.",
    searchTemplates: ({ company }) => [
      `${company} tagline slogan`,
      `${company} value proposition`,
      `${company} positioning statement`,
      `${company} brand voice`,
      `${company} about us mission`,
      `${company} manifesto`,
    ],
    scrapePaths: ["/", "/about", "/manifesto", "/why", "/product"],
    systemPrompt: `${identity}
Section 7 — Messaging Intelligence. Produce:
## Core Positioning (as stated)
## Category They Claim
## Differentiators They Emphasize
## Tone of Voice
## Repeated Phrases / Word DNA
## Messaging Clarity Score (with reasoning)
## Weaknesses in Messaging
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 8,
    name: "Content Intelligence",
    shortName: "Content",
    focus: "Content strategy, cadence, formats, topical authority.",
    searchTemplates: ({ company }) => [
      `${company} blog posts`,
      `${company} youtube channel`,
      `${company} podcast`,
      `${company} whitepaper report`,
      `${company} case studies`,
      `${company} newsletter`,
    ],
    scrapePaths: ["/blog", "/resources", "/customers", "/case-studies"],
    systemPrompt: `${identity}
Section 8 — Content Intelligence. Produce:
## Content Formats in Use
## Publishing Cadence (estimated)
## Topical Authority Areas
## Top-Performing Themes
## Content Distribution Channels
## Content Gaps
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 9,
    name: "Funnel Intelligence",
    shortName: "Funnel",
    focus: "Acquisition-to-activation flow, CTAs, trial/demo/self-serve motions.",
    searchTemplates: ({ company }) => [
      `${company} free trial`,
      `${company} demo request`,
      `${company} onboarding`,
      `${company} pricing plans`,
      `${company} sign up flow`,
      `${company} product-led growth`,
    ],
    scrapePaths: ["/", "/pricing", "/demo", "/signup", "/get-started", "/contact"],
    systemPrompt: `${identity}
Section 9 — Funnel Intelligence. Produce:
## GTM Motion (PLG / Sales-led / Hybrid)
## Primary Conversion Paths
## CTA Inventory (with placement)
## Friction Points Detected
## Pricing Transparency
## Activation Signals
## Funnel Vulnerabilities (3+ specific)
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  {
    number: 10,
    name: "Product Intelligence",
    shortName: "Product",
    focus: "Feature set, roadmap signals, integrations, differentiation.",
    searchTemplates: ({ company }) => [
      `${company} features`,
      `${company} product roadmap`,
      `${company} integrations`,
      `${company} API documentation`,
      `${company} changelog release notes`,
      `${company} new feature launch 2025`,
    ],
    scrapePaths: ["/product", "/features", "/integrations", "/changelog", "/docs"],
    systemPrompt: `${identity}
Section 10 — Product Intelligence. Produce:
## Core Feature Set
## Notable Differentiators
## Integrations & Ecosystem
## Roadmap Signals (from changelog / launches)
## Perceived Product Strengths
## Perceived Product Weaknesses
## Key Findings (3–5 bullets)${confidenceTail}`,
  },
  // Phase 4+ (metadata only)
  { number: 11, name: "Trust Intelligence", shortName: "Trust", focus: "Reviews & social proof", searchTemplates: () => [], systemPrompt: "" },
  { number: 12, name: "Revenue Intelligence", shortName: "Revenue", focus: "ARR & unit economics", searchTemplates: () => [], systemPrompt: "" },
  { number: 13, name: "Opportunity Intelligence", shortName: "Opportunities", focus: "Strategic openings", searchTemplates: () => [], systemPrompt: "" },
  { number: 14, name: "Executive Recommendations", shortName: "Recommendations", focus: "CEO roadmap", searchTemplates: () => [], systemPrompt: "" },
];

// Sections that actually run (Phases 2 + 3).
export const ACTIVE_SECTION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function getSection(n: number): SectionMeta {
  const s = SECTIONS.find((s) => s.number === n);
  if (!s) throw new Error(`Unknown section number: ${n}`);
  return s;
}

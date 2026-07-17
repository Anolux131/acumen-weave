// Metadata for the 14 intelligence sections. Phases 2–4 activate sections 1–14.
export type SectionMeta = {
  number: number;
  name: string;
  shortName: string;
  focus: string;
  synthesis?: boolean; // true = reads other sections, no web research
  searchTemplates: (input: { company: string; url?: string; industry?: string }) => string[];
  scrapePaths?: string[]; // paths on the company site to always scrape
  systemPrompt: string;
};

const identity =
  "You are a senior competitive intelligence analyst. Cite specific evidence from the RAW RESEARCH. Never guess figures. Return well-structured markdown with clear headings and bullet points.";

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
    ],
    scrapePaths: ["/", "/about", "/company", "/team"],
    systemPrompt: `${identity}
Section 1 — Executive Intelligence.
## Company Overview
## Funding & Investors
## Leadership Team
## Revenue & Growth Signals
## Hiring & Team Size
## Strategic Direction
## Recent News (last 12 months)
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
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
      `${industry || company} industry report 2025`,
    ],
    systemPrompt: `${identity}
Section 2 — Market Position.
## Market Category
## Top 5 Competitors (table: name | positioning | strength)
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
      `${company} pros and cons`,
    ],
    systemPrompt: `${identity}
Section 3 — Customer Intelligence.
## Customer Sentiment Overview
## Positive Themes (with quotes)
## Negative Themes (with quotes)
## Primary Customer Segments
## Ideal Customer Profile
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
Section 4 — Website Intelligence.
## Homepage Message Clarity
## Value Proposition (as stated)
## Primary CTAs & Conversion Path
## Pricing Page Assessment
## UX / Navigation Observations
## Technical & SEO Signals
## Website Vulnerabilities (3+ specific issues)
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 5,
    name: "AI Visibility Intelligence",
    shortName: "AI Visibility",
    focus: "Presence and reputation in LLM answers (ChatGPT, Perplexity, Gemini).",
    searchTemplates: ({ company, industry }) => [
      `${company} mentioned ChatGPT`,
      `${company} Perplexity answer`,
      `best ${industry || "software"} tools 2025 recommendation`,
      `${company} vs alternatives LLM comparison`,
      `${company} llms.txt`,
      `${company} generative engine optimization`,
    ],
    scrapePaths: ["/llms.txt", "/robots.txt"],
    systemPrompt: `${identity}
Section 5 — AI Visibility (GEO).
## LLM Discoverability Score (0-100 with rationale)
## Where They Appear (which LLMs, for which prompts)
## Structured Data / llms.txt Assessment
## Citation Worthiness (are they quoted by LLMs?)
## GEO Gaps vs Competitors
## Recommended GEO Actions (5+ specific fixes)
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 6,
    name: "Search Intelligence",
    shortName: "Search",
    focus: "Organic SEO footprint, ranking keywords, content gaps.",
    searchTemplates: ({ company, industry }) => [
      `${company} SEO analysis`,
      `${company} ranking keywords`,
      `${company} backlink profile`,
      `${industry || company} keyword strategy`,
      `${company} domain authority`,
      `${company} content marketing`,
    ],
    systemPrompt: `${identity}
Section 6 — Search Intelligence.
## Organic Footprint Estimate
## Signature Ranking Keywords
## Content Gaps vs Competitors
## Technical SEO Observations
## Backlink & Authority Signals
## SEO Vulnerabilities
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 7,
    name: "Messaging Intelligence",
    shortName: "Messaging",
    focus: "Positioning, tone, tagline, category framing.",
    searchTemplates: ({ company }) => [
      `${company} tagline positioning`,
      `${company} brand voice`,
      `${company} press release messaging`,
      `${company} homepage headline`,
      `${company} category creation`,
      `${company} value proposition`,
    ],
    scrapePaths: ["/", "/about", "/manifesto"],
    systemPrompt: `${identity}
Section 7 — Messaging Intelligence.
## Core Positioning Statement
## Category Framing
## Tone & Voice
## Message Consistency Across Channels
## Messaging Weaknesses (vague, generic, jargon)
## Sharper Alternative Positioning (your recommendation)
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 8,
    name: "Content Intelligence",
    shortName: "Content",
    focus: "Blog cadence, formats, topical authority, thought leadership.",
    searchTemplates: ({ company }) => [
      `${company} blog posts`,
      `${company} whitepaper`,
      `${company} podcast interview founder`,
      `${company} case study`,
      `${company} webinar`,
      `${company} content marketing strategy`,
    ],
    scrapePaths: ["/blog", "/resources", "/case-studies"],
    systemPrompt: `${identity}
Section 8 — Content Intelligence.
## Content Cadence & Volume
## Dominant Content Formats
## Topical Authority Areas
## Thought Leadership Signals
## Content Distribution Channels
## Content Gaps & Opportunities
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 9,
    name: "Funnel Intelligence",
    shortName: "Funnel",
    focus: "Free trial, demo, pricing gates, self-serve vs sales-led.",
    searchTemplates: ({ company }) => [
      `${company} free trial`,
      `${company} demo request`,
      `${company} pricing plans`,
      `${company} sales process`,
      `${company} onboarding experience`,
      `${company} self serve product led growth`,
    ],
    scrapePaths: ["/pricing", "/demo", "/signup", "/get-started", "/contact-sales"],
    systemPrompt: `${identity}
Section 9 — Funnel Intelligence.
## Motion (PLG, sales-led, hybrid)
## Trial / Demo Structure
## Pricing Transparency
## Friction Points (specific)
## Time-to-Value Estimate
## Funnel Vulnerabilities
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 10,
    name: "Product Intelligence",
    shortName: "Product",
    focus: "Features, releases, roadmap signals, integrations.",
    searchTemplates: ({ company }) => [
      `${company} features list`,
      `${company} product update changelog`,
      `${company} integrations`,
      `${company} API documentation`,
      `${company} roadmap`,
      `${company} product launch 2025`,
    ],
    scrapePaths: ["/product", "/features", "/integrations", "/changelog", "/api"],
    systemPrompt: `${identity}
Section 10 — Product Intelligence.
## Core Product Capabilities
## Feature Depth vs Competitors
## Integration Ecosystem
## Release Velocity
## Roadmap Signals
## Product Gaps & Weaknesses
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 11,
    name: "Trust Intelligence",
    shortName: "Trust",
    focus: "Security posture, compliance, social proof, incidents.",
    searchTemplates: ({ company }) => [
      `${company} SOC 2 compliance`,
      `${company} GDPR HIPAA`,
      `${company} security incident breach`,
      `${company} trust center`,
      `${company} customer logos enterprise`,
      `${company} G2 badges awards`,
    ],
    scrapePaths: ["/security", "/trust", "/compliance", "/customers"],
    systemPrompt: `${identity}
Section 11 — Trust Intelligence.
## Compliance & Certifications (SOC 2, ISO, GDPR, HIPAA)
## Security Posture Signals
## Social Proof (customer logos, badges, awards)
## Historical Incidents / Outages
## Trust Center Assessment
## Trust Vulnerabilities
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 12,
    name: "Revenue Intelligence",
    shortName: "Revenue",
    focus: "ARR estimates, pricing, unit economics signals, monetization model.",
    searchTemplates: ({ company }) => [
      `${company} ARR revenue estimate`,
      `${company} pricing plans cost`,
      `${company} customer count`,
      `${company} valuation`,
      `${company} burn rate profitability`,
      `${company} pricing strategy analysis`,
    ],
    scrapePaths: ["/pricing", "/enterprise"],
    systemPrompt: `${identity}
Section 12 — Revenue Intelligence.
## Monetization Model
## Pricing Tiers (with specific numbers where cited)
## ARR Estimate & Rationale
## Unit Economics Signals
## Customer Concentration Risk
## Monetization Vulnerabilities
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 13,
    name: "Opportunity Intelligence",
    shortName: "Opportunities",
    focus: "Strategic wedges, adjacent markets, unmet demand.",
    searchTemplates: ({ company, industry }) => [
      `${company} unmet customer needs`,
      `${industry || company} market gap`,
      `${company} feature requests`,
      `${company} competitor weakness`,
      `${industry || company} emerging trends 2025`,
      `${company} adjacent market`,
    ],
    systemPrompt: `${identity}
Section 13 — Opportunity Intelligence.
## Whitespace Opportunities
## Adjacent Markets They Could Enter
## Underserved Customer Segments
## Competitor Weaknesses They Could Exploit
## Emerging Trends Aligned to Their Position
## Top 5 Strategic Wedges (ranked)
## Key Findings (3–5 bullets)
End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
  {
    number: 14,
    name: "Executive Recommendations",
    shortName: "Recommendations",
    focus: "CEO-grade synthesis and 90-day action plan across all prior sections.",
    synthesis: true,
    searchTemplates: () => [],
    systemPrompt: `You are the Chief Strategist writing a decisive brief for a founder/CEO. You will be given the analyzed markdown of Sections 1–13 for a target company. Do NOT restate them — synthesize.

Return this exact structure:

## 30-Second Verdict
One sharp paragraph: what this company is, why they win today, and the single biggest risk they face.

## The Strategic Picture
3–5 bullets connecting dots ACROSS sections (e.g. "hiring is up but funnel friction is high — implies a sales-led motion is straining").

## Top 5 Vulnerabilities (Ranked)
Each: headline, evidence (which section), why it matters, exploitability (HIGH/MEDIUM/LOW).

## Top 5 Opportunities (Ranked)
Each: headline, evidence, upside, effort (HIGH/MEDIUM/LOW).

## 90-Day Action Plan
Weeks 1–4 / 5–8 / 9–12 — concrete, dated moves. No fluff.

## Board-Level Summary (3 sentences)
Written as if for the next board meeting.

End with: **Confidence: HIGH|MEDIUM|LOW**`,
  },
];

// All 14 sections run in Phases 2–4.
export const ACTIVE_SECTION_NUMBERS = SECTIONS.map((s) => s.number);

export function getSection(n: number): SectionMeta {
  const s = SECTIONS.find((s) => s.number === n);
  if (!s) throw new Error(`Unknown section number: ${n}`);
  return s;
}

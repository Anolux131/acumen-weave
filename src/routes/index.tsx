import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Radar, Brain, FileText, Users, Sparkles, Terminal } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background bg-mesh text-foreground">
      <header className="border-b border-border/50 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-primary">
              <Radar className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">
              Anolux <span className="text-muted-foreground">Intelligence Engine</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Link to="/auth">
              <Button size="sm" className="bg-gradient-primary text-primary-foreground glow-primary">
                Start research <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6">
        <section className="pt-24 pb-20 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/50 px-3 py-1 text-xs font-mono text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-agent-pulse" />
            14 autonomous research agents online
          </div>
          <h1 className="mx-auto mt-6 max-w-4xl text-6xl font-bold leading-[1.05] tracking-tight text-gradient sm:text-7xl">
            Enterprise Intelligence.
            <br />
            In Minutes.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Enter any company. Get the research that normally takes a consulting team three days —
            delivered as a 14-section intelligence dossier, an executive brief, and a
            decision-maker contact list.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button
                size="lg"
                className="bg-gradient-primary text-primary-foreground glow-primary h-12 px-6"
              >
                Launch Intelligence Research
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a
              href="#how"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              See how it works →
            </a>
          </div>
        </section>

        <section id="how" className="grid gap-4 pb-20 md:grid-cols-3">
          {[
            {
              n: "01",
              icon: Terminal,
              title: "Enter a company",
              body: "Any name or URL. Optional context helps the agents focus.",
            },
            {
              n: "02",
              icon: Brain,
              title: "14 agents research it",
              body: "Autonomous multi-agent workflow analyzes market, product, customer, revenue, opportunity.",
            },
            {
              n: "03",
              icon: FileText,
              title: "Receive intelligence",
              body: "Full dossier, 5-page executive brief, and decision-maker contact list — all ready in minutes.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-border bg-panel/60 p-6 shadow-panel backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-primary">{s.n}</span>
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </section>

        <section className="pb-32">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: FileText,
                tag: "Deliverable 01",
                title: "Intelligence Dossier",
                body: "Fourteen structured sections — funding, market, customer, product, revenue, opportunity — every finding cited to evidence.",
              },
              {
                icon: Sparkles,
                tag: "Deliverable 02",
                title: "Executive Brief",
                body: "3–5 page CEO-ready summary. Threat level, top opportunities, 90-day roadmap.",
              },
              {
                icon: Users,
                tag: "Deliverable 03",
                title: "Decision-Maker Contacts",
                body: "Verified emails, buying roles, and personalized outreach hooks derived from the research.",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="group relative overflow-hidden rounded-xl border border-border bg-surface p-6 transition-colors hover:border-primary/60"
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100 bg-mesh" />
                <div className="relative">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    {c.tag}
                  </p>
                  <c.icon className="mt-3 h-5 w-5 text-primary" />
                  <h3 className="mt-3 text-xl font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <p>Anolux Intelligence Engine © 2026</p>
          <p className="font-mono">Autonomous research. Human-grade insight.</p>
        </div>
      </footer>
    </div>
  );
}

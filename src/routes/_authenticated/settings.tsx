import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();

  const services = [
    { name: "Lovable AI Gateway", status: "connected", detail: "google/gemini-2.5-flash • auto-provisioned" },
    { name: "Tavily Search", status: "connected", detail: "Web search + fresh index" },
    { name: "Firecrawl", status: "connected", detail: "Deep page scraping (markdown)" },
    { name: "Hunter.io", status: "configured", detail: "Reserved for Phase 4 contact intelligence" },
  ];

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Configuration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account and platform integrations.
        </p>

        <Card className="mt-6 border-border bg-panel/70 p-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Account
          </p>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-mono">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs text-muted-foreground">{user.id}</span>
            </div>
          </div>
        </Card>

        <Card className="mt-4 border-border bg-panel/70 p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Integrations
            </p>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="mt-4 space-y-2">
            {services.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
                </div>
                <Badge
                  variant="secondary"
                  className="border-success/40 bg-success/10 font-mono text-[10px] uppercase text-success"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {s.status}
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground/70">
            All API keys are stored server-side in Lovable Cloud secrets. Never exposed to the browser.
          </p>
        </Card>
      </div>
    </div>
  );
}

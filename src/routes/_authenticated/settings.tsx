import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Sparkles, Loader2, XCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getUserSettings, saveUserSettings, testAiConnection } from "@/lib/settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Provider = "lovable" | "groq" | "openrouter" | "gemini";

const PROVIDERS: {
  id: Provider;
  label: string;
  hint: string;
  keyField: "lovable" | "groq_api_key" | "openrouter_api_key" | "gemini_api_key";
  models: { id: string; label: string }[];
  keyUrl?: string;
}[] = [
  {
    id: "lovable",
    label: "Lovable AI (default)",
    hint: "Zero setup. Managed keys, billed via your workspace.",
    keyField: "lovable",
    models: [
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (fast, cheap)" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (deeper reasoning)" },
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (fastest)" },
      { id: "openai/gpt-5-mini", label: "GPT-5 Mini" },
      { id: "openai/gpt-5", label: "GPT-5" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    hint: "Ultra-low latency inference on open models.",
    keyField: "groq_api_key",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "Access hundreds of models with one key.",
    keyField: "openrouter_api_key",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
      { id: "openai/gpt-4o", label: "GPT-4o" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "Direct Gemini API via Google AI Studio.",
    keyField: "gemini_api_key",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
];

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const load = useServerFn(getUserSettings);
  const save = useServerFn(saveUserSettings);
  const test = useServerFn(testAiConnection);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const [provider, setProvider] = useState<Provider>("lovable");
  const [model, setModel] = useState("google/gemini-2.5-flash");
  const [customModel, setCustomModel] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");

  useEffect(() => {
    load()
      .then((s) => {
        setProvider((s.ai_provider as Provider) ?? "lovable");
        setModel(s.selected_model ?? "google/gemini-2.5-flash");
        setGroqKey(s.groq_api_key ?? "");
        setOpenrouterKey(s.openrouter_api_key ?? "");
        setGeminiKey(s.gemini_api_key ?? "");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const current = PROVIDERS.find((p) => p.id === provider)!;
  const modelInList = current.models.some((m) => m.id === model);
  const effectiveModel = customModel.trim() || model;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          ai_provider: provider,
          selected_model: effectiveModel,
          groq_api_key: groqKey || null,
          openrouter_api_key: openrouterKey || null,
          gemini_api_key: geminiKey || null,
        },
      });
      setCustomModel("");
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const r = await test();
      if (r.ok) {
        toast.success(`${r.provider} • ${r.model} → ${r.message}`);
      } else {
        toast.error(`${r.provider} → ${r.message}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const services = [
    { name: "Tavily Search", status: "connected", detail: "Web search + fresh index" },
    { name: "Firecrawl", status: "connected", detail: "Deep page scraping (markdown)" },
    { name: "Hunter.io", status: "connected", detail: "Contact discovery + role classification" },
  ];

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Configuration</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Account, AI provider, and platform integrations.
          </p>
        </div>

        {/* Account */}
        <Card className="border-border bg-panel/70 p-6">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Account</p>
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

        {/* AI Provider */}
        <Card className="border-border bg-panel/70 p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">AI Provider</p>
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>

          {loading ? (
            <div className="mt-6 flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {PROVIDERS.map((p) => {
                  const active = provider === p.id;
                  const hasKey =
                    p.id === "lovable" ||
                    (p.id === "groq" && !!groqKey) ||
                    (p.id === "openrouter" && !!openrouterKey) ||
                    (p.id === "gemini" && !!geminiKey);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProvider(p.id);
                        const first = p.models[0]?.id;
                        if (first && !p.models.some((m) => m.id === model)) setModel(first);
                      }}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        active
                          ? "border-primary/60 bg-surface"
                          : "border-border bg-panel/40 hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{p.label}</span>
                        {hasKey ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{p.hint}</p>
                    </button>
                  );
                })}
              </div>

              {/* Model select */}
              <div className="mt-4">
                <Label className="text-xs">Model</Label>
                <select
                  value={modelInList ? model : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setCustomModel(model);
                    } else {
                      setModel(e.target.value);
                      setCustomModel("");
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
                >
                  {current.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                  <option value="__custom__">Custom model ID…</option>
                </select>
                {(!modelInList || customModel) && (
                  <Input
                    className="mt-2 font-mono text-xs"
                    placeholder="e.g. google/gemini-2.5-pro"
                    value={customModel || model}
                    onChange={(e) => setCustomModel(e.target.value)}
                  />
                )}
              </div>

              {/* Keys */}
              {provider !== "lovable" && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      {current.label} API Key
                      {current.keyUrl && (
                        <a
                          href={current.keyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 text-[11px] text-primary hover:underline"
                        >
                          Get one →
                        </a>
                      )}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowKeys((s) => !s)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Input
                    type={showKeys ? "text" : "password"}
                    placeholder={provider === "groq" ? "gsk_…" : provider === "openrouter" ? "sk-or-…" : "AIza…"}
                    value={
                      provider === "groq" ? groqKey : provider === "openrouter" ? openrouterKey : geminiKey
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (provider === "groq") setGroqKey(v);
                      else if (provider === "openrouter") setOpenrouterKey(v);
                      else setGeminiKey(v);
                    }}
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground/70">
                    Stored encrypted at rest in your workspace database. Only your account and the research
                    agents can access it.
                  </p>
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
                <Button onClick={handleTest} disabled={testing} size="sm" variant="outline">
                  {testing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Test connection
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Integrations */}
        <Card className="border-border bg-panel/70 p-6">
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
            All third-party keys are stored server-side. Never exposed to the browser.
          </p>
        </Card>
      </div>
    </div>
  );
}

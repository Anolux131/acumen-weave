import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        toast.success("Account created — you're in.");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : String(result.error));
      setGoogleLoading(false);
      return;
    }
    if (result.redirected) return;
    // Tokens set; navigate.
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen bg-background bg-mesh md:grid-cols-2">
      <div className="hidden flex-col justify-between p-10 md:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-primary">
            <Radar className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">
            Anolux <span className="text-muted-foreground">Intelligence Engine</span>
          </span>
        </Link>
        <div className="space-y-6">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            Access the platform
          </p>
          <h2 className="text-4xl font-semibold leading-tight text-gradient">
            Autonomous research.
            <br />
            Human-grade insight.
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Sign in to launch multi-agent research on any company and receive intelligence
            dossiers, executive briefs, and decision-maker contact intelligence.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 Anolux Intelligence Engine</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border bg-panel/80 p-8 shadow-panel backdrop-blur">
          <div className="mb-6 flex gap-2 rounded-md bg-surface p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "signin" ? "bg-panel text-foreground" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-panel text-foreground" : "text-muted-foreground"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-primary text-primary-foreground glow-primary"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-border bg-surface"
            disabled={googleLoading}
            onClick={handleGoogle}
          >
            {googleLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue with Google
          </Button>
        </Card>
      </div>
    </div>
  );
}

import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Radar, LayoutDashboard, Plus, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string>(user.email ?? "");

  useEffect(() => {
    if (user.email) setEmail(user.email);
  }, [user.email]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  const nav = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/research/new", label: "New Research", icon: Plus },
    { to: "/settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-14 flex-col items-center border-r border-border/60 bg-[oklch(0.09_0.015_275)]/90 py-3 backdrop-blur md:flex">
        <Link
          to="/dashboard"
          className="mb-4 grid h-8 w-8 place-items-center rounded-md bg-gradient-primary shadow-[0_0_16px_-4px_oklch(0.62_0.19_275/0.7)]"
          title="Anolux"
        >
          <Radar className="h-4 w-4 text-primary-foreground" />
        </Link>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active =
              item.to === "/dashboard"
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                  active
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted-foreground/70 hover:bg-surface hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[10px] font-medium text-muted-foreground"
            title={email}
          >
            {(email || "?").slice(0, 2).toUpperCase()}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/70 hover:text-foreground"
            onClick={handleSignOut}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      <main className="md:pl-14">
        <Outlet />
      </main>
    </div>
  );
}

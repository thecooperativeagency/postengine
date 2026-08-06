import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LockKeyhole, Moon, Sun } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Posts from "@/pages/posts";
import PostForm from "@/pages/post-form";
import ReviewQueue from "@/pages/review-queue";
import CalendarPage from "@/pages/calendar-page";
import Settings from "@/pages/settings";
import {
  clearDashboardPassword,
  ENGINE_AUTH_REQUIRED_EVENT,
  setDashboardPassword,
} from "./lib/dashboard-auth";

type AccessState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "locked"; error?: string }
  | { status: "error"; message: string };

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="h-8 w-8 p-0"
      data-testid="button-theme-toggle"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function DashboardAccessGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<AccessState>({ status: "loading" });
  const hostLabel = "Protected";
  const gateTitle = "ENGINE";
  const gateDescription = "Enter the dashboard password to open Post Engine.";

  const verifyPassword = async (candidate: string) => {
    const trimmed = candidate.trim();
    const res = await fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: trimmed }),
    });

    if (!res.ok) {
      throw new Error(res.status === 401 ? "Invalid password" : `Access check failed (${res.status})`);
    }

    setDashboardPassword(trimmed);
    onAuthenticated();
    setState({ status: "ready" });
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const configRes = await fetch("/api/auth/config");
        if (!configRes.ok) {
          throw new Error(`Unable to load access config (${configRes.status})`);
        }

        const config = await configRes.json();
        if (cancelled) return;

        if (!config.enabled) {
          onAuthenticated();
          setState({ status: "ready" });
          return;
        }

        const saved = window.sessionStorage.getItem("engine-dashboard-password") || "";
        if (saved) {
          try {
            await verifyPassword(saved);
            return;
          } catch {
            clearDashboardPassword();
          }
        }

        setState({ status: "locked" });
      } catch (error) {
        if (cancelled) return;
        clearDashboardPassword();
        setState({
          status: "locked",
          error: error instanceof Error ? error.message : "Unable to load ENGINE access gate",
        });
      }
    };

    const handleAuthReset = () => {
      clearDashboardPassword();
      setPassword("");
      setState({ status: "locked", error: "Session expired. Enter the dashboard password again." });
    };

    boot();
    window.addEventListener(ENGINE_AUTH_REQUIRED_EVENT, handleAuthReset);
    return () => {
      cancelled = true;
      window.removeEventListener(ENGINE_AUTH_REQUIRED_EVENT, handleAuthReset);
    };
  }, [onAuthenticated]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ status: "loading" });
    try {
      await verifyPassword(password);
    } catch (error) {
      clearDashboardPassword();
      setState({
        status: "locked",
        error: error instanceof Error ? error.message : "Invalid password",
      });
    }
  };

  if (state.status === "ready") {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <Card className="w-full max-w-sm border-border/70 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{gateTitle}</CardTitle>
                <Badge variant="secondary">{hostLabel}</Badge>
              </div>
              <CardDescription>{gateDescription}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {state.status === "error" ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {state.message}
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="engine-dashboard-password">
                    Password
                  </label>
                  <Input
                    id="engine-dashboard-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    data-testid="input-dashboard-password"
                  />
                </div>
                {state.status === "locked" && state.error ? (
                  <p className="text-sm text-destructive">{state.error}</p>
                ) : null}
                <Button className="w-full" type="submit" disabled={state.status === "loading" || !password.trim()}>
                  {state.status === "loading" ? "Checking access…" : "Sign In"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AppContent() {
  const [dealershipFilter, setDealershipFilter] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const handleAuthReset = () => {
      clearDashboardPassword();
      setIsAuthenticated(false);
    };

    window.addEventListener(ENGINE_AUTH_REQUIRED_EVENT, handleAuthReset);
    return () => window.removeEventListener(ENGINE_AUTH_REQUIRED_EVENT, handleAuthReset);
  }, []);

  const sidebarStyle = useMemo(
    () => ({
      "--sidebar-width": "16rem",
      "--sidebar-width-icon": "3rem",
    }),
    [],
  );

  if (!isAuthenticated) {
    return <DashboardAccessGate onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <SidebarProvider style={sidebarStyle as CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          dealershipFilter={dealershipFilter}
          onDealershipFilterChange={setDealershipFilter}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border bg-background/80 px-4 py-2 backdrop-blur-sm">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <Router hook={useHashLocation}>
              <Switch>
                <Route path="/" component={() => <Dashboard dealershipFilter={dealershipFilter} />} />
                <Route path="/posts" component={() => <Posts dealershipFilter={dealershipFilter} />} />
                <Route path="/posts/new" component={PostForm} />
                <Route path="/posts/:id" component={PostForm} />
                <Route path="/queue" component={() => <ReviewQueue dealershipFilter={dealershipFilter} />} />
                <Route path="/calendar" component={() => <CalendarPage dealershipFilter={dealershipFilter} />} />
                <Route path="/settings" component={Settings} />
                <Route component={NotFound} />
              </Switch>
            </Router>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AppContent />
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

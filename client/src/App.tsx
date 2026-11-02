import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LockKeyhole } from "lucide-react";
import { MobileDock } from "@/components/mobile-dock";
import { DASHBOARD_USER_EVENT, DASHBOARD_USER_KEY } from "@/lib/section-memory";
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

function DashboardAccessGate({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<AccessState>({ status: "loading" });
  const hostLabel = "Protected";
    const gateTitle = "Post Engine";
    const gateDescription = "Five digits.";

  const verifyPin = async (candidate: string) => {
    const trimmed = candidate.trim();
    const res = await fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: trimmed, password: trimmed }),
    });

    if (!res.ok) {
      throw new Error(
        res.status === 401
          ? "Invalid PIN"
          : res.status === 429
            ? "Too many attempts. Try again in a few minutes."
            : `Access check failed (${res.status})`,
      );
    }

    const payload = await res.json().catch(() => ({}));
    const name = typeof payload?.name === "string" && payload.name.trim() ? payload.name.trim() : "owner";
    window.sessionStorage.setItem(DASHBOARD_USER_KEY, name);
    window.dispatchEvent(new Event(DASHBOARD_USER_EVENT));
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
            await verifyPin(saved);
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
      setPin("");
      setState({ status: "locked", error: "Session expired. Enter the PIN again." });
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
      await verifyPin(pin);
    } catch (error) {
      clearDashboardPassword();
      setState({
        status: "locked",
        error: error instanceof Error ? error.message : "Invalid PIN",
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
                  <label className="text-sm font-medium" htmlFor="engine-dashboard-pin">
                    PIN
                  </label>
                  <Input
                    id="engine-dashboard-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={12}
                    autoFocus
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                    autoComplete="one-time-code"
                    data-testid="input-dashboard-password"
                    className="text-center text-2xl tracking-[0.35em]"
                  />
                </div>
                {state.status === "locked" && state.error ? (
                  <p className="text-sm text-destructive">{state.error}</p>
                ) : null}
                <Button className="w-full" type="submit" disabled={state.status === "loading" || pin.trim().length < 4}>
                  {state.status === "loading" ? "Checking access…" : "Unlock"}
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
          <header className="flex items-center justify-between border-b border-border bg-background px-4 py-3 md:hidden">
            <a href="#/" className="font-display text-2xl leading-none">Post Engine</a>
          </header>
          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            <Router hook={useHashLocation}>
              <Switch>
                <Route path="/" component={() => <Dashboard dealershipFilter={dealershipFilter} onDealershipFilterChange={setDealershipFilter} />} />
                <Route path="/posts" component={() => <Posts dealershipFilter={dealershipFilter} />} />
                <Route path="/posts/new" component={PostForm} />
                <Route path="/posts/:id" component={PostForm} />
                <Route path="/queue" component={() => <ReviewQueue dealershipFilter={dealershipFilter} onDealershipFilterChange={setDealershipFilter} />} />
                <Route path="/calendar" component={() => <CalendarPage dealershipFilter={dealershipFilter} />} />
                <Route path="/settings" component={Settings} />
                <Route component={NotFound} />
              </Switch>
            </Router>
          </main>
        </div>
        <MobileDock
          dealershipFilter={dealershipFilter}
          onDealershipFilterChange={setDealershipFilter}
        />
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

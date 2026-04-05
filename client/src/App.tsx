import { useState } from "react";
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
import { Sun, Moon } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Posts from "@/pages/posts";
import PostForm from "@/pages/post-form";
import ReviewQueue from "@/pages/review-queue";
import CalendarPage from "@/pages/calendar-page";
import Settings from "@/pages/settings";

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
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

function AppContent() {
  const [dealershipFilter, setDealershipFilter] = useState<number | null>(null);

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          dealershipFilter={dealershipFilter}
          onDealershipFilterChange={setDealershipFilter}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm">
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

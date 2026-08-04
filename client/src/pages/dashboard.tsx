import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileText,
  Edit3,
  ClipboardCheck,
  CalendarDays,
  CheckCircle2,
  PlusCircle,
  Activity,
  Play,
  Pause,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dealership, ActivityLog } from "@shared/schema";

interface DashboardData {
  stats: {
    total: number;
    draft: number;
    queued: number;
    scheduled: number;
    published: number;
  };
  dealerships: (Dealership & {
    postCount: number;
    scheduledCount: number;
    draftCount: number;
  })[];
  recentActivity: ActivityLog[];
}

interface EngineStatus {
  paused: boolean;
  lastRunAt: string | null;
  lastRunCount: string | null;
  driveScan: {
    running: boolean;
    jobId: number | null;
    startedAt: string | null;
  };
}

const kpiItems = [
  { key: "total" as const, label: "Total Posts", icon: FileText, color: "text-foreground" },
  { key: "draft" as const, label: "Drafts", icon: Edit3, color: "text-muted-foreground" },
  { key: "queued" as const, label: "Queued", icon: ClipboardCheck, color: "text-amber-500" },
  { key: "scheduled" as const, label: "Scheduled", icon: CalendarDays, color: "text-primary" },
  { key: "published" as const, label: "Published", icon: CheckCircle2, color: "text-green-500" },
];

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getActionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  switch (action) {
    case "published": return "default";
    case "scheduled": return "default";
    case "created": return "secondary";
    case "rejected": return "destructive";
    default: return "outline";
  }
}

export default function Dashboard({ dealershipFilter }: { dealershipFilter: number | null }) {
  const { toast } = useToast();
  const MAX_GENERATE_WEEKS = 4;
  const [weeksToGenerate, setWeeksToGenerate] = useState("1");
  /** dealershipId -> talking points text */
  const [talkingByStore, setTalkingByStore] = useState<Record<number, string>>({});
  const dashboardTitle = "Dashboard";
  const dashboardEyebrow = "Post Engine";
  const dealerSectionTitle = "Dealerships";
  const dealerSectionDescription = "Stores currently managed in Post Engine.";
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const { data: engineStatus } = useQuery<EngineStatus>({
    queryKey: ["/api/engine/status"],
    refetchInterval: (query) => (query.state.data?.driveScan?.running ? 5000 : false),
  });

  interface CaptionBriefStore {
    dealershipId: number;
    name: string;
    brand: string;
    color: string;
    talkingPoints: string;
    updatedAt: string | null;
  }

  const { data: captionBrief } = useQuery<{ stores: CaptionBriefStore[]; legacyGlobal: string | null }>({
    queryKey: ["/api/caption-brief"],
  });

  useEffect(() => {
    if (!captionBrief?.stores) return;
    const next: Record<number, string> = {};
    for (const s of captionBrief.stores) {
      next[s.dealershipId] = s.talkingPoints || "";
    }
    setTalkingByStore(next);
  }, [captionBrief]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dealerships"] });
    queryClient.invalidateQueries({ queryKey: ["/api/caption-brief"] });
  };

  const saveBriefMutation = useMutation({
    mutationFn: async () => {
      const stores = Object.entries(talkingByStore).map(([id, talkingPoints]) => ({
        dealershipId: Number(id),
        talkingPoints,
      }));
      const res = await apiRequest("PUT", "/api/caption-brief", { stores });
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/caption-brief"] });
      toast({
        title: "Store talking points saved",
        description: result?.savedCount != null
          ? `Saved for ${result.savedCount} store${result.savedCount === 1 ? "" : "s"}. Applied on next Generate.`
          : "They’ll weave into captions for each store on Generate.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save talking points", description: err.message, variant: "destructive" });
    },
  });

  const runFreshMutation = useMutation({
    mutationFn: async (weeks: number) => {
      const talkingPointsByDealership: Record<string, string> = {};
      for (const [id, text] of Object.entries(talkingByStore)) {
        talkingPointsByDealership[id] = text;
      }
      const res = await apiRequest("POST", "/api/drive/scan", {
        weeks,
        talkingPointsByDealership,
      });
      return res.json();
    },
    onSuccess: (result: any) => {
      refreshAll();
      toast({ title: "Generate New Posts started", description: result?.message || "Scan started" });
    },
    onError: (err: Error) => {
      refreshAll();
      const alreadyRunning = err.message.includes("Drive scan already running");
      toast({
        title: alreadyRunning ? "Scan already running" : "Run failed",
        description: alreadyRunning ? "A fresh scan is already running in the background." : err.message,
        variant: alreadyRunning ? "default" : "destructive",
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine/pause");
      return res.json();
    },
    onSuccess: () => {
      refreshAll();
      toast({ title: "Imports paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine/resume");
      return res.json();
    },
    onSuccess: () => {
      refreshAll();
      toast({ title: "Imports resumed" });
    },
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </PageShell>
    );
  }

  if (!data) return null;

  // The dashboard is the operational overview and should always show the full dealership set.
  const filteredDealerships = data.dealerships;

  // Talking-point editors: main Drive social stores only (not agency/test accounts)
  const SOCIAL_BRANDS = new Set(["BMW", "Audi", "Porsche"]);
  const talkingStores = (captionBrief?.stores || filteredDealerships.map((d) => ({
    dealershipId: d.id,
    name: d.name,
    brand: d.brand,
    color: d.color,
    talkingPoints: talkingByStore[d.id] || "",
    updatedAt: null as string | null,
  }))).filter((s) => SOCIAL_BRANDS.has(s.brand));

  const storesWithPoints = talkingStores.filter((s) => (talkingByStore[s.dealershipId] || "").trim()).length;

  return (
    <PageShell className="space-y-5 sm:space-y-6">
      <PageHeader
        eyebrow={dashboardEyebrow}
        title={dashboardTitle}
        description="Quick read on the social pipeline inside ENGINE. Jump into intake, review, or new post creation without leaving the operating path."
        actions={
          <>
            <Link href="/posts/new">
              <Button data-testid="button-new-post">
                <PlusCircle className="mr-1.5 h-4 w-4" />
                New Post
              </Button>
            </Link>
            <Link href="/queue">
              <Button variant="outline" data-testid="button-review-queue">
                <ClipboardCheck className="mr-1.5 h-4 w-4" />
                Review Queue
              </Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Switchboard</CardTitle>
              <p className="text-xs text-muted-foreground">
                Intake controls for the live Post Engine path.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant={engineStatus?.paused ? "secondary" : engineStatus?.driveScan?.running ? "outline" : "default"}>
                {engineStatus?.paused ? "Paused" : engineStatus?.driveScan?.running ? "Scan running" : "Ready"}
              </Badge>
              <Badge variant="outline">
                {engineStatus?.lastRunAt ? `${formatTimeAgo(engineStatus.lastRunAt)} · ${engineStatus.lastRunCount ?? "0"} imported` : "No recent run"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <Label className="text-xs font-medium">
                  Weekly talking points / offers — by store
                </Label>
                <p className="text-xs text-muted-foreground">
                  Optional per dealership. Each store’s points only weave into that store’s captions on Generate (lease specials, events, inventory pushes). Leave a store blank for vehicle-only copy.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => saveBriefMutation.mutate()}
                disabled={saveBriefMutation.isPending}
                data-testid="button-save-talking-points"
              >
                {saveBriefMutation.isPending ? "Saving…" : "Save all"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {talkingStores.map((store) => {
                const value = talkingByStore[store.dealershipId] ?? store.talkingPoints ?? "";
                const briefMeta = captionBrief?.stores?.find((s) => s.dealershipId === store.dealershipId);
                return (
                  <div
                    key={store.dealershipId}
                    className="rounded-lg border border-border overflow-hidden bg-card"
                    data-testid={`talking-points-store-${store.dealershipId}`}
                  >
                    <div className="h-1" style={{ backgroundColor: store.color || "#888" }} />
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{store.name}</p>
                          <p className="text-[11px] text-muted-foreground">{store.brand}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {value.trim() ? "Set" : "Empty"}
                        </Badge>
                      </div>
                      <Textarea
                        id={`weekly-talking-points-${store.dealershipId}`}
                        value={value}
                        onChange={(e) =>
                          setTalkingByStore((prev) => ({
                            ...prev,
                            [store.dealershipId]: e.target.value,
                          }))
                        }
                        placeholder={`e.g.\n• ${store.brand} lease / finance this week\n• Event or lot push for ${store.name}\n• Service special if relevant`}
                        className="min-h-[96px] text-sm"
                        maxLength={4000}
                        data-testid={`textarea-weekly-talking-points-${store.dealershipId}`}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {value.trim()
                          ? `${value.trim().length}/4000 · applies to ${store.name} only`
                          : "No points — vehicle-only captions"}
                        {briefMeta?.updatedAt ? ` · saved ${formatTimeAgo(briefMeta.updatedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {storesWithPoints > 0
                ? `${storesWithPoints} store${storesWithPoints === 1 ? "" : "s"} with talking points · saved on Generate or Save all`
                : "No store talking points set yet"}
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Status: {engineStatus?.paused ? "Paused" : engineStatus?.driveScan?.running ? "Fresh scan running in background" : "Ready for scans and approvals"}</p>
            <p>
              Next stop: {data.stats.queued > 0 ? "review queued posts" : data.stats.draft > 0 ? "finish draft cleanup" : "run the next scan when new assets land"}
            </p>
            <p>Limit: up to {MAX_GENERATE_WEEKS} weeks at a time.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={weeksToGenerate} onValueChange={setWeeksToGenerate}>
              <SelectTrigger className="h-9 w-[160px]" data-testid="select-generate-weeks">
                <SelectValue placeholder="1 week" />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["1", "1 week"],
                  ["2", "2 weeks"],
                  ["3", "3 weeks"],
                  ["4", "4 weeks"],
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() => runFreshMutation.mutate(Math.min(MAX_GENERATE_WEEKS, Math.max(1, Number(weeksToGenerate))))}
              disabled={!!engineStatus?.paused || !!engineStatus?.driveScan?.running || runFreshMutation.isPending}
              data-testid="button-generate-new-posts"
            >
              <Play className="h-4 w-4 mr-1.5" />
              Generate New Posts
            </Button>
            {engineStatus?.paused ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                data-testid="button-resume-imports"
              >
                <Play className="h-4 w-4 mr-1.5" />
                Resume
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                data-testid="button-pause-imports"
              >
                <Pause className="h-4 w-4 mr-1.5" />
                Pause
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={refreshAll}
              data-testid="button-refresh-dashboard"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpiItems.map(({ key, label, icon: Icon, color }) => (
          <Card key={key} className="hover-elevate" data-testid={`card-kpi-${key}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-2xl font-semibold font-display">
                  {data.stats[key]}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account Cards + Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Account cards */}
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {dealerSectionTitle}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredDealerships.map((d) => (
              <Card key={d.id} className="hover-elevate overflow-hidden" data-testid={`card-dealership-${d.id}`}>
                <div className="h-1" style={{ backgroundColor: d.color }} />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-sm">{d.name}</h3>
                      <p className="text-xs text-muted-foreground">{d.location}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {d.brand}
                    </Badge>
                  </div>
                  <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{d.postCount}</span> posts
                    </span>
                    <span>
                      <span className="font-medium text-primary">{d.scheduledCount}</span> scheduled
                    </span>
                    <span>
                      <span className="font-medium text-foreground">{d.draftCount}</span> drafts
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Recent Activity
          </h2>
          <Card>
            <CardContent className="p-0">
              {data.recentActivity.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No recent activity
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.recentActivity.slice(0, 8).map((item) => (
                    <div key={item.id} className="px-4 py-3 text-sm" data-testid={`activity-item-${item.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={getActionBadgeVariant(item.action)} className="text-xs capitalize">
                          {item.action}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>
                      {item.details && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.details}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

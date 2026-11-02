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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader, PageShell } from "@/components/page-shell";
import { ShrinkSection } from "@/components/shrink-section";
import type { DriveArrival } from "@shared/store-health";
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
    queuedCount?: number;
    daysBehind?: number | null;
    driveInCount?: number;
  })[];
  recentActivity: ActivityLog[];
  driveArrivals?: DriveArrival[];
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

export default function Dashboard({
  dealershipFilter,
  onDealershipFilterChange,
}: {
  dealershipFilter: number | null;
  onDealershipFilterChange?: (id: number | null) => void;
}) {
  const { toast } = useToast();
  const MAX_GENERATE_WEEKS = 4;
  const [weeksToGenerate, setWeeksToGenerate] = useState("1");
  /** dealershipId -> talking points text */
  const [talkingByStore, setTalkingByStore] = useState<Record<number, string>>({});
  const dashboardTitle = "Stores";
  const dashboardEyebrow = "The Cooperative";
  const dealerSectionTitle = "Stores";
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

  const syncSpecialsMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await apiRequest("POST", "/api/caption-brief/sync", { force });
      return res.json();
    },
    onSuccess: (result: any, force: boolean) => {
      queryClient.invalidateQueries({ queryKey: ["/api/caption-brief"] });
      const stores = result?.stores as CaptionBriefStore[] | undefined;
      if (stores) {
        const next: Record<number, string> = {};
        for (const s of stores) next[s.dealershipId] = s.talkingPoints || "";
        setTalkingByStore(next);
      }
      const updated = (result?.results || []).filter((r: any) => r.status === "updated").length;
      if (!force && !updated) return;
      toast({
        title: updated ? "Talking points synced from specials" : "Specials already current",
        description: updated
          ? `Updated ${updated} store${updated === 1 ? "" : "s"} from live specials pages.`
          : "Current-month mix is already in the boxes.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not sync specials", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    syncSpecialsMutation.mutate(false);
    // Fill stale/empty boxes from live specials once per dashboard load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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


  const visibleStores = dealershipFilter
    ? filteredDealerships.filter((dealer) => dealer.id === dealershipFilter)
    : filteredDealerships;
  const arrivals = (data.driveArrivals || []).filter((item) =>
    !dealershipFilter || item.dealershipId === dealershipFilter,
  );
  const storeName = (id: number) => data.dealerships.find((dealer) => dealer.id === id)?.name ?? "Store";

  const behindLabel = (days: number | null | undefined) => {
    if (days == null) return "No schedule yet";
    if (days === 0) return "On schedule";
    return days === 1 ? "1 day behind" : `${days} days behind`;
  };

  return (
    <PageShell className="space-y-8">
      <PageHeader
        eyebrow={dashboardEyebrow}
        title={dashboardTitle}
        description="Queue, days behind, and what just came in."
        actions={
          <Link href="/queue">
            <Button data-testid="button-review-queue">
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              Review
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleStores.map((dealer) => {
          const queued = dealer.queuedCount ?? 0;
          const behind = behindLabel(dealer.daysBehind);
          return (
            <a
              key={dealer.id}
              href="#/queue"
              onClick={() => onDealershipFilterChange?.(dealer.id)}
              className="block border border-border bg-card"
              data-testid={`card-dealership-${dealer.id}`}
            >
              <div className="h-1" style={{ backgroundColor: dealer.color }} />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-3xl leading-none">{dealer.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{dealer.location}</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{dealer.brand}</span>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="font-display text-4xl leading-none">{queued}</div>
                    <div className="mt-1 text-xs text-muted-foreground">in review</div>
                  </div>
                  <div className={`text-sm ${dealer.daysBehind ? "text-destructive" : ""}`} data-testid={`days-behind-${dealer.id}`}>
                    {behind}
                  </div>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <section className="space-y-3" data-testid="drive-arrivals">
        <h2 className="font-display text-3xl">From Drive</h2>
        {arrivals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing new from the library.</p>
        ) : (
          <div className="border border-border bg-card">
            {arrivals.map((item) => (
              <a
                key={`${item.id}-${item.createdAt}`}
                href={item.id ? `#/posts/${item.id}` : "#/queue"}
                className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block text-sm">{item.vehicleInfo || item.postType || "Untitled"}</span>
                  <span className="text-xs text-muted-foreground">{storeName(item.dealershipId)}</span>
                </span>
                <span className="shrink-0 text-xs uppercase tracking-[0.12em] text-muted-foreground">{item.status}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <ShrinkSection id="scan-controls" label="Scan and talking points" hint="Generate, pause, offers">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant={engineStatus?.paused ? "secondary" : engineStatus?.driveScan?.running ? "outline" : "default"}>
              {engineStatus?.paused ? "Paused" : engineStatus?.driveScan?.running ? "Scan running" : "Ready"}
            </Badge>
            <Badge variant="outline">
              {engineStatus?.lastRunAt ? `${formatTimeAgo(engineStatus.lastRunAt)} · ${engineStatus.lastRunCount ?? "0"} imported` : "No recent run"}
            </Badge>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs font-medium">Weekly talking points, by store</Label>
              <p className="text-xs text-muted-foreground">Live offer pages fill these. What you type stays until you change it.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => syncSpecialsMutation.mutate(true)} disabled={syncSpecialsMutation.isPending} data-testid="button-sync-talking-points">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {syncSpecialsMutation.isPending ? "Syncing…" : "Sync from specials"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => saveBriefMutation.mutate()} disabled={saveBriefMutation.isPending} data-testid="button-save-talking-points">
                {saveBriefMutation.isPending ? "Saving…" : "Save all"}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {talkingStores.map((store) => {
              const value = talkingByStore[store.dealershipId] ?? store.talkingPoints ?? "";
              const briefMeta = captionBrief?.stores?.find((item) => item.dealershipId === store.dealershipId);
              return (
                <div key={store.dealershipId} className="border border-border bg-background" data-testid={`talking-points-store-${store.dealershipId}`}>
                  <div className="h-1" style={{ backgroundColor: store.color || "#111" }} />
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm">{store.name}</p>
                      <Badge variant="outline" className="text-[10px]">{value.trim() ? "Set" : "Empty"}</Badge>
                    </div>
                    <Textarea
                      id={`weekly-talking-points-${store.dealershipId}`}
                      value={value}
                      onChange={(event) => setTalkingByStore((prev) => ({ ...prev, [store.dealershipId]: event.target.value }))}
                      placeholder="This week's offer, event, or thing to leave out."
                      className="min-h-[96px] text-sm"
                      maxLength={4000}
                      data-testid={`textarea-weekly-talking-points-${store.dealershipId}`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {value.trim() ? `${value.trim().length}/4000` : "Empty. Captions stay on the vehicle."}
                      {briefMeta?.updatedAt ? ` · saved ${formatTimeAgo(briefMeta.updatedAt)}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {storesWithPoints > 0 ? `${storesWithPoints} store${storesWithPoints === 1 ? "" : "s"} with talking points` : "No talking points yet"}
          </p>
          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {engineStatus?.paused ? "Imports are paused." : engineStatus?.driveScan?.running ? "A scan is running." : "Ready when new files land."} Up to {MAX_GENERATE_WEEKS} weeks.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={weeksToGenerate} onValueChange={setWeeksToGenerate}>
                <SelectTrigger className="h-9 w-[140px]" data-testid="select-generate-weeks">
                  <SelectValue placeholder="1 week" />
                </SelectTrigger>
                <SelectContent>
                  {[["1", "1 week"], ["2", "2 weeks"], ["3", "3 weeks"], ["4", "4 weeks"]].map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => runFreshMutation.mutate(Math.min(MAX_GENERATE_WEEKS, Math.max(1, Number(weeksToGenerate))))} disabled={!!engineStatus?.paused || !!engineStatus?.driveScan?.running || runFreshMutation.isPending} data-testid="button-generate-new-posts">
                <Play className="mr-1.5 h-4 w-4" />
                Generate
              </Button>
              {engineStatus?.paused ? (
                <Button size="sm" variant="outline" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} data-testid="button-resume-imports">
                  <Play className="mr-1.5 h-4 w-4" />
                  Resume
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending} data-testid="button-pause-imports">
                  <Pause className="mr-1.5 h-4 w-4" />
                  Pause
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={refreshAll} data-testid="button-refresh-dashboard">
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Refresh
              </Button>
              <Link href="/posts/new">
                <Button size="sm" variant="outline" data-testid="button-new-post">
                  <PlusCircle className="mr-1.5 h-4 w-4" />
                  New post
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </ShrinkSection>

      <ShrinkSection id="totals" label="All counts" hint={dealerSectionTitle}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {kpiItems.map(({ key, label, icon: Icon }) => (
            <div key={key} className="border border-border p-3" data-testid={`card-kpi-${key}`}>
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4" />
                <span className="font-display text-3xl">{data.stats[key]}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </ShrinkSection>

      <ShrinkSection id="activity" label="Activity" hint="What the log recorded">
        {data.recentActivity.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <Activity className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No recent activity
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.recentActivity.slice(0, 8).map((item) => (
              <div key={item.id} className="py-3 text-sm" data-testid={`activity-item-${item.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={getActionBadgeVariant(item.action)} className="text-xs capitalize">{item.action}</Badge>
                  <span className="text-xs text-muted-foreground">{formatTimeAgo(item.createdAt)}</span>
                </div>
                {item.details ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.details}</p> : null}
              </div>
            ))}
          </div>
        )}
      </ShrinkSection>
    </PageShell>
  );
}

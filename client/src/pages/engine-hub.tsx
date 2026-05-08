import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Activity, BookOpen, Boxes, PauseCircle, PlayCircle, ScanSearch } from "lucide-react";

interface EngineHubData {
  status: {
    paused: boolean;
    lastRunAt: string | null;
    lastRunCount: string | null;
  };
  modules: Array<{
    id: number;
    key: string;
    name: string;
    route: string | null;
    description: string | null;
    status: string;
  }>;
  accounts: Array<{
    id: number;
    name: string;
    brand: string;
    modules: Array<{
      moduleKey: string;
      isEnabled: boolean;
      settings: string;
    }>;
  }>;
  jobs: Array<{
    id: number;
    moduleKey: string;
    jobType: string;
    status: string;
    summary: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  sources: Array<{
    id: number;
    key: string;
    moduleKey: string;
    name: string;
    watcherType: string;
    sourceType: string;
    status: string;
    target: string;
    cadenceMinutes: number | null;
    lastCheckedAt: string | null;
    lastResultSummary: string | null;
  }>;
}

function formatDateTime(value: string | null) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["failed", "blocked"].includes(status)) return "destructive";
  if (["running", "active", "completed"].includes(status)) return "default";
  if (["paused", "inactive"].includes(status)) return "secondary";
  return "outline";
}

export default function EngineHub() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<EngineHubData>({
    queryKey: ["/api/engine/hub"],
  });

  const refreshEngineData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/engine/hub"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/engine/status"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/engine/jobs"] }),
    ]);
  };

  const pauseMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/engine/pause");
    },
    onSuccess: async () => {
      await refreshEngineData();
      toast({ title: "Imports paused" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to pause imports", description: error.message, variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/engine/resume");
    },
    onSuccess: async () => {
      await refreshEngineData();
      toast({ title: "Imports resumed" });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to resume imports", description: error.message, variant: "destructive" });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/drive/scan");
      return res.json();
    },
    onSuccess: async (result: { newPosts: number; message: string }) => {
      await refreshEngineData();
      toast({ title: "Drive scan complete", description: result.message || `Created ${result.newPosts} queued posts.` });
    },
    onError: (error: Error) => {
      toast({ title: "Drive scan failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4 max-w-[1200px]">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-xl font-display font-semibold flex items-center gap-2" data-testid="text-engine-hub-title">
            <Boxes className="h-5 w-5" />
            Engine Hub
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Shared-core view for engine modules, account coverage, and import activity while PostEngine and Content Engine stay live.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {data.status.paused ? (
            <Button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} data-testid="button-engine-resume">
              <PlayCircle className="h-4 w-4 mr-2" /> Resume Imports
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending} data-testid="button-engine-pause">
              <PauseCircle className="h-4 w-4 mr-2" /> Pause Imports
            </Button>
          )}
          <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending || data.status.paused} data-testid="button-engine-scan">
            <ScanSearch className="h-4 w-4 mr-2" /> Run Drive Scan
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Import Status</CardTitle>
            <CardDescription>Preserves current pause/resume controls.</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={data.status.paused ? "secondary" : "default"}>
              {data.status.paused ? "Paused" : "Running"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Scan</CardTitle>
            <CardDescription>{formatDateTime(data.status.lastRunAt)}</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {data.status.lastRunCount ?? "0"}
            <span className="text-sm font-normal text-muted-foreground ml-2">queued posts created</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Shared Modules</CardTitle>
            <CardDescription>Seeded safely if empty.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.modules.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScanSearch className="h-4 w-4" /> Source Watchers
          </CardTitle>
          <CardDescription>Lightweight shared scaffolding only — current Post Engine Drive ingestion stays intact.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.sources.map((source) => (
            <div key={source.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{source.name}</div>
                  <div className="text-xs text-muted-foreground">{source.moduleKey} • {source.sourceType} • {source.watcherType}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(source.status)}>{source.status}</Badge>
                  <Badge variant="outline">{source.cadenceMinutes ? `Every ${source.cadenceMinutes} min` : "On demand"}</Badge>
                </div>
              </div>
              <div className="text-sm">{source.target}</div>
              <div className="text-xs text-muted-foreground">
                Last checked: {formatDateTime(source.lastCheckedAt)}
                {source.lastResultSummary ? ` • ${source.lastResultSummary}` : ""}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Modules + Accounts
            </CardTitle>
            <CardDescription>Current dealership coverage for seeded engine modules.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {data.modules.map((module) => (
                <Badge key={module.key} variant={statusVariant(module.status)}>
                  {module.name}
                </Badge>
              ))}
            </div>

            <div className="space-y-3">
              {data.accounts.map((account) => (
                <div key={account.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="font-medium">{account.name}</div>
                      <div className="text-xs text-muted-foreground">{account.brand}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {account.modules.filter((module) => module.isEnabled).length}/{account.modules.length} enabled
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {account.modules.map((module) => (
                      <Badge key={`${account.id}-${module.moduleKey}`} variant={module.isEnabled ? "default" : "outline"}>
                        {module.moduleKey}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Recent Engine Jobs
            </CardTitle>
            <CardDescription>Drive scan activity now records into shared engine_jobs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.jobs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No engine activity recorded yet.</div>
            ) : (
              data.jobs.map((job) => (
                <div key={job.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{job.jobType}</div>
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{job.summary || job.moduleKey}</div>
                  <div className="text-xs text-muted-foreground">Started {formatDateTime(job.createdAt)}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

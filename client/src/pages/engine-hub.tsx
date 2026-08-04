import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useToast } from "@/hooks/use-toast";
import { buildOfferFamilyGroups } from "@/lib/offer-grouping";
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
    startedAt: string | null;
    createdAt: string;
    completedAt: string | null;
    errorMessage: string | null;
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
    sourceUrl: string | null;
    accessStatus: string;
    preferredRank: number | null;
    updateWindowDays: string;
    evidenceNotes: string | null;
    cadenceMinutes: number | null;
    lastCheckedAt: string | null;
    lastResultSummary: string | null;
  }>;
  offerReviewStats: {
    total: number;
    detected: number;
    reviewing: number;
    approved: number;
    rejected: number;
    published: number;
  };
  offerReviews: Array<{
    id: number;
    sourceKey: string;
    moduleKey: string;
    brand: string | null;
    accountName: string | null;
    offerTitle: string;
    offerModel: string | null;
    offerType: string | null;
    status: string;
    sourceUrl: string | null;
    effectiveDate: string | null;
    expirationDate: string | null;
    updatedAt: string;
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

function formatUpdateWindowDays(value: string) {
  try {
    const days = JSON.parse(value) as number[];
    if (!Array.isArray(days) || days.length === 0) return "No observed window yet";
    return `Observed refresh window: days ${days.join(", ")}`;
  } catch {
    return value;
  }
}

function getBrandSectionClasses(brand: string) {
  const normalized = brand.trim().toLowerCase();
  if (normalized === "audi") {
    return {
      wrap: "border-l-4 border-l-rose-500/80 bg-rose-500/[0.06]",
      heading: "text-rose-200",
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-100",
      offerTypeWrap: "border-l-2 border-l-rose-500/40",
    };
  }
  if (normalized === "bmw") {
    return {
      wrap: "border-l-4 border-l-sky-500/80 bg-sky-500/[0.06]",
      heading: "text-sky-200",
      badge: "border-sky-500/30 bg-sky-500/10 text-sky-100",
      offerTypeWrap: "border-l-2 border-l-sky-500/40",
    };
  }
  return {
    wrap: "border-l-4 border-l-slate-500/70 bg-muted/20",
    heading: "text-foreground",
    badge: "border-border bg-background text-foreground",
    offerTypeWrap: "border-l-2 border-l-border",
  };
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
      queryClient.invalidateQueries({ queryKey: ["/api/engine/offer-reviews"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/content-engine/offers"] }),
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
      toast({ title: "Drive scan started", description: result.message || "Drive scan started in background." });
    },
    onError: (error: Error) => {
      toast({ title: "Drive scan failed", description: error.message, variant: "destructive" });
    },
  });

  const offerReviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/engine/offer-reviews/${id}`, { status });
      return res.json();
    },
    onSuccess: async (_result, variables) => {
      await refreshEngineData();
      toast({ title: `Offer marked ${variables.status}` });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to update offer review", description: error.message, variant: "destructive" });
    },
  });

  const bmwDetectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine/detect/bmw-offers");
      return res.json();
    },
    onSuccess: async (result: { summary?: string }) => {
      await refreshEngineData();
      toast({ title: "BMW detection complete", description: result.summary || "BMW offers imported into review queue." });
    },
    onError: (error: Error) => {
      toast({ title: "BMW detection failed", description: error.message, variant: "destructive" });
    },
  });

  const audiDetectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/engine/detect/audi-offers");
      return res.json();
    },
    onSuccess: async (result: { summary?: string }) => {
      await refreshEngineData();
      toast({ title: "Audi detection complete", description: result.summary || "Audi offers imported into review queue." });
    },
    onError: (error: Error) => {
      toast({ title: "Audi detection failed", description: error.message, variant: "destructive" });
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

  const groupedOfferReviews = buildOfferFamilyGroups(data.offerReviews);
  const nextStep = data.offerReviewStats.detected > 0
    ? {
        label: `Review ${data.offerReviewStats.detected} detected offer${data.offerReviewStats.detected === 1 ? "" : "s"}`,
        detail: "Approve or reject the live intake before routing anything downstream.",
        href: "/content-engine",
        cta: "Open Content Engine",
      }
    : data.offerReviewStats.approved > 0
      ? {
          label: `Route ${data.offerReviewStats.approved} approved offer${data.offerReviewStats.approved === 1 ? "" : "s"}`,
          detail: "Finish dealership targeting and downstream handoff for anything already approved.",
          href: "/content-engine",
          cta: "Route approved offers",
        }
      : {
          label: data.status.paused ? "Resume imports when you are ready" : "Run the next scan when fresh assets or offers land",
          detail: "The shared intake is clear right now, so the next operator move is new detection or a Drive scan.",
          href: "/posts",
          cta: "Open Posts",
        };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Engine / Shared intake"
        title="Engine Hub"
        description="Shared intake and source health for ENGINE. This is where you check imports, run detection, and decide what needs attention before Content Engine routing begins."
        actions={
          <>
            <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending || data.status.paused} data-testid="button-engine-scan">
              <ScanSearch className="mr-2 h-4 w-4" /> Run Drive Scan
            </Button>
            {data.status.paused ? (
              <Button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending} data-testid="button-engine-resume" variant="outline">
                <PlayCircle className="mr-2 h-4 w-4" /> Resume Imports
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending} data-testid="button-engine-pause">
                <PauseCircle className="mr-2 h-4 w-4" /> Pause Imports
              </Button>
            )}
            <Button variant="outline" onClick={() => bmwDetectionMutation.mutate()} disabled={bmwDetectionMutation.isPending || data.status.paused} data-testid="button-engine-detect-bmw-offers">
              <BookOpen className="mr-2 h-4 w-4" /> Detect BMW Offers
            </Button>
            <Button variant="outline" onClick={() => audiDetectionMutation.mutate()} disabled={audiDetectionMutation.isPending || data.status.paused} data-testid="button-engine-detect-audi-offers">
              <BookOpen className="mr-2 h-4 w-4" /> Detect Audi Offers
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recommended next step</div>
            <div className="text-base font-medium text-foreground">{nextStep.label}</div>
            <p className="max-w-2xl text-sm text-muted-foreground">{nextStep.detail}</p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant={data.status.paused ? "secondary" : "default"}>{data.status.paused ? "Paused" : "Imports live"}</Badge>
              <Badge variant="outline">Last scan {formatDateTime(data.status.lastRunAt)}</Badge>
              <Badge variant="outline">Queue {data.offerReviewStats.total}</Badge>
            </div>
          </div>
          <Link href={nextStep.href}>
            <Button variant="outline" className="w-full sm:w-auto">{nextStep.cta}</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Offer Review Queue</CardTitle>
            <CardDescription>Additive scaffolding on top of engine_sources + engine_jobs.</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{data.offerReviewStats.total}</CardContent>
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
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Access: {source.accessStatus}</Badge>
                <Badge variant="outline">{source.preferredRank ? `Priority ${source.preferredRank}` : "Unranked"}</Badge>
              </div>
              {source.sourceUrl ? (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-block break-all">
                  {source.sourceUrl}
                </a>
              ) : null}
              <div className="text-xs text-muted-foreground">{formatUpdateWindowDays(source.updateWindowDays)}</div>
              {source.evidenceNotes ? <div className="text-xs text-muted-foreground">{source.evidenceNotes}</div> : null}
              <div className="text-xs text-muted-foreground">
                Last checked: {formatDateTime(source.lastCheckedAt)}
                {source.lastResultSummary ? ` • ${source.lastResultSummary}` : ""}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Offer Intake Queue
          </CardTitle>
          <CardDescription>Review incoming detected offers by brand, offer type, and model before routing them downstream.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Detected {data.offerReviewStats.detected}</Badge>
            <Badge variant="outline">Reviewing {data.offerReviewStats.reviewing}</Badge>
            <Badge variant="outline">Approved {data.offerReviewStats.approved}</Badge>
            <Badge variant="outline">Rejected {data.offerReviewStats.rejected}</Badge>
            <Badge variant="outline">Published {data.offerReviewStats.published}</Badge>
          </div>

          {data.offerReviews.length === 0 ? (
            <div className="text-sm text-muted-foreground">No offer review records yet. Sources and routes are ready when watchers start writing rows.</div>
          ) : (
              <Accordion type="multiple" defaultValue={groupedOfferReviews.map((brandGroup) => `intake-${brandGroup.brandLabel}`)} className="space-y-4">
              {groupedOfferReviews.map((brandGroup) => {
                const tone = getBrandSectionClasses(brandGroup.brandLabel);
                return (
                  <AccordionItem value={`intake-${brandGroup.brandLabel}`} key={brandGroup.brandLabel} className={`rounded-xl border p-4 shadow-sm ${tone.wrap}`}>
                    <AccordionTrigger className="py-0 hover:no-underline">
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 pr-3">
                        <div className="text-left">
                          <div className={`font-semibold text-base ${tone.heading}`}>{brandGroup.brandLabel}</div>
                          <div className="text-xs text-muted-foreground">
                            {brandGroup.totalCount} offer{brandGroup.totalCount === 1 ? "" : "s"} in this intake queue.
                          </div>
                        </div>
                        <Badge variant="outline" className={tone.badge}>{brandGroup.totalCount}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-3">
                    <div className="space-y-3 border-t border-border/60 pt-3">
                      {brandGroup.offerTypes.map((offerTypeGroup) => (
                        <div key={`${brandGroup.brandLabel}-${offerTypeGroup.offerTypeLabel}`} className={`space-y-3 rounded-lg bg-background/60 p-3 ${tone.offerTypeWrap}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{offerTypeGroup.offerTypeLabel}</Badge>
                            <span className="text-xs text-muted-foreground">{offerTypeGroup.totalCount} offer{offerTypeGroup.totalCount === 1 ? "" : "s"}</span>
                          </div>

                          <div className="space-y-3 pl-0 md:pl-3">
                            <Accordion type="multiple" className="space-y-3">
                              {offerTypeGroup.families.map((familyGroup) => (
                                <AccordionItem
                                  key={`${brandGroup.brandLabel}-${offerTypeGroup.offerTypeLabel}-${familyGroup.familyLabel}`}
                                  value={`${brandGroup.brandLabel}-${offerTypeGroup.offerTypeLabel}-${familyGroup.familyLabel}`}
                                  className="rounded-lg border bg-background/80 px-3"
                                >
                                  <AccordionTrigger className="py-2.5 hover:no-underline">
                                    <div className="flex w-full flex-wrap items-center justify-between gap-3 pr-3 text-left">
                                      <div className="min-w-0 flex-1">
                                        <div className="text-base font-semibold text-foreground">
                                          {familyGroup.familyLabel}
                                        </div>
                                        <div className="text-sm font-medium text-foreground/80">
                                          {familyGroup.summary}
                                        </div>
                                        {familyGroup.representativeVariantPreview && !familyGroup.summary.includes(familyGroup.representativeVariantPreview) ? (
                                          <div className="text-[11px] text-muted-foreground line-clamp-1">
                                            {familyGroup.representativeVariantPreview}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="hidden sm:inline-flex">{familyGroup.variantCount} variants</Badge>
                                        <Badge variant="outline">{familyGroup.totalCount}</Badge>
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="space-y-2.5 pb-2.5">
                                    {familyGroup.offers.map((review) => (
                                      <div key={review.id} className="rounded-lg border bg-background px-3 py-2.5 space-y-1.5">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                          <div>
                                            <div className="text-sm font-medium leading-snug">{review.offerTitle}</div>
                                            <div className="text-[11px] text-muted-foreground line-clamp-1">
                                              {[review.accountName, review.offerModel].filter(Boolean).join(" • ") || review.sourceKey}
                                            </div>
                                          </div>
                                          <Badge variant={statusVariant(review.status)}>{review.status}</Badge>
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                          {review.moduleKey} • Updated {formatDateTime(review.updatedAt)}
                                          {review.effectiveDate ? ` • Starts ${formatDateTime(review.effectiveDate)}` : ""}
                                          {review.expirationDate ? ` • Ends ${formatDateTime(review.expirationDate)}` : ""}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          <Button size="sm" variant="outline" onClick={() => offerReviewMutation.mutate({ id: review.id, status: "reviewing" })} disabled={offerReviewMutation.isPending || review.status === "reviewing"}>Mark Reviewing</Button>
                                          <Button size="sm" onClick={() => offerReviewMutation.mutate({ id: review.id, status: "approved" })} disabled={offerReviewMutation.isPending || review.status === "approved"}>Approve</Button>
                                          <Button size="sm" variant="destructive" onClick={() => offerReviewMutation.mutate({ id: review.id, status: "rejected" })} disabled={offerReviewMutation.isPending || review.status === "rejected"}>Reject</Button>
                                          {review.sourceUrl ? (
                                            <Button size="sm" variant="ghost" asChild>
                                              <a href={review.sourceUrl} target="_blank" rel="noreferrer">Open Source</a>
                                            </Button>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          </div>
                        </div>
                      ))}
                    </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
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
                  <div className="text-xs text-muted-foreground">
                    Started {formatDateTime(job.startedAt || job.createdAt)}
                    {job.completedAt ? ` • Finished ${formatDateTime(job.completedAt)}` : ""}
                  </div>
                  {job.errorMessage ? <div className="text-xs text-destructive">{job.errorMessage}</div> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

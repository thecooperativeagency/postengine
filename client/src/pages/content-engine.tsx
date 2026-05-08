import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookOpen, Clock, Camera, Users, Palette, Type, Download, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CadenceRow {
  dealershipName: string;
  postType: string;
  postsPerDay: number;
  daysOfWeek: string;
  platforms: string;
  isActive: boolean;
}

interface OfferQueueData {
  stats: {
    total: number;
    detected: number;
    reviewing: number;
    approved: number;
    rejected: number;
    published: number;
  };
  selectionDealerships: Array<{
    id: number;
    name: string;
    brand: string;
    location: string;
  }>;
  candidates: Array<{
    id: number;
    sourceKey: string;
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
    targets: Array<{
      id: number;
      offerReviewId: number;
      dealershipId: number;
      selectionStatus: string;
      notes: string | null;
      dealershipName: string;
      downstreamUses: Array<{
        id: number;
        channel: string;
        placement: string;
        isActive: boolean;
      }>;
    }>;
  }>;
  approved: Array<{
    id: number;
    sourceKey: string;
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
    targets: Array<{
      id: number;
      offerReviewId: number;
      dealershipId: number;
      selectionStatus: string;
      notes: string | null;
      dealershipName: string;
      downstreamUses: Array<{
        id: number;
        channel: string;
        placement: string;
        isActive: boolean;
      }>;
    }>;
  }>;
}

interface BuildPlanData {
  generatedAt: string;
  dealerships: Array<{
    dealershipId: number;
    dealershipName: string;
    readyOfferCount: number;
    channels: Array<{
      channel: string;
      channelLabel: string;
      offerCount: number;
      offers: Array<{
        offerReviewId: number;
        offerTitle: string;
        offerModel: string | null;
        offerType: string | null;
        placement: string;
        sourceUrl: string | null;
        expirationDate: string | null;
        notes: string | null;
      }>;
    }>;
  }>;
}

interface EngineSourceRow {
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
}

function formatUpdateWindowDays(value: string) {
  try {
    const days = JSON.parse(value) as number[];
    if (!Array.isArray(days) || days.length === 0) return "No observed monthly update window yet";
    return `Observed monthly refresh window: days ${days.join(", ")}`;
  } catch {
    return value;
  }
}

// ── A. Content Cadence ──────────────────────────────────
function ContentCadence() {
  const { data: cadence, isLoading } = useQuery<CadenceRow[]>({
    queryKey: ["/api/content-engine/cadence"],
  });

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Clock className="h-4 w-4" /> Content Cadence
      </h2>
      {!cadence || cadence.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No cadence configured yet — set up in PostEngine Settings.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-4 py-2 font-medium">Dealership</th>
                    <th className="text-left px-4 py-2 font-medium">Post Type</th>
                    <th className="text-center px-4 py-2 font-medium">Posts/Day</th>
                    <th className="text-left px-4 py-2 font-medium">Platforms</th>
                  </tr>
                </thead>
                <tbody>
                  {cadence.map((row, i) => {
                    const platforms = JSON.parse(row.platforms) as string[];
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2 font-medium">{row.dealershipName}</td>
                        <td className="px-4 py-2 text-muted-foreground">{row.postType}</td>
                        <td className="px-4 py-2 text-center">{row.postsPerDay}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1.5">
                            {platforms.map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {p === "googlebusiness" ? "GMB" : p.charAt(0).toUpperCase() + p.slice(1)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OfferQueue() {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { data, isLoading } = useQuery<OfferQueueData>({
    queryKey: ["/api/content-engine/offers"],
  });
  const { data: buildPlan } = useQuery<BuildPlanData>({
    queryKey: ["/api/content-engine/build-plan"],
  });

  const candidates = data?.candidates ?? [];
  const approved = data?.approved ?? [];
  const selectionDealerships = data?.selectionDealerships ?? [];

  const candidateIds = useMemo(() => candidates.map((offer) => offer.id), [candidates]);
  const downstreamReadyByDealership = useMemo(() => selectionDealerships.map((dealership) => ({
    ...dealership,
    offers: approved.flatMap((offer) => offer.targets
      .filter((target) => target.dealershipId === dealership.id && target.downstreamUses.length > 0)
      .map((target) => ({
        offerId: offer.id,
        offerTitle: offer.offerTitle,
        offerModel: offer.offerModel,
        uses: target.downstreamUses,
      }))),
  })), [approved, selectionDealerships]);
  const selectedCandidateCount = useMemo(
    () => selectedIds.filter((id) => candidateIds.includes(id)).length,
    [candidateIds, selectedIds],
  );

  const refreshOfferData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/content-engine/offers"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/engine/hub"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/engine/offer-reviews"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/engine/offer-reviews/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/engine/jobs"] }),
    ]);
  };

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      const res = await apiRequest("POST", "/api/engine/offer-reviews/bulk-status", { ids, status });
      return res.json();
    },
    onSuccess: async (result: { updatedCount: number; status: string }) => {
      setSelectedIds([]);
      await refreshOfferData();
      toast({ title: `Updated ${result.updatedCount} offers`, description: `Moved selected offers to ${result.status}.` });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to update offer approvals", description: error.message, variant: "destructive" });
    },
  });

  const targetMutation = useMutation({
    mutationFn: async ({ offerId, dealershipIds }: { offerId: number; dealershipIds: number[] }) => {
      const res = await apiRequest("POST", `/api/content-engine/offers/${offerId}/targets`, { dealershipIds });
      return res.json();
    },
    onSuccess: async (result: { targetCount: number }) => {
      await refreshOfferData();
      toast({ title: "Dealer targets updated", description: `${result.targetCount} dealership targets saved for this approved offer.` });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save dealer targets", description: error.message, variant: "destructive" });
    },
  });

  const downstreamUseMutation = useMutation({
    mutationFn: async ({ offerId, dealershipId, uses }: { offerId: number; dealershipId: number; uses: Array<{ channel: string; placement: string }> }) => {
      const res = await apiRequest("POST", `/api/content-engine/offers/${offerId}/downstream-uses/${dealershipId}`, { uses });
      return res.json();
    },
    onSuccess: async (result: { useCount: number }) => {
      await refreshOfferData();
      toast({ title: "Downstream plan updated", description: `${result.useCount} downstream uses saved for that dealer offer.` });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save downstream plan", description: error.message, variant: "destructive" });
    },
  });

  const toggleSelected = (offerId: number, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(offerId) ? current : [...current, offerId];
      }
      return current.filter((id) => id !== offerId);
    });
  };

  const selectAllCandidates = () => setSelectedIds(candidateIds);
  const clearSelection = () => setSelectedIds([]);

  const toggleDealershipTarget = (offerId: number, dealershipId: number, selectedDealershipIds: number[]) => {
    const nextDealershipIds = selectedDealershipIds.includes(dealershipId)
      ? selectedDealershipIds.filter((id) => id !== dealershipId)
      : [...selectedDealershipIds, dealershipId];

    targetMutation.mutate({ offerId, dealershipIds: nextDealershipIds });
  };

  const setAllDealershipTargets = (offerId: number) => {
    targetMutation.mutate({ offerId, dealershipIds: selectionDealerships.map((dealership) => dealership.id) });
  };

  const clearDealershipTargets = (offerId: number) => {
    targetMutation.mutate({ offerId, dealershipIds: [] });
  };

  const toggleDownstreamUse = (
    offerId: number,
    dealershipId: number,
    currentUses: Array<{ channel: string; placement: string }>,
    nextUse: { channel: string; placement: string },
  ) => {
    const exists = currentUses.some((use) => use.channel === nextUse.channel);
    const nextUses = exists
      ? currentUses.filter((use) => use.channel !== nextUse.channel)
      : [...currentUses.filter((use) => use.channel !== nextUse.channel), nextUse];

    downstreamUseMutation.mutate({ offerId, dealershipId, uses: nextUses });
  };

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <BookOpen className="h-4 w-4" /> Offer Approval Layer
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approve the offers we actually want to run</CardTitle>
          <CardDescription>
            Candidates stay here until you check and approve them. Approved offers become the shared downstream pool for specials pages, emails, and related content.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Total {data?.stats.total ?? 0}</Badge>
            <Badge variant="outline">Awaiting approval {(data?.stats.detected ?? 0) + (data?.stats.reviewing ?? 0)}</Badge>
            <Badge variant="outline">Approved {data?.stats.approved ?? 0}</Badge>
            <Badge variant="outline">Published {data?.stats.published ?? 0}</Badge>
            <Badge variant="outline">Rejected {data?.stats.rejected ?? 0}</Badge>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-sm">Approval queue</div>
                <div className="text-xs text-muted-foreground">
                  {selectedCandidateCount} selected from {candidates.length} current candidates.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={selectAllCandidates} disabled={candidates.length === 0 || bulkStatusMutation.isPending}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection} disabled={selectedCandidateCount === 0 || bulkStatusMutation.isPending}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => bulkStatusMutation.mutate({ ids: selectedIds, status: "reviewing" })}
                  disabled={selectedCandidateCount === 0 || bulkStatusMutation.isPending}
                >
                  Mark reviewing
                </Button>
                <Button
                  size="sm"
                  onClick={() => bulkStatusMutation.mutate({ ids: selectedIds, status: "approved" })}
                  disabled={selectedCandidateCount === 0 || bulkStatusMutation.isPending}
                  data-testid="button-content-engine-approve-selected"
                >
                  Approve selected
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => bulkStatusMutation.mutate({ ids: selectedIds, status: "rejected" })}
                  disabled={selectedCandidateCount === 0 || bulkStatusMutation.isPending}
                >
                  Reject selected
                </Button>
              </div>
            </div>

            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offers are waiting for approval right now.</p>
            ) : (
              <div className="space-y-3">
                {candidates.map((offer) => {
                  const checked = selectedIds.includes(offer.id);
                  return (
                    <label key={offer.id} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={checked}
                        onChange={(event) => toggleSelected(offer.id, event.target.checked)}
                        data-testid={`checkbox-offer-${offer.id}`}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm">{offer.offerTitle}</div>
                            <div className="text-xs text-muted-foreground">
                              {[offer.brand, offer.accountName, offer.offerModel, offer.offerType].filter(Boolean).join(" • ") || offer.sourceKey}
                            </div>
                          </div>
                          <Badge variant="outline" className="capitalize">{offer.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Updated {new Date(offer.updatedAt).toLocaleString()}
                          {offer.effectiveDate ? ` • Starts ${new Date(offer.effectiveDate).toLocaleDateString()}` : ""}
                          {offer.expirationDate ? ` • Expires ${new Date(offer.expirationDate).toLocaleDateString()}` : ""}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={(event) => { event.preventDefault(); bulkStatusMutation.mutate({ ids: [offer.id], status: "reviewing" }); }} disabled={bulkStatusMutation.isPending || offer.status === "reviewing"}>
                            Reviewing
                          </Button>
                          <Button size="sm" onClick={(event) => { event.preventDefault(); bulkStatusMutation.mutate({ ids: [offer.id], status: "approved" }); }} disabled={bulkStatusMutation.isPending || offer.status === "approved"}>
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={(event) => { event.preventDefault(); bulkStatusMutation.mutate({ ids: [offer.id], status: "rejected" }); }} disabled={bulkStatusMutation.isPending || offer.status === "rejected"}>
                            Reject
                          </Button>
                          {offer.sourceUrl ? (
                            <Button size="sm" variant="ghost" asChild>
                              <a href={offer.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                Open source
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div>
              <div className="font-medium text-sm">Approved downstream pool</div>
              <div className="text-xs text-muted-foreground">
                These are the offers cleared for use across downstream content.
              </div>
            </div>

            {approved.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offers have been approved yet.</p>
            ) : (
              <div className="space-y-3">
                {approved.map((offer) => {
                  const selectedDealershipIds = offer.targets.map((target) => target.dealershipId);
                  return (
                    <div key={offer.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-sm">{offer.offerTitle}</div>
                          <div className="text-xs text-muted-foreground">
                            {[offer.brand, offer.accountName, offer.offerModel, offer.offerType].filter(Boolean).join(" • ") || offer.sourceKey}
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize">{offer.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Approved pool updated {new Date(offer.updatedAt).toLocaleString()}
                        {offer.expirationDate ? ` • Expires ${new Date(offer.expirationDate).toLocaleDateString()}` : ""}
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium text-sm">Dealer selection</div>
                            <div className="text-xs text-muted-foreground">
                              Pick which BMW stores should use this approved offer downstream.
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setAllDealershipTargets(offer.id)} disabled={targetMutation.isPending}>
                              All BMW stores
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => clearDealershipTargets(offer.id)} disabled={targetMutation.isPending || selectedDealershipIds.length === 0}>
                              Clear targets
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {selectionDealerships.map((dealership) => {
                            const isSelected = selectedDealershipIds.includes(dealership.id);
                            return (
                              <Button
                                key={dealership.id}
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                onClick={() => toggleDealershipTarget(offer.id, dealership.id, selectedDealershipIds)}
                                disabled={targetMutation.isPending}
                                data-testid={`button-offer-${offer.id}-dealer-${dealership.id}`}
                              >
                                {dealership.name}
                              </Button>
                            );
                          })}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          {offer.targets.length > 0
                            ? `Selected for: ${offer.targets.map((target) => target.dealershipName).join(", ")}`
                            : "No dealership targets selected yet. This offer is approved, but not routed to a specific BMW store yet."}
                        </div>

                        {offer.targets.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            {offer.targets.map((target) => {
                              const currentUses = target.downstreamUses.map((use) => ({ channel: use.channel, placement: use.placement }));
                              const specialsUse = currentUses.find((use) => use.channel === "specials-page");
                              const emailUse = currentUses.find((use) => use.channel === "sales-email");
                              return (
                                <div key={target.id} className="rounded-md border bg-background p-3 space-y-2">
                                  <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">{target.dealershipName} downstream plan</div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      size="sm"
                                      variant={specialsUse ? "default" : "outline"}
                                      onClick={() => toggleDownstreamUse(offer.id, target.dealershipId, currentUses, { channel: "specials-page", placement: specialsUse?.placement === "hero" ? "supporting" : "hero" })}
                                      disabled={downstreamUseMutation.isPending}
                                    >
                                      {specialsUse ? `Specials page: ${specialsUse.placement}` : "Use on specials page"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={emailUse ? "default" : "outline"}
                                      onClick={() => toggleDownstreamUse(offer.id, target.dealershipId, currentUses, { channel: "sales-email", placement: emailUse?.placement === "hero" ? "primary" : "hero" })}
                                      disabled={downstreamUseMutation.isPending}
                                    >
                                      {emailUse ? `Sales email: ${emailUse.placement}` : "Use in sales email"}
                                    </Button>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {target.downstreamUses.length > 0
                                      ? target.downstreamUses.map((use) => `${use.channel === "specials-page" ? "specials page" : "sales email"} as ${use.placement}`).join(" • ")
                                      : "Not yet assigned to a specials page or sales email slot."}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => bulkStatusMutation.mutate({ ids: [offer.id], status: "detected" })} disabled={bulkStatusMutation.isPending || targetMutation.isPending}>
                          Move back to queue
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => bulkStatusMutation.mutate({ ids: [offer.id], status: "published" })} disabled={bulkStatusMutation.isPending || targetMutation.isPending || offer.status === "published"}>
                          Mark published
                        </Button>
                        {offer.sourceUrl ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={offer.sourceUrl} target="_blank" rel="noreferrer">
                              Open source
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div>
              <div className="font-medium text-sm">Downstream build queue</div>
              <div className="text-xs text-muted-foreground">
                This is the dealer-by-dealer handoff state for specials pages and sales emails.
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {downstreamReadyByDealership.map((dealership) => (
                <div key={dealership.id} className="rounded-md border p-3 space-y-2">
                  <div className="font-medium text-sm">{dealership.name}</div>
                  {dealership.offers.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No approved offers are routed into downstream builds for this store yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {dealership.offers.map((offer) => (
                        <div key={`${dealership.id}-${offer.offerId}`} className="rounded-md border bg-muted/20 p-2">
                          <div className="text-sm font-medium">{offer.offerTitle}</div>
                          <div className="text-xs text-muted-foreground">
                            {offer.uses.map((use) => `${use.channel === "specials-page" ? "specials page" : "sales email"} as ${use.placement}`).join(" • ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-sm">Build-ready BMW manifests</div>
                <div className="text-xs text-muted-foreground">
                  This is the final handoff shape for specials-page and sales-email builds.
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {buildPlan?.generatedAt ? `Generated ${new Date(buildPlan.generatedAt).toLocaleString()}` : "Waiting for build plan"}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(buildPlan?.dealerships ?? []).map((dealership) => (
                <div key={dealership.dealershipId} className="rounded-md border p-3 space-y-3">
                  <div>
                    <div className="font-medium text-sm">{dealership.dealershipName}</div>
                    <div className="text-xs text-muted-foreground">{dealership.readyOfferCount} downstream placements ready to build.</div>
                  </div>

                  <div className="space-y-3">
                    {dealership.channels.map((channel) => (
                      <div key={`${dealership.dealershipId}-${channel.channel}`} className="rounded-md border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm">{channel.channelLabel}</div>
                          <Badge variant="outline">{channel.offerCount}</Badge>
                        </div>
                        {channel.offerCount === 0 ? (
                          <div className="text-xs text-muted-foreground">No approved offers assigned here yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {channel.offers.map((offer) => (
                              <div key={`${channel.channel}-${offer.offerReviewId}-${offer.placement}`} className="rounded-md border bg-background p-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-sm font-medium">{offer.offerTitle}</div>
                                  <Badge className="capitalize" variant="secondary">{offer.placement}</Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {[offer.offerModel, offer.offerType].filter(Boolean).join(" • ")}
                                  {offer.expirationDate ? ` • Expires ${new Date(offer.expirationDate).toLocaleDateString()}` : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OfferSources() {
  const { data, isLoading } = useQuery<EngineSourceRow[]>({
    queryKey: ["/api/engine/sources"],
  });

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  const sources = (data ?? []).filter((source) => source.moduleKey === "content-engine");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <BookOpen className="h-4 w-4" /> Vetted Offer Sources
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">BMW / Audi source reality</CardTitle>
          <CardDescription>Read-only vetting metadata for the real offer inputs the future watcher should use.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-medium text-sm">{source.name}</div>
                  <div className="text-xs text-muted-foreground">{source.sourceType} • {source.watcherType} • {source.target}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{source.status}</Badge>
                  <Badge variant="outline">Access: {source.accessStatus}</Badge>
                  <Badge variant="outline">{source.preferredRank ? `Priority ${source.preferredRank}` : "Unranked"}</Badge>
                </div>
              </div>
              {source.sourceUrl ? (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-block break-all">
                  {source.sourceUrl}
                </a>
              ) : null}
              <div className="text-xs text-muted-foreground">{formatUpdateWindowDays(source.updateWindowDays)}</div>
              {source.evidenceNotes ? <div className="text-xs text-muted-foreground">{source.evidenceNotes}</div> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── B. Active Shoots ────────────────────────────────────
const activeShoots = [
  { dealership: "Audi Baton Rouge", description: "Q5 Black Optic feature content (photos + video)", creator: "Adrian", status: "Pending" },
  { dealership: "Audi Baton Rouge", description: "Staff intro videos for Podium", creator: "Adrian", status: "Pending" },
];

function ActiveShoots() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Camera className="h-4 w-4" /> Active Shoots
      </h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">Dealership</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-left px-4 py-2 font-medium">Creator</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeShoots.map((shoot, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 font-medium">{shoot.dealership}</td>
                    <td className="px-4 py-2 text-muted-foreground">{shoot.description}</td>
                    <td className="px-4 py-2">{shoot.creator}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">{shoot.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── C. Content Needed ───────────────────────────────────
const contentNeeded = [
  { dealership: "Brian Harris BMW", color: "#1c69d4", items: ["Feature photos (no front plates)", "Staff intro videos", "M/Sport lot content"] },
  { dealership: "Audi Baton Rouge", color: "#BB0A21", items: ["Q5 Black Optic photos/video", "Staff intro videos", "Q7 lifestyle content"] },
  { dealership: "BMW of Jackson", color: "#1c69d4", items: ["Dealership exterior/aerial shot", "Lot lineup content", "5 Series feature content"] },
  { dealership: "Harris Porsche", color: "#333333", items: ["Dealership exterior/aerial shot", "Parts/merchandise product photos"] },
];

function ContentNeeded() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Camera className="h-4 w-4" /> Content Needed
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contentNeeded.map((item) => (
          <Card key={item.dealership} className="overflow-hidden">
            <div className="h-1" style={{ backgroundColor: item.color }} />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.dealership}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {item.items.map((need, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-muted-foreground/50 mt-0.5">-</span>
                    {need}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── D. Brand Guidelines ─────────────────────────────────
const brandGuidelines = [
  { name: "Brian Harris BMW", code: "BHBMW", color: "#1c69d4", font: "BMW Type Next", rules: ["No front plates", "No stock images"] },
  { name: "Audi Baton Rouge", code: "ABR", color: "#BB0A21", font: "Audi Type", rules: ["Dark theme", "No front plates", "No stock images"] },
  { name: "BMW of Jackson", code: "BMW Jackson", color: "#1c69d4", font: "BMW Type Next", rules: ["No front plates", "No stock images"] },
  { name: "Harris Porsche", code: "Harris Porsche", color: "#333333", font: "Porsche Next", rules: ["Black/White/Gray", "Minimalist", "No front plates"] },
];

function BrandGuidelines() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Palette className="h-4 w-4" /> Brand Guidelines
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {brandGuidelines.map((brand) => (
          <Card key={brand.code} className="overflow-hidden">
            <div className="h-1" style={{ backgroundColor: brand.color }} />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{brand.name}</CardTitle>
              <CardDescription className="text-xs">{brand.code}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border" style={{ backgroundColor: brand.color }} />
                <span className="text-xs font-mono text-muted-foreground">{brand.color}</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Type className="h-3 w-3" /> {brand.font}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {brand.rules.map((rule) => (
                  <Badge key={rule} variant="outline" className="text-xs">{rule}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── E. Creator Roster ───────────────────────────────────
const creators = [
  { name: "Adrian Danylle", role: "Video/Film", status: "Active" },
  { name: "Abbie Brunet", role: "Video/Content", status: "Active" },
];

function CreatorRoster() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Users className="h-4 w-4" /> Creator Roster
      </h2>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.name} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.role}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── F. Brand Fonts ──────────────────────────────────────
const bmwWeights = ["Thin", "Light", "Regular", "Medium", "Bold", "Black"];
const audiVariants = ["Normal", "Bold", "Italic", "WideNormal", "WideBold"];

function BrandFonts() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Download className="h-4 w-4" /> Brand Fonts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">BMW Type Next Pro</CardTitle>
            <CardDescription className="text-xs">.otf files</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {bmwWeights.map((w) => (
              <a
                key={w}
                href={`https://thecooperativeagency.github.io/fonts/bmw/BMWTypeNextPro-${w}.otf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                BMWTypeNextPro-{w}.otf
              </a>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Audi Type</CardTitle>
            <CardDescription className="text-xs">.woff2 + variable .ttf</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            {audiVariants.map((v) => (
              <a
                key={v}
                href={`https://thecooperativeagency.github.io/fonts/audi/AudiType-${v}_4.03.woff2`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                AudiType-{v}_4.03.woff2
              </a>
            ))}
            <a
              href="https://thecooperativeagency.github.io/fonts/audi/AudiTypeVF.ttf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              AudiTypeVF.ttf (Variable)
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────
export default function ContentEngine() {
  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-xl font-display font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" /> Content Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Content planning, brand guidelines, and creative resources
        </p>
      </div>

      <ContentCadence />
      <Separator />
      <OfferQueue />
      <Separator />
      <OfferSources />
      <Separator />
      <ActiveShoots />
      <Separator />
      <ContentNeeded />
      <Separator />
      <BrandGuidelines />
      <Separator />
      <CreatorRoster />
      <Separator />
      <BrandFonts />
    </div>
  );
}

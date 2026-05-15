import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookOpen, Clock, Download, ExternalLink, Mail, Image,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader, PageShell } from "@/components/page-shell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildOfferFamilyGroups } from "@/lib/offer-grouping";

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

interface EmailIterationCardData {
  id: number;
  dealershipId: number;
  campaignKey: string;
  campaignType: "sales" | "service";
  status: "active-now" | "later";
  latestBaseEmailReferenceFile: string | null;
  priorReferenceFiles: string[];
  selectedOfferReviewIds: number[];
  availableOfferOptions: Array<{
    id: number;
    offerTitle: string;
    offerModel: string | null;
    offerType: string | null;
    expirationDate: string | null;
    sourceUrl: string | null;
    channels: string[];
    placements: string[];
  }>;
  monthLabel: string;
  campaignLabel: string;
  offerChangesNotes: string;
  photoChangesNotes: string;
  themeCustomBlockNotes: string;
  ctaLinkNotes: string;
  carryoverNotes: string;
  store: string;
  brand: string | null;
  location: string | null;
}

interface EmailIterationData {
  cards: EmailIterationCardData[];
}

type EmailIterationDraft = {
  monthLabel: string;
  campaignLabel: string;
  selectedOfferReviewIds: number[];
  offerChangesNotes: string;
  photoChangesNotes: string;
  themeCustomBlockNotes: string;
  ctaLinkNotes: string;
  carryoverNotes: string;
};

function compactFileLabel(path: string | null) {
  if (!path) return "No base file seeded yet";
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-3).join(" / ");
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
            No cadence configured yet — set it up in Post Specs.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:hidden">
            {cadence.map((row, i) => {
              const platforms = JSON.parse(row.platforms) as string[];
              return (
                <Card key={i}>
                  <CardContent className="space-y-3 p-4">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{row.dealershipName}</div>
                      <div className="text-xs text-muted-foreground">{row.postType}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{row.postsPerDay} / day</Badge>
                      {platforms.map((platform) => (
                        <Badge key={platform} variant="secondary" className="text-[11px]">
                          {platform === "googlebusiness" ? "GMB" : platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="hidden md:block">
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
        </div>
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
  const groupedCandidates = useMemo(() => buildOfferFamilyGroups(candidates), [candidates]);
  const groupedApproved = useMemo(() => buildOfferFamilyGroups(approved), [approved]);
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
  const buildReadyDealershipCount = useMemo(
    () => downstreamReadyByDealership.filter((dealership) => dealership.offers.length > 0).length,
    [downstreamReadyByDealership],
  );
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
      queryClient.invalidateQueries({ queryKey: ["/api/content-engine/build-plan"] }),
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

  const setAllDealershipTargets = (offerId: number, dealershipIds: number[]) => {
    targetMutation.mutate({ offerId, dealershipIds });
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
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">1. Intake</div>
              <div className="text-lg font-semibold text-foreground">{(data?.stats.detected ?? 0) + (data?.stats.reviewing ?? 0)}</div>
              <p className="text-xs text-muted-foreground">Offers still waiting on approval decisions.</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">2. Approved pool</div>
              <div className="text-lg font-semibold text-foreground">{data?.stats.approved ?? 0}</div>
              <p className="text-xs text-muted-foreground">Cleared offers ready for dealership targeting and downstream use.</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">3. Build ready</div>
              <div className="text-lg font-semibold text-foreground">{buildReadyDealershipCount}</div>
              <p className="text-xs text-muted-foreground">Dealerships with at least one routed specials-page or sales-email handoff.</p>
            </div>
          </div>

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
                <div className="font-medium text-sm">Offers waiting for approval</div>
                <div className="text-xs text-muted-foreground">
                  {selectedCandidateCount} selected from {candidates.length} offers still in intake.
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
              <Accordion type="multiple" defaultValue={groupedCandidates.map((brandGroup) => `candidate-${brandGroup.brandLabel}`)} className="space-y-4">
                {groupedCandidates.map((brandGroup) => {
                  const tone = getBrandSectionClasses(brandGroup.brandLabel);
                  return (
                  <AccordionItem value={`candidate-${brandGroup.brandLabel}`} key={brandGroup.brandLabel} className={`rounded-xl border p-4 shadow-sm ${tone.wrap}`}>
                    <AccordionTrigger className="py-0 hover:no-underline">
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 pr-3">
                        <div className="text-left">
                          <div className={`font-semibold text-base ${tone.heading}`}>{brandGroup.brandLabel}</div>
                          <div className="text-xs text-muted-foreground">
                            {brandGroup.totalCount} offer{brandGroup.totalCount === 1 ? "" : "s"} waiting in this brand queue.
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
                                    {familyGroup.offers.map((offer) => {
                                      const checked = selectedIds.includes(offer.id);
                                      return (
                                        <label key={offer.id} className="flex items-start gap-2.5 rounded-lg border bg-background px-3 py-2.5 cursor-pointer">
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
                                                <div className="font-medium text-sm leading-snug">{offer.offerTitle}</div>
                                                <div className="text-[11px] text-muted-foreground line-clamp-1">
                                                  {[offer.accountName, offer.offerModel].filter(Boolean).join(" • ") || offer.sourceKey}
                                                </div>
                                              </div>
                                              <Badge variant="outline" className="capitalize">{offer.status}</Badge>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">
                                              Updated {new Date(offer.updatedAt).toLocaleString()}
                                              {offer.effectiveDate ? ` • Starts ${new Date(offer.effectiveDate).toLocaleDateString()}` : ""}
                                              {offer.expirationDate ? ` • Expires ${new Date(offer.expirationDate).toLocaleDateString()}` : ""}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 pt-0.5">
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
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div>
              <div className="font-medium text-sm">Approved offers ready for routing</div>
              <div className="text-xs text-muted-foreground">
                These are the offers already cleared for specials pages, sales emails, and related downstream work.
              </div>
            </div>

            {approved.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offers have been approved yet.</p>
            ) : (
              <Accordion type="multiple" defaultValue={groupedApproved.map((brandGroup) => `approved-${brandGroup.brandLabel}`)} className="space-y-4">
                {groupedApproved.map((brandGroup) => {
                  const tone = getBrandSectionClasses(brandGroup.brandLabel);
                  return (
                  <AccordionItem value={`approved-${brandGroup.brandLabel}`} key={brandGroup.brandLabel} className={`rounded-xl border p-4 shadow-sm ${tone.wrap}`}>
                    <AccordionTrigger className="py-0 hover:no-underline">
                      <div className="flex w-full flex-wrap items-center justify-between gap-2 pr-3">
                        <div className="text-left">
                          <div className={`font-semibold text-base ${tone.heading}`}>{brandGroup.brandLabel}</div>
                          <div className="text-xs text-muted-foreground">
                            {brandGroup.totalCount} approved offer{brandGroup.totalCount === 1 ? "" : "s"} in this downstream pool.
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
                                    {familyGroup.offers.map((offer) => {
                                      const brandDealerships = selectionDealerships.filter((dealership) => !offer.brand || dealership.brand === offer.brand);
                                      const selectedDealershipIds = offer.targets.map((target) => target.dealershipId);
                                      const publishReady = offer.targets.some((target) => target.downstreamUses.length > 0);
                                      return (
                                        <div key={offer.id} className="rounded-lg border bg-background px-3 py-2.5 space-y-2">
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="font-medium text-sm leading-snug">{offer.offerTitle}</div>
                                              <div className="text-[11px] text-muted-foreground line-clamp-1">
                                                {[offer.accountName, offer.offerModel].filter(Boolean).join(" • ") || offer.sourceKey}
                                              </div>
                                            </div>
                                            <Badge variant="outline" className="capitalize">{offer.status}</Badge>
                                          </div>
                                          <div className="text-[11px] text-muted-foreground">
                                            Approved pool updated {new Date(offer.updatedAt).toLocaleString()}
                                            {offer.expirationDate ? ` • Expires ${new Date(offer.expirationDate).toLocaleDateString()}` : ""}
                                          </div>

                                          <div className="rounded-md border bg-muted/20 px-2.5 py-2 space-y-2">
                                            <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
                                              <div className="space-y-0.5">
                                                <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Dealer selection</div>
                                                <div className="text-[11px] text-muted-foreground">
                                                  Pick which {offer.brand || "approved"} stores should use this offer downstream.
                                                </div>
                                              </div>
                                              <div className="flex flex-wrap gap-1.5">
                                                <Button size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => setAllDealershipTargets(offer.id, brandDealerships.map((dealership) => dealership.id))} disabled={targetMutation.isPending || brandDealerships.length === 0}>
                                                  All {offer.brand || "selected"} stores
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => clearDealershipTargets(offer.id)} disabled={targetMutation.isPending || selectedDealershipIds.length === 0}>
                                                  Clear targets
                                                </Button>
                                              </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1.5">
                                              {brandDealerships.map((dealership) => {
                                                const isSelected = selectedDealershipIds.includes(dealership.id);
                                                return (
                                                  <Button
                                                    key={dealership.id}
                                                    size="sm"
                                                    variant={isSelected ? "default" : "outline"}
                                                    className="h-7 rounded-full px-2.5 text-[11px]"
                                                    onClick={() => toggleDealershipTarget(offer.id, dealership.id, selectedDealershipIds)}
                                                    disabled={targetMutation.isPending}
                                                    data-testid={`button-offer-${offer.id}-dealer-${dealership.id}`}
                                                  >
                                                    {dealership.name}
                                                  </Button>
                                                );
                                              })}
                                            </div>

                                            <div className="rounded-md border border-dashed bg-background/70 px-2 py-1.5">
                                              {offer.targets.length > 0 ? (
                                                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                  <span className="font-medium text-muted-foreground">Selected for</span>
                                                  {offer.targets.map((target) => (
                                                    <Badge key={target.id} variant="secondary" className="rounded-full px-2 py-0.5 text-[11px] font-normal">
                                                      {target.dealershipName}
                                                    </Badge>
                                                  ))}
                                                </div>
                                              ) : (
                                                <div className="text-[11px] text-muted-foreground">
                                                  No dealership targets selected yet. This {offer.brand || "approved"} offer is approved, but not routed to a store yet.
                                                </div>
                                              )}
                                            </div>

                                            {offer.targets.length > 0 ? (
                                              <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                {offer.targets.map((target) => {
                                                  const currentUses = target.downstreamUses.map((use) => ({ channel: use.channel, placement: use.placement }));
                                                  const specialsUse = currentUses.find((use) => use.channel === "specials-page");
                                                  const emailUse = currentUses.find((use) => use.channel === "sales-email");
                                                  return (
                                                    <div key={target.id} className="flex min-w-[240px] flex-1 flex-wrap items-center gap-1.5 rounded-full border bg-background px-2 py-1.5">
                                                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px] font-medium">
                                                        {target.dealershipName}
                                                      </Badge>
                                                      <Button
                                                        size="sm"
                                                        variant={specialsUse ? "default" : "outline"}
                                                        className="h-7 rounded-full px-2.5 text-[11px]"
                                                        onClick={() => toggleDownstreamUse(offer.id, target.dealershipId, currentUses, { channel: "specials-page", placement: specialsUse?.placement === "hero" ? "supporting" : "hero" })}
                                                        disabled={downstreamUseMutation.isPending}
                                                      >
                                                        {specialsUse ? `Specials page: ${specialsUse.placement}` : "Use on specials page"}
                                                      </Button>
                                                      <Button
                                                        size="sm"
                                                        variant={emailUse ? "default" : "outline"}
                                                        className="h-7 rounded-full px-2.5 text-[11px]"
                                                        onClick={() => toggleDownstreamUse(offer.id, target.dealershipId, currentUses, { channel: "sales-email", placement: emailUse?.placement === "hero" ? "primary" : "hero" })}
                                                        disabled={downstreamUseMutation.isPending}
                                                      >
                                                        {emailUse ? `Sales email: ${emailUse.placement}` : "Use in sales email"}
                                                      </Button>
                                                      <span className="text-[11px] text-muted-foreground">
                                                        {target.downstreamUses.length > 0
                                                          ? target.downstreamUses.map((use) => `${use.channel === "specials-page" ? "specials page" : "sales email"} as ${use.placement}`).join(" • ")
                                                          : "Not yet assigned to a specials page or sales email slot."}
                                                      </span>
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
                                          <Button size="sm" variant="secondary" onClick={() => bulkStatusMutation.mutate({ ids: [offer.id], status: "published" })} disabled={bulkStatusMutation.isPending || targetMutation.isPending || offer.status === "published" || !publishReady}>
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
                                        {!publishReady ? (
                                          <div className="text-xs text-muted-foreground">
                                            Add at least one specials-page or sales-email handoff before marking this offer published.
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
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
                <div key={dealership.id} className="rounded-md border px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{dealership.name}</div>
                    <Badge variant="outline">{dealership.offers.length}</Badge>
                  </div>
                  {dealership.offers.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">No approved offers are routed into downstream builds for this store yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {dealership.offers.map((offer) => (
                        <div key={`${dealership.id}-${offer.offerId}`} className="flex min-w-[220px] flex-1 flex-wrap items-center gap-1.5 rounded-full border bg-muted/20 px-2 py-1.5">
                          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px] font-normal">{offer.offerTitle}</Badge>
                          {offer.uses.map((use) => (
                            <Badge key={`${dealership.id}-${offer.offerId}-${use.id}`} variant="outline" className="rounded-full px-2 py-0.5 text-[11px] font-normal capitalize">
                              {use.channel === "specials-page" ? "specials" : "email"}: {use.placement}
                            </Badge>
                          ))}
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
                <div className="font-medium text-sm">Build-ready dealership manifests</div>
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
                <div key={dealership.dealershipId} className="rounded-md border px-3 py-2.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{dealership.dealershipName}</div>
                      <div className="text-[11px] text-muted-foreground">{dealership.readyOfferCount} downstream placements ready to build.</div>
                    </div>
                    <Badge variant="outline">{dealership.readyOfferCount}</Badge>
                  </div>

                  <div className="space-y-2">
                    {dealership.channels.map((channel) => (
                      <div key={`${dealership.dealershipId}-${channel.channel}`} className="rounded-md border bg-muted/20 px-2.5 py-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-xs uppercase tracking-wide text-muted-foreground">{channel.channelLabel}</div>
                          <Badge variant="outline">{channel.offerCount}</Badge>
                        </div>
                        {channel.offerCount === 0 ? (
                          <div className="text-[11px] text-muted-foreground">No approved offers assigned here yet.</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {channel.offers.map((offer) => (
                              <div key={`${channel.channel}-${offer.offerReviewId}-${offer.placement}`} className="flex min-w-[220px] flex-1 flex-wrap items-center gap-1.5 rounded-full border bg-background px-2 py-1.5">
                                <Badge className="rounded-full px-2 py-0.5 text-[11px] font-normal" variant="secondary">{offer.offerTitle}</Badge>
                                <Badge className="rounded-full px-2 py-0.5 text-[11px] capitalize" variant="outline">{offer.placement}</Badge>
                                {offer.offerModel ? (
                                  <span className="text-[11px] text-muted-foreground">{offer.offerModel}</span>
                                ) : null}
                                {offer.expirationDate ? (
                                  <span className="text-[11px] text-muted-foreground">Expires {new Date(offer.expirationDate).toLocaleDateString()}</span>
                                ) : null}
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

function EmailIterationSetup() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<EmailIterationData>({
    queryKey: ["/api/content-engine/email-iterations"],
  });
  const [drafts, setDrafts] = useState<Record<number, EmailIterationDraft>>({});

  useEffect(() => {
    if (!data?.cards) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const card of data.cards) {
        next[card.id] = current[card.id] ?? {
          monthLabel: card.monthLabel,
          campaignLabel: card.campaignLabel,
          selectedOfferReviewIds: card.selectedOfferReviewIds,
          offerChangesNotes: card.offerChangesNotes,
          photoChangesNotes: card.photoChangesNotes,
          themeCustomBlockNotes: card.themeCustomBlockNotes,
          ctaLinkNotes: card.ctaLinkNotes,
          carryoverNotes: card.carryoverNotes,
        };
      }
      return next;
    });
  }, [data]);

  const updateDraft = (id: number, patch: Partial<EmailIterationDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? {
          monthLabel: "",
          campaignLabel: "",
          selectedOfferReviewIds: [],
          offerChangesNotes: "",
          photoChangesNotes: "",
          themeCustomBlockNotes: "",
          ctaLinkNotes: "",
          carryoverNotes: "",
        }),
        ...patch,
      },
    }));
  };

  const toggleSelectedOffer = (cardId: number, offerReviewId: number) => {
    const selectedIds = drafts[cardId]?.selectedOfferReviewIds ?? data?.cards.find((card) => card.id === cardId)?.selectedOfferReviewIds ?? [];
    updateDraft(cardId, {
      selectedOfferReviewIds: selectedIds.includes(offerReviewId)
        ? selectedIds.filter((id) => id !== offerReviewId)
        : [...selectedIds, offerReviewId],
    });
  };

  const saveMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: number; draft: EmailIterationDraft }) => {
      const res = await apiRequest("PATCH", `/api/content-engine/email-iterations/${id}`, draft);
      return res.json();
    },
    onSuccess: async (updated: EmailIterationCardData) => {
      setDrafts((current) => ({
        ...current,
        [updated.id]: {
          monthLabel: updated.monthLabel,
          campaignLabel: updated.campaignLabel,
          selectedOfferReviewIds: updated.selectedOfferReviewIds,
          offerChangesNotes: updated.offerChangesNotes,
          photoChangesNotes: updated.photoChangesNotes,
          themeCustomBlockNotes: updated.themeCustomBlockNotes,
          ctaLinkNotes: updated.ctaLinkNotes,
          carryoverNotes: updated.carryoverNotes,
        },
      }));
      await queryClient.invalidateQueries({ queryKey: ["/api/content-engine/email-iterations"] });
      toast({ title: `Saved ${updated.store} ${updated.campaignType} iterator` });
    },
    onError: (error: Error) => {
      toast({ title: "Unable to save email iterator", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <Skeleton className="h-32 rounded-lg" />;

  const cards = data?.cards ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Mail className="h-4 w-4" /> Email Iteration Setup
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Build each month from the last approved email</CardTitle>
          <CardDescription>
            This is the monthly iterator layer for dealership sales and service emails. Pick up last month’s base, note the offer/photo/theme deltas, and keep production moving without redesigning the template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">Active now {cards.filter((card) => card.status === "active-now").length}</Badge>
            <Badge variant="outline">Later {cards.filter((card) => card.status === "later").length}</Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {cards.map((card) => {
              const draft = drafts[card.id] ?? {
                monthLabel: card.monthLabel,
                campaignLabel: card.campaignLabel,
                selectedOfferReviewIds: card.selectedOfferReviewIds,
                offerChangesNotes: card.offerChangesNotes,
                photoChangesNotes: card.photoChangesNotes,
                themeCustomBlockNotes: card.themeCustomBlockNotes,
                ctaLinkNotes: card.ctaLinkNotes,
                carryoverNotes: card.carryoverNotes,
              };

              return (
                <div key={card.id} className="rounded-lg border px-3 py-2.5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{card.store}</div>
                      <div className="text-[11px] text-muted-foreground">{card.location || card.brand || "Email iterator"}</div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant={card.status === "active-now" ? "default" : "secondary"}>
                        {card.status === "active-now" ? "Active now" : "Later"}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{card.campaignType}</Badge>
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/20 px-2.5 py-2 space-y-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Latest base email</div>
                      {card.latestBaseEmailReferenceFile ? (
                        <a href={`file://${card.latestBaseEmailReferenceFile}`} className="text-xs text-primary hover:underline break-all">
                          {compactFileLabel(card.latestBaseEmailReferenceFile)}
                        </a>
                      ) : (
                        <div className="text-xs text-muted-foreground">No base file seeded yet.</div>
                      )}
                    </div>

                    {card.priorReferenceFiles.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reference history</div>
                        <div className="flex flex-wrap gap-1.5">
                          {card.priorReferenceFiles.map((path) => (
                            <Badge key={path} variant="outline" className="rounded-full px-2 py-0.5 text-[11px] font-normal">
                              {compactFileLabel(path)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-md border bg-muted/20 px-2.5 py-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Monthly offer menu</div>
                        <div className="text-[11px] text-muted-foreground">Pick the offers you want in play this month. This does *not* auto-write them into the email.</div>
                      </div>
                      <Badge variant="outline">{draft.selectedOfferReviewIds.length} selected</Badge>
                    </div>
                    {card.availableOfferOptions.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No approved offer menu is available for this store yet.</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {card.availableOfferOptions.map((offer) => {
                          const isSelected = draft.selectedOfferReviewIds.includes(offer.id);
                          return (
                            <button
                              key={offer.id}
                              type="button"
                              onClick={() => toggleSelectedOffer(card.id, offer.id)}
                              className={`rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors ${isSelected ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
                            >
                              <span className="font-medium text-foreground">{offer.offerTitle}</span>
                              {offer.offerModel ? <span className="ml-1">• {offer.offerModel}</span> : null}
                              {offer.offerType ? <span className="ml-1 uppercase">• {offer.offerType}</span> : null}
                              {offer.channels.length > 0 ? <span className="ml-1">• {offer.channels.join(", ")}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Month label</label>
                      <Input value={draft.monthLabel} onChange={(event) => updateDraft(card.id, { monthLabel: event.target.value })} placeholder="June 2026" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campaign label</label>
                      <Input value={draft.campaignLabel} onChange={(event) => updateDraft(card.id, { campaignLabel: event.target.value })} placeholder="Monthly sales email" className="h-8 text-sm" />
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Offer changes</label>
                      <Textarea value={draft.offerChangesNotes} onChange={(event) => updateDraft(card.id, { offerChangesNotes: event.target.value })} placeholder="What offers changed from the base email?" className="min-h-[76px] text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Photo changes</label>
                      <Textarea value={draft.photoChangesNotes} onChange={(event) => updateDraft(card.id, { photoChangesNotes: event.target.value })} placeholder="Which photo slots need updating?" className="min-h-[76px] text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Theme / custom blocks</label>
                      <Textarea value={draft.themeCustomBlockNotes} onChange={(event) => updateDraft(card.id, { themeCustomBlockNotes: event.target.value })} placeholder="Seasonal theme, loyalty block, event insert, local special..." className="min-h-[76px] text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CTA / link changes</label>
                      <Textarea value={draft.ctaLinkNotes} onChange={(event) => updateDraft(card.id, { ctaLinkNotes: event.target.value })} placeholder="Anything to adjust in links, nav, buttons, destinations?" className="min-h-[76px] text-sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Carryover / base notes</label>
                    <Textarea value={draft.carryoverNotes} onChange={(event) => updateDraft(card.id, { carryoverNotes: event.target.value })} placeholder="What should stay the same from the base email?" className="min-h-[76px] text-sm" />
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => saveMutation.mutate({ id: card.id, draft })} disabled={saveMutation.isPending}>
                      Save iterator notes
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── B. Brand Fonts ──────────────────────────────────────
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
    <PageShell className="max-w-[1100px]">
      <PageHeader
        eyebrow="Engine / Content Engine"
        title="Content Engine"
        description="Shared offer review, routing, and build-manifest handoff inside ENGINE. Approve offers here, route them store by store, then hand them into specials pages and sales emails."
      />

      <ContentCadence />
      <Separator />
      <OfferQueue />
      <Separator />
      <EmailIterationSetup />
      <Separator />
      <OfferSources />
      <Separator />
      <BrandFonts />
    </PageShell>
  );
}

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  XCircle,
  ClipboardCheck,
  ImageIcon,
  Instagram,
  Facebook,
  Layers,
  Play,
  Video,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Post, Dealership } from "@shared/schema";
import { cn } from "@/lib/utils";

function parseMediaUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((u) => String(u || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function isVideoUrl(url: string): boolean {
  const clean = url.split("?")[0].toLowerCase();
  return /\.(mp4|mov|m4v|webm|avi)$/i.test(clean);
}

function resolveMediaBadge(mediaType: string | null | undefined, urls: string[]): string {
  const count = urls.length;
  if (count === 0) return "No media";
  if (count > 1 || (mediaType || "").toLowerCase() === "carousel") return `Carousel · ${count}`;
  if ((mediaType || "").toLowerCase() === "video" || isVideoUrl(urls[0])) return "Video";
  return "Image";
}

function fileNameFromUrl(url: string): string {
  try {
    const path = url.split("?")[0];
    const last = path.split("/").pop() || "";
    return decodeURIComponent(last) || url;
  } catch {
    return url;
  }
}

function PlatformBadges({ platforms }: { platforms: string | null }) {
  if (!platforms) return null;
  let parsed: string[] = [];
  try {
    parsed = JSON.parse(platforms);
  } catch {
    return null;
  }
  return (
    <div className="flex gap-1.5">
      {parsed.includes("instagram") && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Instagram className="h-3 w-3" /> IG
        </span>
      )}
      {parsed.includes("facebook") && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Facebook className="h-3 w-3" /> FB
        </span>
      )}
      {parsed.includes("tiktok") && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Video className="h-3 w-3" /> TikTok
        </span>
      )}
    </div>
  );
}

function MediaTypeBadge({ mediaType, urls }: { mediaType: string | null | undefined; urls: string[] }) {
  const label = resolveMediaBadge(mediaType, urls);
  const isCarousel = label.startsWith("Carousel");
  const isVideo = label === "Video";
  return (
    <Badge variant="outline" className="text-[10px] font-medium gap-1 px-1.5 py-0 h-5">
      {isCarousel ? (
        <Layers className="h-3 w-3" />
      ) : isVideo ? (
        <Video className="h-3 w-3" />
      ) : (
        <ImageIcon className="h-3 w-3" />
      )}
      {label}
    </Badge>
  );
}

function ReviewMediaStrip({
  postId,
  mediaType,
  mediaUrlsRaw,
  vehicleInfo,
}: {
  postId: number;
  mediaType: string | null | undefined;
  mediaUrlsRaw: string | null | undefined;
  vehicleInfo?: string | null;
}) {
  const urls = useMemo(() => parseMediaUrls(mediaUrlsRaw), [mediaUrlsRaw]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const open = lightboxIndex !== null && urls.length > 0;
  const activeIndex = lightboxIndex ?? 0;
  const activeUrl = urls[activeIndex];
  const activeIsVideo = activeUrl ? isVideoUrl(activeUrl) : false;

  if (urls.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-xs text-muted-foreground"
        data-testid={`media-strip-empty-${postId}`}
      >
        <ImageIcon className="h-4 w-4 shrink-0 opacity-50" />
        No media attached
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2" data-testid={`media-strip-${postId}`}>
        <div className="flex items-center justify-between gap-2">
          <MediaTypeBadge mediaType={mediaType} urls={urls} />
          <span className="text-[10px] text-muted-foreground">
            Tap to enlarge · order = publish order
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {urls.map((url, index) => {
            const video = isVideoUrl(url);
            const name = fileNameFromUrl(url);
            return (
              <button
                key={`${postId}-${index}-${url.slice(-24)}`}
                type="button"
                title={name}
                onClick={() => setLightboxIndex(index)}
                className={cn(
                  "group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted/40",
                  "ring-offset-background transition hover:ring-2 hover:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                data-testid={`media-thumb-${postId}-${index}`}
              >
                {video ? (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-900/90">
                    <video
                      src={url}
                      muted
                      preload="metadata"
                      playsInline
                      className="absolute inset-0 h-full w-full object-cover opacity-70"
                    />
                    <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                  </div>
                ) : (
                  <img
                    src={url}
                    alt={`Slide ${index + 1}${vehicleInfo ? ` — ${vehicleInfo}` : ""}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget;
                      el.style.display = "none";
                      const fallback = el.nextElementSibling as HTMLElement | null;
                      if (fallback) fallback.hidden = false;
                    }}
                  />
                )}
                {!video && (
                  <div
                    hidden
                    className="absolute inset-0 flex items-center justify-center bg-muted text-[10px] text-muted-foreground p-1 text-center"
                  >
                    Preview unavailable
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-black/65 px-1 py-px text-[10px] font-semibold leading-none text-white">
                  {index + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setLightboxIndex(null);
        }}
      >
        <DialogContent className="max-w-3xl gap-3 p-4 sm:p-6">
          <DialogHeader className="space-y-1 pr-8">
            <DialogTitle className="text-base">
              {vehicleInfo || "Media preview"}
            </DialogTitle>
            <DialogDescription>
              Slide {activeIndex + 1} of {urls.length}
              {activeUrl ? ` · ${fileNameFromUrl(activeUrl)}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border bg-black/95">
            {activeUrl && activeIsVideo ? (
              <video
                key={activeUrl}
                src={activeUrl}
                controls
                autoPlay
                playsInline
                className="max-h-[70vh] w-full object-contain"
              />
            ) : activeUrl ? (
              <img
                key={activeUrl}
                src={activeUrl}
                alt={`Slide ${activeIndex + 1}`}
                className="max-h-[70vh] w-full object-contain"
              />
            ) : null}

            {urls.length > 1 && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full opacity-90"
                  onClick={() =>
                    setLightboxIndex((i) => {
                      const cur = i ?? 0;
                      return (cur - 1 + urls.length) % urls.length;
                    })
                  }
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full opacity-90"
                  onClick={() =>
                    setLightboxIndex((i) => {
                      const cur = i ?? 0;
                      return (cur + 1) % urls.length;
                    })
                  }
                  aria-label="Next slide"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {urls.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {urls.map((url, index) => {
                const video = isVideoUrl(url);
                return (
                  <button
                    key={`lb-${postId}-${index}`}
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    className={cn(
                      "relative h-12 w-12 shrink-0 overflow-hidden rounded border",
                      index === activeIndex ? "ring-2 ring-ring" : "opacity-70 hover:opacity-100",
                    )}
                  >
                    {video ? (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-white">
                        <Play className="h-3 w-3 fill-current" />
                      </div>
                    ) : (
                      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[9px] text-white">
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewPostCard({
  post,
  dealershipName,
  dealershipColor,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  approvePending,
  rejectPending,
}: {
  post: Post;
  dealershipName: string;
  dealershipColor: string;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  approvePending: boolean;
  rejectPending: boolean;
}) {
  const { toast } = useToast();
  const [direction, setDirection] = useState("");

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      const trimmed = direction.trim();
      if (!trimmed) throw new Error("Add a rewrite prompt/topic first.");
      const res = await apiRequest("POST", `/api/posts/${post.id}/rewrite-caption`, {
        direction: trimmed,
      });
      return res.json() as Promise<Post>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Caption rewritten", description: "Review the new copy, then Approve." });
    },
    onError: (err: Error) => {
      toast({ title: "Rewrite failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="hover-elevate overflow-hidden" data-testid={`card-queue-${post.id}`}>
      <div className="h-1" style={{ backgroundColor: dealershipColor }} />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              data-testid={`checkbox-queue-${post.id}`}
            />
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: dealershipColor }}
            />
            <span className="text-sm font-medium truncate">{dealershipName}</span>
          </div>
          <Badge variant="secondary" className="text-xs capitalize shrink-0">
            {post.postType}
          </Badge>
        </div>

        {post.vehicleInfo && (
          <p className="text-sm font-medium">{post.vehicleInfo}</p>
        )}

        <ReviewMediaStrip
          postId={post.id}
          mediaType={post.mediaType}
          mediaUrlsRaw={post.mediaUrls}
          vehicleInfo={post.vehicleInfo}
        />

        {post.caption && (
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {post.caption}
          </p>
        )}
        {(post as any).captionFacebook && (post as any).captionFacebook !== post.caption && (
          <div className="rounded-md border bg-muted/20 p-2 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Facebook</p>
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {(post as any).captionFacebook}
            </p>
          </div>
        )}
        {(post as any).captionGmb && (
          <div className="rounded-md border bg-muted/20 p-2 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">GMB</p>
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {(post as any).captionGmb}
            </p>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-3">
          <Label htmlFor={`rewrite-${post.id}`} className="text-xs font-medium">
            Rewrite prompt / topic
          </Label>
          <Textarea
            id={`rewrite-${post.id}`}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder='e.g. "Focus on weekend getaway vibe, family SUV, soft luxury — skip horsepower talk"'
            className="min-h-[72px] text-sm resize-y"
            data-testid={`input-rewrite-${post.id}`}
          />
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => rewriteMutation.mutate()}
            disabled={rewriteMutation.isPending || !direction.trim()}
            data-testid={`button-rewrite-${post.id}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${rewriteMutation.isPending ? "animate-spin" : ""}`} />
            {rewriteMutation.isPending ? "Rewriting…" : "Rewrite caption"}
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <PlatformBadges platforms={post.platforms} />
          {post.scheduledFor && (
            <span className="text-xs text-muted-foreground">
              {new Date(post.scheduledFor).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={onApprove}
            disabled={approvePending || rewriteMutation.isPending}
            className="flex-1"
            data-testid={`button-approve-${post.id}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Approve
          </Button>
          <Link href={`/posts/${post.id}`}>
            <Button size="sm" variant="outline" data-testid={`button-edit-${post.id}`}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </Link>
          <Button
            size="sm"
            variant="destructive"
            onClick={onReject}
            disabled={rejectPending}
            data-testid={`button-reject-${post.id}`}
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReviewQueue({ dealershipFilter }: { dealershipFilter: number | null }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { toast } = useToast();

  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  const queryParams = new URLSearchParams({ status: "queued" });
  if (dealershipFilter) queryParams.set("dealershipId", dealershipFilter.toString());

  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts", "queued", dealershipFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts?${queryParams.toString()}`);
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/posts/${id}`, { status: "scheduled" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Post approved and scheduled" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/posts/${id}`, { status: "rejected" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Post rejected" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/posts/bulk-approve", { ids });
      return res.json() as Promise<{ successful: Post[]; failed: Array<{ id: number; error: string; folderSource?: string }> }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });

      const failedIds = new Set(result.failed.map((item) => item.id));
      setSelectedIds((prev) => prev.filter((id) => failedIds.has(id)));

      if (result.failed.length > 0) {
        toast({
          title: `${result.successful.length} posts scheduled, ${result.failed.length} blocked`,
          description: result.failed[0]?.error,
          variant: "destructive",
        });
        return;
      }

      setSelectedIds([]);
      toast({ title: "Posts bulk approved and scheduled" });
    },
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getDealershipName = (id: number) => dealerships?.find((d) => d.id === id)?.name ?? "Unknown";
  const getDealershipColor = (id: number) => dealerships?.find((d) => d.id === id)?.color ?? "#888";

  return (
    <div className="p-6 space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold" data-testid="text-queue-title">
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Imported posts awaiting review — rewrite captions with a prompt, then approve
          </p>
        </div>
        {selectedIds.length > 0 && (
          <Button
            size="sm"
            onClick={() => bulkApproveMutation.mutate(selectedIds)}
            disabled={bulkApproveMutation.isPending}
            data-testid="button-bulk-approve"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Approve {selectedIds.length} Selected
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium">Queue is empty</p>
            <p className="text-xs text-muted-foreground mt-1">
              No posts are waiting for review
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post) => (
            <ReviewPostCard
              key={post.id}
              post={post}
              dealershipName={getDealershipName(post.dealershipId)}
              dealershipColor={getDealershipColor(post.dealershipId)}
              selected={selectedIds.includes(post.id)}
              onToggleSelect={() => toggleSelect(post.id)}
              onApprove={() => approveMutation.mutate(post.id)}
              onReject={() => rejectMutation.mutate(post.id)}
              approvePending={approveMutation.isPending}
              rejectPending={rejectMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CheckCircle2,
  Pencil,
  XCircle,
  ClipboardCheck,
  Instagram,
  Facebook,
  Video,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Post, Dealership } from "@shared/schema";

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

export default function ReviewQueue({ dealershipFilter }: { dealershipFilter: number | null }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { toast } = useToast();

  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  const queryParams = new URLSearchParams({ status: "pending_review" });
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
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold" data-testid="text-queue-title">
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Posts awaiting approval
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
            <Card key={post.id} className="hover-elevate overflow-hidden" data-testid={`card-queue-${post.id}`}>
              <div className="h-1" style={{ backgroundColor: getDealershipColor(post.dealershipId) }} />
              <CardContent className="p-4 space-y-3">
                {/* Top row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.includes(post.id)}
                      onCheckedChange={() => toggleSelect(post.id)}
                      data-testid={`checkbox-queue-${post.id}`}
                    />
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getDealershipColor(post.dealershipId) }}
                    />
                    <span className="text-sm font-medium">
                      {getDealershipName(post.dealershipId)}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-xs capitalize">
                    {post.postType}
                  </Badge>
                </div>

                {/* Content */}
                {post.vehicleInfo && (
                  <p className="text-sm font-medium">{post.vehicleInfo}</p>
                )}
                {post.caption && (
                  <p className="text-sm text-foreground/80 leading-relaxed line-clamp-4">
                    {post.caption}
                  </p>
                )}
                {post.hashtags && (
                  <p className="text-xs text-primary">{post.hashtags}</p>
                )}

                {/* Meta */}
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

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(post.id)}
                    disabled={approveMutation.isPending}
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
                    onClick={() => rejectMutation.mutate(post.id)}
                    disabled={rejectMutation.isPending}
                    data-testid={`button-reject-${post.id}`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

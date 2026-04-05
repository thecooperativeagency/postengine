import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  PlusCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle2,
  Instagram,
  Facebook,
  Video,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Post, Dealership } from "@shared/schema";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  scheduled: "bg-primary/10 text-primary",
  published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-destructive/10 text-destructive",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${statusColors[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function PlatformIcons({ platforms }: { platforms: string | null }) {
  if (!platforms) return null;
  let parsed: string[] = [];
  try {
    parsed = JSON.parse(platforms);
  } catch {
    return null;
  }
  return (
    <div className="flex gap-1">
      {parsed.includes("instagram") && <Instagram className="h-3.5 w-3.5 text-muted-foreground" />}
      {parsed.includes("facebook") && <Facebook className="h-3.5 w-3.5 text-muted-foreground" />}
      {parsed.includes("tiktok") && <Video className="h-3.5 w-3.5 text-muted-foreground" />}
    </div>
  );
}

const statusTabs = ["all", "draft", "queued", "scheduled", "published"];
const postTypes = ["all", "inventory", "promo", "lifestyle", "announcement"];

export default function Posts({ dealershipFilter }: { dealershipFilter: number | null }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const { toast } = useToast();

  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  const queryParams = new URLSearchParams();
  if (dealershipFilter) queryParams.set("dealershipId", dealershipFilter.toString());
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (typeFilter !== "all") queryParams.set("postType", typeFilter);

  const { data: posts, isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts", queryParams.toString()],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts?${queryParams.toString()}`);
      return res.json();
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
      toast({ title: "Posts approved and scheduled" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Post deleted" });
    },
  });

  const getDealershipName = (id: number) => dealerships?.find((d) => d.id === id)?.name ?? "Unknown";
  const getDealershipColor = (id: number) => dealerships?.find((d) => d.id === id)?.color ?? "#888";

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (!posts) return;
    if (selectedIds.length === posts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(posts.map((p) => p.id));
    }
  };

  const queuedSelected = posts?.filter(
    (p) => selectedIds.includes(p.id) && p.status === "queued"
  );

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold" data-testid="text-posts-title">
            Posts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all social media content
          </p>
        </div>
        <Link href="/posts/new">
          <Button size="sm" data-testid="button-create-post">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            New Post
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {statusTabs.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                statusFilter === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-status-${s}`}
            >
              {s}
            </button>
          ))}
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px] h-8 text-xs" data-testid="select-post-type">
            <SelectValue placeholder="Post Type" />
          </SelectTrigger>
          <SelectContent>
            {postTypes.map((t) => (
              <SelectItem key={t} value={t} className="capitalize text-xs">
                {t === "all" ? "All Types" : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {queuedSelected && queuedSelected.length > 0 && (
          <Button
            size="sm"
            variant="default"
            onClick={() => bulkApproveMutation.mutate(queuedSelected.map((p) => p.id))}
            disabled={bulkApproveMutation.isPending}
            data-testid="button-bulk-approve"
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Approve {queuedSelected.length} Selected
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No posts found matching your filters</p>
            <Link href="/posts/new">
              <Button size="sm" variant="outline" className="mt-3" data-testid="button-create-first-post">
                Create your first post
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.length === posts.length && posts.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Dealership</TableHead>
                  <TableHead>Vehicle / Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platforms</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id} className="hover-elevate" data-testid={`row-post-${post.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(post.id)}
                        onCheckedChange={() => toggleSelect(post.id)}
                        data-testid={`checkbox-post-${post.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getDealershipColor(post.dealershipId) }}
                        />
                        <span className="text-sm font-medium">
                          {getDealershipName(post.dealershipId)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{post.vehicleInfo || "--"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs capitalize text-muted-foreground">{post.postType}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={post.status} />
                    </TableCell>
                    <TableCell>
                      <PlatformIcons platforms={post.platforms} />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {post.scheduledFor
                          ? new Date(post.scheduledFor).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "--"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`button-actions-${post.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/posts/${post.id}`}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(post.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

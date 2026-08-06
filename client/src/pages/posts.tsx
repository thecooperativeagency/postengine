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
import { PageHeader, PageShell } from "@/components/page-shell";
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

function parsePlatforms(platforms: string | null) {
  if (!platforms) return [] as string[];
  try {
    return JSON.parse(platforms) as string[];
  } catch {
    return [] as string[];
  }
}

function formatSchedule(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPostType(value: string) {
  return value?.replace(/-/g, " ") || "General";
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
  const activeFilters = [
    dealershipFilter ? `Store: ${getDealershipName(dealershipFilter)}` : null,
    statusFilter !== "all" ? `Status: ${statusFilter}` : null,
    typeFilter !== "all" ? `Type: ${formatPostType(typeFilter)}` : null,
  ].filter(Boolean) as string[];

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
    <PageShell className="max-w-[1280px] space-y-5">
      <PageHeader
        eyebrow="Engine / Post Engine"
        title="Posts"
        description="Manage the live social queue for Post Engine. Filter fast, scan status by client, and jump into edits without leaving the working list."
        actions={
          <Link href="/posts/new">
            <Button data-testid="button-create-post">
              <PlusCircle className="mr-1.5 h-4 w-4" />
              New Post
            </Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Filter the working list</div>
              <div className="flex flex-wrap gap-2">
                {statusTabs.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      statusFilter === s
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`tab-status-${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-full text-xs sm:w-[160px]" data-testid="select-post-type">
                  <SelectValue placeholder="Post Type" />
                </SelectTrigger>
                <SelectContent>
                  {postTypes.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize text-xs">
                      {t === "all" ? "All Types" : formatPostType(t)}
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
                  Approve {queuedSelected.length} selected
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {activeFilters.length > 0 ? activeFilters.map((filter) => (
                <Badge key={filter} variant="outline">{filter}</Badge>
              )) : <Badge variant="outline">All stores · all statuses · all types</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {posts?.length ?? 0} post{posts && posts.length === 1 ? "" : "s"} in view
            </div>
          </div>
        </CardContent>
      </Card>

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
        <div className="space-y-4">
          <div className="grid gap-3 md:hidden">
            {posts.map((post) => {
              const platforms = parsePlatforms(post.platforms);
              return (
                <Card key={post.id} data-testid={`card-post-mobile-${post.id}`}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getDealershipColor(post.dealershipId) }} />
                          <span className="font-medium text-foreground">{getDealershipName(post.dealershipId)}</span>
                        </div>
                        <div className="text-sm font-medium text-foreground">{post.vehicleInfo || "Untitled post"}</div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" data-testid={`button-actions-mobile-${post.id}`}>
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
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(post.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={post.status} />
                      <Badge variant="outline" className="capitalize">{formatPostType(post.postType)}</Badge>
                      <Badge variant="outline">{formatSchedule(post.scheduledFor)}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Platforms</span>
                      {platforms.length > 0 ? platforms.map((platform) => (
                        <Badge key={platform} variant="secondary" className="text-[11px]">
                          {platform === "googlebusiness" ? "GMB" : platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </Badge>
                      )) : <span>None selected</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="hidden md:block">
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
                    <TableHead>Client</TableHead>
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
                        <span className="text-xs capitalize text-muted-foreground">{formatPostType(post.postType)}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={post.status} />
                      </TableCell>
                      <TableCell>
                        <PlatformIcons platforms={post.platforms} />
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatSchedule(post.scheduledFor)}</span>
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
        </div>
      )}
    </PageShell>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  FileText,
  Edit3,
  ClipboardCheck,
  CalendarDays,
  CheckCircle2,
  PlusCircle,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredDealerships = dealershipFilter
    ? data.dealerships.filter((d) => d.id === dealershipFilter)
    : data.dealerships;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of your social content pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/posts/new">
            <Button size="sm" data-testid="button-new-post">
              <PlusCircle className="h-4 w-4 mr-1.5" />
              New Post
            </Button>
          </Link>
          <Link href="/queue">
            <Button size="sm" variant="outline" data-testid="button-review-queue">
              <ClipboardCheck className="h-4 w-4 mr-1.5" />
              Review Queue
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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

      {/* Dealership Cards + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dealership cards */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Dealerships
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
    </div>
  );
}

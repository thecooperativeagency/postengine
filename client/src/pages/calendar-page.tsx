import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Post, Dealership } from "@shared/schema";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage({ dealershipFilter }: { dealershipFilter: number | null }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  const queryParams = new URLSearchParams();
  if (dealershipFilter) queryParams.set("dealershipId", dealershipFilter.toString());

  const { data: allPosts, isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts", "calendar", dealershipFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts?${queryParams.toString()}`);
      return res.json();
    },
  });

  // Group posts by day string
  const postsByDay = useMemo(() => {
    if (!allPosts) return {};
    const map: Record<string, Post[]> = {};
    for (const post of allPosts) {
      const dateStr = post.scheduledFor || post.publishedAt;
      if (!dateStr) continue;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return map;
  }, [allPosts]);

  // Calendar grid calculations
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getDealershipColor = (id: number) => dealerships?.find((d) => d.id === id)?.color ?? "#888";
  const getDealershipName = (id: number) => dealerships?.find((d) => d.id === id)?.name ?? "Unknown";

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedPosts = selectedDay ? postsByDay[selectedDay] || [] : [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold" data-testid="text-calendar-title">
            Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View scheduled and published posts
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display">
                  {MONTHS[month]} {year}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs" data-testid="button-today">
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" onClick={prevMonth} className="h-7 w-7 p-0" data-testid="button-prev-month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={nextMonth} className="h-7 w-7 p-0" data-testid="button-next-month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-20 border-t border-border/50" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayPosts = postsByDay[dayKey] || [];
                  const isToday = dayKey === todayKey;
                  const isSelected = dayKey === selectedDay;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(dayKey === selectedDay ? null : dayKey)}
                      className={`h-20 border-t border-border/50 p-1 text-left transition-colors hover:bg-accent/50 ${
                        isSelected ? "bg-accent" : ""
                      }`}
                      data-testid={`calendar-day-${day}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center text-xs w-6 h-6 rounded-full ${
                          isToday
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-foreground"
                        }`}
                      >
                        {day}
                      </span>
                      {dayPosts.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5 flex-wrap">
                          {dayPosts.slice(0, 3).map((p) => (
                            <span
                              key={p.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: getDealershipColor(p.dealershipId) }}
                            />
                          ))}
                          {dayPosts.length > 3 && (
                            <span className="text-[9px] text-muted-foreground">
                              +{dayPosts.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side panel for selected day */}
        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedDay
                  ? new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "Select a Day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDay ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Click a day to see its posts
                </div>
              ) : selectedPosts.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No posts on this day
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-3 rounded-lg border border-border/50 space-y-1"
                      data-testid={`calendar-post-${post.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: getDealershipColor(post.dealershipId) }}
                        />
                        <span className="text-xs font-medium">
                          {getDealershipName(post.dealershipId)}
                        </span>
                        <Badge variant="secondary" className="text-[10px] ml-auto capitalize">
                          {post.status}
                        </Badge>
                      </div>
                      {post.vehicleInfo && (
                        <p className="text-sm font-medium">{post.vehicleInfo}</p>
                      )}
                      {post.caption && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {post.caption}
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

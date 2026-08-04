import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import {
  Save, Building2, Key, FolderOpen, Instagram, Facebook, Video,
  Calendar, Plus, Trash2, Clock, CheckSquare, Camera, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PageHeader, PageShell } from "@/components/page-shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Dealership, CadenceSetting } from "@shared/schema";

type DriveConfig = {
  account: string;
  parentFolderId: string | null;
  parentFolderName: string | null;
  dealerships: Array<{
    id: number;
    name: string;
    brand: string | null;
    rootFolderId: string;
    folders: Record<string, string>;
  }>;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "M", tuesday: "T", wednesday: "W", thursday: "Th",
  friday: "F", saturday: "Sa", sunday: "Su",
};
const DEFAULT_AUTO_TIME = "10:00 AM";
const FALLBACK_POST_TYPES = ["New Cars", "Pre-Owned Cars", "Service", "Parts & Accessories"];
const IGNORED_FOLDER_NAMES = new Set(["_Archive"]);

function getPostTypeOptions(folders?: Record<string, string>) {
  const folderTypes = folders ? Object.keys(folders).filter((name) => !IGNORED_FOLDER_NAMES.has(name)) : [];
  return folderTypes.length > 0 ? folderTypes : FALLBACK_POST_TYPES;
}


function CadenceRow({ setting, onDelete }: { setting: CadenceSetting; onDelete: () => void }) {
  const days = JSON.parse(setting.daysOfWeek) as string[];
  const platforms = JSON.parse(setting.platforms) as string[];
  const reelsConfigured = Boolean((setting as any).reelsConfigured);
  const reelsEnabled = Boolean((setting as any).reelsEnabled);
  const reelsPerWeek = Number((setting as any).reelsPerWeek || 0);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card/50 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-medium">Cadence Rule</span>
          <Badge variant="secondary" className="text-xs">{setting.postType}</Badge>
          {setting.isActive ? (
            <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">Paused</Badge>
          )}
          {!reelsConfigured ? (
            <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/40">Reels unset</Badge>
          ) : reelsEnabled ? (
            <Badge variant="outline" className="text-xs text-pink-500 border-pink-500/40">
              {reelsPerWeek} Reel{reelsPerWeek === 1 ? "" : "s"}/wk
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">No Reels</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {DAYS.map(day => (
              <span
                key={day}
                className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                  days.includes(day)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {DAY_LABELS[day]}
              </span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {setting.autoTime ? `Auto (${DEFAULT_AUTO_TIME})` : setting.manualTime}
          </span>
          <span className="text-xs text-muted-foreground">
            {setting.postsPerDay}x/day · {platforms.join(", ")}
          </span>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AddCadenceForm({ dealershipId, postTypes, onClose }: { dealershipId: number; postTypes: string[]; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedDays, setSelectedDays] = useState<string[]>(["monday", "wednesday", "friday"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "facebook", "googlebusiness"]);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [autoTime, setAutoTime] = useState(true);
  const [manualTime, setManualTime] = useState("10:00");
  const [postType, setPostType] = useState(postTypes[0] ?? FALLBACK_POST_TYPES[0]);
  const [reelsConfigured, setReelsConfigured] = useState(false);
  const [reelsEnabled, setReelsEnabled] = useState(false);
  const [reelsPerWeek, setReelsPerWeek] = useState(2);

  useEffect(() => {
    if (postTypes.length > 0 && !postTypes.includes(postType)) {
      setPostType(postTypes[0]);
    }
  }, [postType, postTypes]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!reelsConfigured) {
        throw new Error("Confirm your weekly Reels preference before saving.");
      }
      if (reelsEnabled && reelsPerWeek < 1) {
        throw new Error("Set at least 1 Reel per week when Reels are enabled.");
      }
      const res = await apiRequest("POST", "/api/cadence", {
        dealershipId,
        postType,
        daysOfWeek: JSON.stringify(selectedDays),
        postsPerDay,
        autoTime,
        manualTime: autoTime ? null : manualTime,
        platforms: JSON.stringify(selectedPlatforms),
        isActive: true,
        reelsConfigured: true,
        reelsEnabled,
        reelsPerWeek: reelsEnabled ? reelsPerWeek : 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cadence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/engine/reel-health"] });
      toast({ title: "Cadence rule added" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const togglePlatform = (p: string) => {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs mb-1 block">Post Type</Label>
          <Select value={postType} onValueChange={setPostType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {postTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Posts Per Day</Label>
          <Select value={String(postsPerDay)} onValueChange={v => setPostsPerDay(parseInt(v))}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs mb-2 block">Post Days</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                selectedDays.includes(day)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs mb-2 block">Platforms</Label>
        <div className="flex flex-wrap gap-2">
          {["instagram", "facebook", "googlebusiness"].map(p => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                selectedPlatforms.includes(p)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {p === "googlebusiness" ? "GMB" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={`rounded-lg border p-3 space-y-3 ${reelsConfigured ? "border-pink-500/30 bg-pink-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
        <div className="flex items-start gap-2">
          <Video className="h-4 w-4 mt-0.5 text-pink-500" />
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Weekly Reels preference (required)</Label>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Confirm how many good video Reels this rule should post each week. The engine keeps a 2-week inventory floor from that target.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={reelsConfigured}
            onChange={(e) => {
              setReelsConfigured(e.target.checked);
              if (!e.target.checked) {
                setReelsEnabled(false);
              }
            }}
          />
          <span>I set the weekly Reels target for this rule</span>
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="flex items-center gap-3">
            <Switch
              checked={reelsEnabled}
              disabled={!reelsConfigured}
              onCheckedChange={(checked) => {
                setReelsEnabled(checked);
                if (checked && reelsPerWeek < 1) setReelsPerWeek(2);
              }}
            />
            <Label className={`text-xs ${!reelsConfigured ? "text-muted-foreground" : ""}`}>
              {reelsEnabled ? "Post Reels weekly" : "No Reels for this rule"}
            </Label>
          </div>
          {reelsConfigured && reelsEnabled && (
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Reels / week</Label>
              <Select value={String(reelsPerWeek)} onValueChange={(v) => setReelsPerWeek(parseInt(v))}>
                <SelectTrigger className="h-8 w-20 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {!reelsConfigured && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Check the box above before you can save.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="flex items-center gap-3">
          <Switch checked={autoTime} onCheckedChange={setAutoTime} />
          <Label className="text-xs">
            {autoTime
              ? `Auto-schedule (best time: ${DEFAULT_AUTO_TIME})`
              : "Manual time"
            }
          </Label>
        </div>
        {!autoTime && (
          <Input
            type="time"
            value={manualTime}
            onChange={e => setManualTime(e.target.value)}
            className="h-8 w-full text-sm sm:w-32"
          />
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || selectedDays.length === 0 || !reelsConfigured}
        >
          Add Rule
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}


function MediaRequirements({ settings }: { settings: CadenceSetting[] }) {
  if (settings.length === 0) return null;

  const weeklyTotal = settings.reduce((total, s) => {
    const days = JSON.parse(s.daysOfWeek) as string[];
    return total + (days.length * s.postsPerDay);
  }, 0);

  const weeklyReels = settings.reduce((total, s) => {
    if (!(s as any).reelsEnabled) return total;
    return total + Math.max(0, Number((s as any).reelsPerWeek || 0));
  }, 0);
  const reelFloor = weeklyReels * 2;
  const unconfigured = settings.filter((s) => !(s as any).reelsConfigured).length;

  const monthlyTotal = Math.ceil(weeklyTotal * 4.33);

  return (
    <div className="mt-3 p-3 rounded-lg bg-muted/20 border border-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <Camera className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Media Requirements</span>
      </div>
      <div className="space-y-2">
        {settings.map(s => {
          const days = JSON.parse(s.daysOfWeek) as string[];
          const weekly = days.length * s.postsPerDay;
          const monthly = Math.ceil(weekly * 4.33);
          const ruleReels = (s as any).reelsEnabled ? Number((s as any).reelsPerWeek || 0) : 0;
          return (
            <div key={s.id} className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-foreground">{s.postType}</span>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <span className="text-xs"><span className="font-semibold text-foreground">{weekly}</span> <span className="text-muted-foreground">posts/week</span></span>
                <span className="text-xs"><span className="font-semibold text-foreground">{ruleReels}</span> <span className="text-muted-foreground">reels/week</span></span>
                <span className="text-xs"><span className="font-semibold text-foreground">{monthly}</span> <span className="text-muted-foreground">posts/month</span></span>
              </div>
            </div>
          );
        })}
        <div className="pt-2 mt-2 border-t border-muted/30 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">Total needed</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-primary">{weeklyTotal} posts/week</span>
              <span className="text-xs font-bold text-primary">{monthlyTotal} posts/month</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Video className="h-3 w-3 text-pink-500" />
              <span className="text-xs font-semibold text-foreground">Reels floor (2 weeks)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-pink-500">{weeklyReels} reels/week</span>
              <span className="text-xs font-bold text-pink-500">{reelFloor} videos on hand</span>
            </div>
          </div>
          {unconfigured > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {unconfigured} rule{unconfigured === 1 ? "" : "s"} still missing a Reels preference — re-add or update them.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CadenceSection({ dealership, postTypes }: { dealership: Dealership; postTypes: string[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();

  const { data: allCadence } = useQuery<CadenceSetting[]>({
    queryKey: ["/api/cadence"],
  });

  const settings = allCadence?.filter(s => s.dealershipId === dealership.id) ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cadence/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cadence"] });
      toast({ title: "Rule removed" });
    },
  });

  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ backgroundColor: dealership.color }} />
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{dealership.name}</CardTitle>
            <CardDescription className="text-xs">
              {settings.length} cadence rule{settings.length !== 1 ? "s" : ""}
              {postTypes.length > 0 ? ` • ${postTypes.join(", ")}` : ""}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {showAdd && (
          <AddCadenceForm dealershipId={dealership.id} postTypes={postTypes} onClose={() => setShowAdd(false)} />
        )}
        {settings.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground py-2">No cadence rules set. Add one to start scheduling.</p>
        )}
        {settings.map(s => (
          <CadenceRow key={s.id} setting={s} onDelete={() => deleteMutation.mutate(s.id)} />
        ))}
        <MediaRequirements settings={settings} />
      </CardContent>
    </Card>
  );
}

function DealershipCard({ dealership }: { dealership: Dealership }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm({
    defaultValues: {
      name: dealership.name,
      domain: dealership.domain,
      location: dealership.location,
      instagramHandle: dealership.instagramHandle || "",
      facebookPage: dealership.facebookPage || "",
      tiktokHandle: dealership.tiktokHandle || "",
      instagramCta: (dealership as any).instagramCta || (dealership as any).captionTemplate || "",
      facebookCta: (dealership as any).facebookCta || "",
      gmbCta: (dealership as any).gmbCta || "",
      captionSpec: (dealership as any).captionSpec || "",
      hashtagTemplate: (dealership as any).hashtagTemplate || "",
      gmbSpec: (dealership as any).gmbSpec || "",
      facebookLink: (dealership as any).facebookLink || "",
      gmbLink: (dealership as any).gmbLink || "",
    },
  });

  useEffect(() => {
    form.reset({
      name: dealership.name,
      domain: dealership.domain,
      location: dealership.location,
      instagramHandle: dealership.instagramHandle || "",
      facebookPage: dealership.facebookPage || "",
      tiktokHandle: dealership.tiktokHandle || "",
      instagramCta: (dealership as any).instagramCta || (dealership as any).captionTemplate || "",
      facebookCta: (dealership as any).facebookCta || "",
      gmbCta: (dealership as any).gmbCta || "",
      captionSpec: (dealership as any).captionSpec || "",
      hashtagTemplate: (dealership as any).hashtagTemplate || "",
      gmbSpec: (dealership as any).gmbSpec || "",
      facebookLink: (dealership as any).facebookLink || "",
      gmbLink: (dealership as any).gmbLink || "",
    });
  }, [dealership, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/dealerships/${dealership.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealerships"] });
      toast({ title: "Client updated" });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const confirmed = window.confirm(`Delete ${dealership.name}? This removes its posts, cadence rules, and linked settings.`);
      if (!confirmed) return null;
      const res = await apiRequest("DELETE", `/api/dealerships/${dealership.id}`);
      return res.json();
    },
    onSuccess: (result) => {
      if (!result) return;
      queryClient.invalidateQueries({ queryKey: ["/api/dealerships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cadence"] });
      toast({ title: "Client deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="overflow-hidden">
      <div className="h-1" style={{ backgroundColor: dealership.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{dealership.name}</CardTitle>
            <CardDescription className="text-xs">
              {dealership.brand} -- {dealership.location}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              aria-label={`Delete ${dealership.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant={isEditing ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (isEditing) {
                  form.handleSubmit((data) => updateMutation.mutate(data))();
                } else {
                  setIsEditing(true);
                }
              }}
              disabled={updateMutation.isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {isEditing ? "Save" : "Edit"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {isEditing && (
        <CardContent className="pt-0 space-y-3">
          <Form {...form}>
            <form className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField control={form.control} name="domain" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Domain</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Location</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField control={form.control} name="instagramHandle" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><Instagram className="h-3 w-3" /> Instagram</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="facebookPage" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><Facebook className="h-3 w-3" /> Facebook</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tiktokHandle" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs flex items-center gap-1"><Video className="h-3 w-3" /> TikTok</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <FormField control={form.control} name="instagramCta" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Instagram CTA</FormLabel>
                    <FormControl><Textarea {...field} className="min-h-[60px] text-sm" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="facebookCta" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Facebook CTA</FormLabel>
                    <FormControl><Textarea {...field} className="min-h-[60px] text-sm" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="gmbCta" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">GMB CTA</FormLabel>
                    <FormControl><Textarea {...field} className="min-h-[60px] text-sm" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="captionSpec" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Caption Spec</FormLabel>
                  <FormControl><Textarea {...field} className="min-h-[90px] text-sm" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="hashtagTemplate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Hashtag Rules / Default Hashtags</FormLabel>
                  <FormControl><Textarea {...field} className="min-h-[70px] text-sm" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="gmbSpec" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">GMB Spec</FormLabel>
                  <FormControl><Textarea {...field} className="min-h-[80px] text-sm" /></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField control={form.control} name="facebookLink" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Facebook Link</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="gmbLink" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">GMB Link</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </form>
          </Form>
        </CardContent>
      )}
    </Card>
  );
}

function AddAccountCard() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [location, setLocation] = useState("");
  const [color, setColor] = useState("#0F766E");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dealerships", {
        name: name.trim(),
        brand: brand.trim() || name.trim(),
        domain: domain.trim(),
        location: location.trim(),
        color: color.trim() || "#0F766E",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealerships"] });
      toast({ title: "Account created" });
      setName("");
      setBrand("");
      setDomain("");
      setLocation("");
      setColor("#0F766E");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const canSubmit = !!(name.trim() && domain.trim() && location.trim());

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Account
        </CardTitle>
        <CardDescription className="text-xs">
          Create one account at a time so it can be targeted from the post composer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Account Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Cooperative" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="The Cooperative" className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Domain</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="thecooperative.thecoopbrla.com" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Baton Rouge, LA" className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3 sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Accent Color</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#0F766E" className="h-8 w-16 p-1" />
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
            Add Account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: dealerships, isLoading } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  const { data: driveConfig } = useQuery<DriveConfig>({
    queryKey: ["/api/drive/config"],
  });

  const { data: reelHealth } = useQuery<{
    floorWeeks: number;
    totals: {
      weeklyReelTarget: number;
      inventoryFloor: number;
      available: number;
      shortfall: number;
      unconfiguredRules: number;
    };
    dealerships: Array<{
      dealershipId: number;
      dealershipName: string;
      weeklyReelTarget: number;
      inventoryFloor: number;
      available: number;
      shortfall: number;
      unconfiguredRules: number;
      healthy: boolean;
      driveVideosAvailable: number;
      activeVideoPosts: number;
    }>;
  }>({
    queryKey: ["/api/engine/reel-health"],
  });

  const visibleDealerships = dealerships ?? [];
  const visibleDriveDealerships = driveConfig?.dealerships ?? [];

  if (isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </PageShell>
    );
  }

  const pageTitle = "Post Specs";
  const pageEyebrow = "Engine / Post Engine";

  return (
    <PageShell className="max-w-[1100px]">
      <PageHeader
        eyebrow={pageEyebrow}
        title={pageTitle}
        description="Cadence, client instructions, and integrations that shape how Post Engine schedules and writes social content."
      />

      {/* Cadence Manager */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Post Cadence
        </h2>
        <p className="text-xs text-muted-foreground">
          Set how often each content type posts per account. PostEngine will auto-schedule new content based on these rules. Every new rule requires an explicit weekly Reels preference.
        </p>

        {reelHealth && (
          <Card className={reelHealth.totals.shortfall > 0 || reelHealth.totals.unconfiguredRules > 0 ? "border-amber-500/40" : "border-pink-500/20"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Video className="h-4 w-4 text-pink-500" />
                Reels inventory floor
              </CardTitle>
              <CardDescription className="text-xs">
                System floor = weekly Reels target × {reelHealth.floorWeeks} weeks. Counts unused Drive videos plus queued/scheduled video posts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex flex-wrap gap-3 text-xs">
                <span><span className="font-semibold">{reelHealth.totals.weeklyReelTarget}</span> reels/week target</span>
                <span><span className="font-semibold">{reelHealth.totals.inventoryFloor}</span> floor</span>
                <span><span className="font-semibold">{reelHealth.totals.available}</span> available</span>
                <span className={reelHealth.totals.shortfall > 0 ? "text-amber-600 font-semibold" : ""}>
                  {reelHealth.totals.shortfall} short
                </span>
              </div>
              <div className="space-y-1.5">
                {reelHealth.dealerships
                  .filter((d) => d.weeklyReelTarget > 0 || d.unconfiguredRules > 0 || d.available > 0)
                  .map((d) => (
                    <div key={d.dealershipId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{d.dealershipName}</span>
                      <span className="text-muted-foreground">
                        target {d.weeklyReelTarget}/wk · floor {d.inventoryFloor} · avail {d.available}
                        {d.shortfall > 0 ? ` · short ${d.shortfall}` : ""}
                        {d.unconfiguredRules > 0 ? ` · ${d.unconfiguredRules} unset` : ""}
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {visibleDealerships.map((d) => {
            const driveDealer = visibleDriveDealerships.find((dealer) => dealer.id === d.id);
            const postTypes = getPostTypeOptions(driveDealer?.folders);
            return <CadenceSection key={d.id} dealership={d} postTypes={postTypes} />;
          })}
        </div>
      </div>

      <Separator />

      {/* Client Settings */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Clients
        </h2>
        <AddAccountCard />
        <div className="space-y-3">
          {visibleDealerships.map((d) => (
            <DealershipCard key={d.id} dealership={d} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Integrations */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Integrations</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" />
              Zernio API
            </CardTitle>
            <CardDescription className="text-xs">Connected — 12 accounts active across 4 dealerships</CardDescription>
          </CardHeader>
          <CardContent>
            <Input value="[REDACTED]" disabled className="max-w-md font-mono text-xs" />
            <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
              <CheckSquare className="h-3 w-3" /> Connected — Instagram, Facebook, GMB for The Cooperative
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Google Drive
            </CardTitle>
            <CardDescription className="text-xs">Content source folders configured</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="space-y-1">
                <p><span className="font-medium text-foreground">Account:</span> {driveConfig?.account ?? "lance@thecoopbrla.com"}</p>
                <p><span className="font-medium text-foreground">Parent folder:</span> {driveConfig?.parentFolderName ?? "Postengine"}</p>
                {driveConfig?.parentFolderId && (
                  <p className="font-mono text-[11px]">ID: {driveConfig.parentFolderId}</p>
                )}
              </div>
              <div className="space-y-2">
                {visibleDriveDealerships.map((dealer) => {
                  const folderNames = Object.keys(dealer.folders).filter((name) => name !== "_Archive");
                  return (
                    <div key={dealer.id} className="rounded-md border border-border/60 p-2">
                      <p className="font-medium text-foreground">📁 {dealer.name}</p>
                      <p>{folderNames.join(", ")}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

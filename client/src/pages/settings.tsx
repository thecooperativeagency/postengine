import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useState } from "react";
import {
  Save, Building2, Key, FolderOpen, Instagram, Facebook, Video,
  Calendar, Plus, Trash2, Clock, CheckSquare,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Dealership, CadenceSetting } from "@shared/schema";

const POST_TYPES = ["New Cars", "Pre-Owned Cars", "Service", "Parts & Accessories"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "M", tuesday: "T", wednesday: "W", thursday: "Th",
  friday: "F", saturday: "Sa", sunday: "Su",
};

// Best posting times per post type (automotive research)
const BEST_TIMES: Record<string, string> = {
  "New Cars": "10:00 AM",
  "Pre-Owned Cars": "11:00 AM",
  "Service": "8:00 AM",
  "Parts & Accessories": "12:00 PM",
};

function CadenceRow({ setting, onDelete }: { setting: CadenceSetting; onDelete: () => void }) {
  const days = JSON.parse(setting.daysOfWeek) as string[];
  const platforms = JSON.parse(setting.platforms) as string[];

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{setting.postType}</span>
          {setting.isActive ? (
            <Badge variant="outline" className="text-xs text-green-500 border-green-500/30">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">Paused</Badge>
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
            {setting.autoTime ? `Auto (${BEST_TIMES[setting.postType] || "10:00 AM"})` : setting.manualTime}
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

function AddCadenceForm({ dealershipId, onClose }: { dealershipId: number; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedDays, setSelectedDays] = useState<string[]>(["monday", "wednesday", "friday"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "facebook", "googlebusiness"]);
  const [postType, setPostType] = useState(POST_TYPES[0]);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [autoTime, setAutoTime] = useState(true);
  const [manualTime, setManualTime] = useState("10:00");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cadence", {
        dealershipId,
        postType,
        daysOfWeek: JSON.stringify(selectedDays),
        postsPerDay,
        autoTime,
        manualTime: autoTime ? null : manualTime,
        platforms: JSON.stringify(selectedPlatforms),
        isActive: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cadence"] });
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
    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block">Post Type</Label>
          <Select value={postType} onValueChange={setPostType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POST_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
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
        <div className="flex gap-1.5">
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
        <div className="flex gap-2">
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

      <div className="flex items-center gap-3">
        <Switch checked={autoTime} onCheckedChange={setAutoTime} />
        <Label className="text-xs">
          {autoTime
            ? `Auto-schedule (best time: ${BEST_TIMES[postType] || "10:00 AM"})`
            : "Manual time"
          }
        </Label>
        {!autoTime && (
          <Input
            type="time"
            value={manualTime}
            onChange={e => setManualTime(e.target.value)}
            className="h-8 w-32 text-sm"
          />
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || selectedDays.length === 0}>
          Add Rule
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function CadenceSection({ dealership }: { dealership: Dealership }) {
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">{dealership.name}</CardTitle>
            <CardDescription className="text-xs">{settings.length} cadence rule{settings.length !== 1 ? "s" : ""}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {showAdd && (
          <AddCadenceForm dealershipId={dealership.id} onClose={() => setShowAdd(false)} />
        )}
        {settings.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground py-2">No cadence rules set. Add one to start scheduling.</p>
        )}
        {settings.map(s => (
          <CadenceRow key={s.id} setting={s} onDelete={() => deleteMutation.mutate(s.id)} />
        ))}
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
      captionTemplate: dealership.captionTemplate || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/dealerships/${dealership.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealerships"] });
      toast({ title: "Dealership updated" });
      setIsEditing(false);
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
              <FormField control={form.control} name="captionTemplate" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">CTA Template</FormLabel>
                  <FormControl><Textarea {...field} className="min-h-[60px] text-sm" /></FormControl>
                </FormItem>
              )} />
            </form>
          </Form>
        </CardContent>
      )}
    </Card>
  );
}

export default function Settings() {
  const { data: dealerships, isLoading } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[900px]">
      <div>
        <h1 className="text-xl font-display font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage dealerships, cadence, and integrations</p>
      </div>

      {/* Cadence Manager */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Post Cadence
        </h2>
        <p className="text-xs text-muted-foreground">
          Set how often each content type posts per dealership. PostEngine will auto-schedule new content based on these rules.
        </p>
        <div className="space-y-3">
          {dealerships?.map((d) => (
            <CadenceSection key={d.id} dealership={d} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Dealership Settings */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Dealerships
        </h2>
        <div className="space-y-3">
          {dealerships?.map((d) => (
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
            <Input value="sk_a2ea86b0••••••••••••••••••••••••••••••" disabled className="max-w-md font-mono text-xs" />
            <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
              <CheckSquare className="h-3 w-3" /> Connected — Instagram, Facebook, GMB for all 4 dealerships
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
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>📁 Brian Harris BMW — New Cars, Pre-Owned, Service, Parts</p>
              <p>📁 BMW of Jackson — New Cars, Pre-Owned, Service, Parts</p>
              <p>📁 Audi Baton Rouge — New Cars, Pre-Owned, Service, Parts</p>
              <p>📁 Harris Porsche — New Cars, Pre-Owned, Service, Parts</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, Send, CalendarDays, Eye, ImagePlus, Loader2, X, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getDashboardAuthHeaders } from "@/lib/dashboard-auth";
import type { Post, Dealership } from "@shared/schema";
import {
  formatIgCollaboratorInput,
  formatIgUserTagInput,
  IgFieldError,
  parseIgCollaborators,
  parseIgUserTags,
} from "@shared/ig-mentions";
import { Link } from "wouter";
import {
  TIKTOK_CAPTION_MAX,
  TIKTOK_COMMERCIAL_TYPES,
  TIKTOK_DEFAULTS,
  TIKTOK_PRIVACY_LEVELS,
} from "@shared/tiktok";

const formSchema = z.object({
  dealershipId: z.number({ required_error: "Select a dealership" }),
  postType: z.string().min(1),
  vehicleInfo: z.string().optional(),
  caption: z.string().optional(),
  captionFacebook: z.string().optional(),
  captionGmb: z.string().optional(),
  captionTiktok: z.string().optional(),
  tiktokPrivacy: z.string().optional(),
  tiktokAllowComment: z.boolean().optional(),
  tiktokAllowDuet: z.boolean().optional(),
  tiktokAllowStitch: z.boolean().optional(),
  tiktokMadeWithAi: z.boolean().optional(),
  tiktokCommercial: z.string().optional(),
  tiktokCoverMs: z.string().optional(),
  tiktokCoverUrl: z.string().optional(),
  ctaBlock: z.string().optional(),
  platforms: z.array(z.string()).min(1, "Select at least one platform"),
  scheduledFor: z.string().optional(),
  mediaType: z.string().default("image"),
  notes: z.string().optional(),
  igCollaborators: z.string().optional(),
  igUserTags: z.string().optional(),
}).superRefine((data, ctx) => {
  for (const field of ["igCollaborators", "igUserTags"] as const) {
    try {
      if (field === "igCollaborators") parseIgCollaborators(data.igCollaborators ?? "");
      else parseIgUserTags(data.igUserTags ?? "");
    } catch (error) {
      const message = error instanceof IgFieldError ? error.message : "Invalid Instagram username";
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

function readTikTokFormSettings(raw: unknown): Pick<FormValues, "tiktokPrivacy" | "tiktokAllowComment" | "tiktokAllowDuet" | "tiktokAllowStitch" | "tiktokMadeWithAi" | "tiktokCommercial" | "tiktokCoverMs" | "tiktokCoverUrl"> {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = typeof raw === "string" && raw.trim() ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  return {
    tiktokPrivacy: typeof parsed.privacy_level === "string" ? parsed.privacy_level : TIKTOK_DEFAULTS.privacy_level,
    tiktokAllowComment: typeof parsed.allow_comment === "boolean" ? parsed.allow_comment : TIKTOK_DEFAULTS.allow_comment,
    tiktokAllowDuet: typeof parsed.allow_duet === "boolean" ? parsed.allow_duet : TIKTOK_DEFAULTS.allow_duet,
    tiktokAllowStitch: typeof parsed.allow_stitch === "boolean" ? parsed.allow_stitch : TIKTOK_DEFAULTS.allow_stitch,
    tiktokMadeWithAi: typeof parsed.video_made_with_ai === "boolean" ? parsed.video_made_with_ai : TIKTOK_DEFAULTS.video_made_with_ai,
    tiktokCommercial: typeof parsed.commercialContentType === "string" ? parsed.commercialContentType : TIKTOK_DEFAULTS.commercialContentType,
    tiktokCoverMs: parsed.video_cover_timestamp_ms != null ? String(parsed.video_cover_timestamp_ms) : String(TIKTOK_DEFAULTS.video_cover_timestamp_ms),
    tiktokCoverUrl: typeof parsed.video_cover_image_url === "string" ? parsed.video_cover_image_url : "",
  };
}

function tiktokSettingsFromForm(data: FormValues) {
  const coverMs = Number(data.tiktokCoverMs);
  return {
    privacy_level: data.tiktokPrivacy || TIKTOK_DEFAULTS.privacy_level,
    allow_comment: data.tiktokAllowComment !== false,
    allow_duet: data.tiktokAllowDuet !== false,
    allow_stitch: data.tiktokAllowStitch !== false,
    video_made_with_ai: data.tiktokMadeWithAi === true,
    commercialContentType: data.tiktokCommercial || TIKTOK_DEFAULTS.commercialContentType,
    video_cover_timestamp_ms: Number.isFinite(coverMs) && coverMs >= 0 ? Math.round(coverMs) : TIKTOK_DEFAULTS.video_cover_timestamp_ms,
    ...(data.tiktokCoverUrl?.trim() ? { video_cover_image_url: data.tiktokCoverUrl.trim() } : {}),
  };
}

const platformOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "googlebusiness", label: "Google Business" },
  { value: "tiktok", label: "TikTok" },
];

export default function PostForm() {
  const [, navigate] = useLocation();
  const [matchEdit, params] = useRoute("/posts/:id");
  const isEdit = matchEdit && params?.id && params.id !== "new";
  const postId = isEdit ? Number(params.id) : null;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [captionPrompt, setCaptionPrompt] = useState("");
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  const { data: dealerships } = useQuery<Dealership[]>({
    queryKey: ["/api/dealerships"],
  });

  const { data: existingPost, isLoading: postLoading } = useQuery<Post>({
    queryKey: ["/api/posts", postId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${postId}`);
      return res.json();
    },
    enabled: !!postId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dealershipId: undefined as unknown as number,
      postType: "inventory",
      vehicleInfo: "",
      caption: "",
      captionFacebook: "",
      captionGmb: "",
      captionTiktok: "",
      tiktokPrivacy: TIKTOK_DEFAULTS.privacy_level,
      tiktokAllowComment: TIKTOK_DEFAULTS.allow_comment,
      tiktokAllowDuet: TIKTOK_DEFAULTS.allow_duet,
      tiktokAllowStitch: TIKTOK_DEFAULTS.allow_stitch,
      tiktokMadeWithAi: TIKTOK_DEFAULTS.video_made_with_ai,
      tiktokCommercial: TIKTOK_DEFAULTS.commercialContentType,
      tiktokCoverMs: String(TIKTOK_DEFAULTS.video_cover_timestamp_ms),
      tiktokCoverUrl: "",
      ctaBlock: "",
      platforms: ["instagram", "facebook", "googlebusiness"],
      scheduledFor: "",
      mediaType: "image",
      notes: "",
      igCollaborators: "",
      igUserTags: "",
    },
  });

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        if (!base64) reject(new Error(`Could not read ${file.name}`));
        else resolve(base64);
      };
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const uploadMediaFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;
    setIsUploadingMedia(true);
    try {
      const payloadFiles = [];
      for (const file of files) {
        payloadFiles.push({
          filename: file.name,
          mimeType: file.type || undefined,
          contentBase64: await readFileAsBase64(file),
        });
      }
      const res = await fetch("/api/media/upload", {
        method: "POST",
        headers: getDashboardAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ files: payloadFiles }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || body?.message || `Upload failed (${res.status})`);
      }
      const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
      if (urls.length === 0) throw new Error("Upload returned no media URLs");
      setMediaUrls((prev) => {
        const next = [...prev, ...urls];
        if (typeof body.mediaType === "string" && body.mediaType) {
          form.setValue("mediaType", body.mediaType);
        } else if (next.length > 1) {
          form.setValue("mediaType", "carousel");
        }
        return next;
      });
      toast({
        title: urls.length === 1 ? "Media added" : `${urls.length} files added`,
        description: "Attached to this one-off post.",
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload media",
        variant: "destructive",
      });
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const generateCaptionsFromPrompt = async () => {
    const values = form.getValues();
    if (!values.dealershipId) {
      toast({ title: "Pick an account first", variant: "destructive" });
      return;
    }
    const prompt = captionPrompt.trim();
    if (!prompt) {
      toast({ title: "Add a caption prompt", description: "One line is enough — angle, offer, vibe, audience note.", variant: "destructive" });
      return;
    }
    const platforms = (values.platforms || []).filter((p) =>
      ["instagram", "facebook", "googlebusiness", "tiktok"].includes(p),
    );
    if (platforms.length === 0) {
      toast({ title: "Select platforms", description: "AI writes only for the platforms checked under Publishing.", variant: "destructive" });
      return;
    }

    setIsGeneratingCaptions(true);
    try {
      const res = await apiRequest("POST", "/api/captions/generate", {
        dealershipId: values.dealershipId,
        platforms,
        prompt,
        postType: values.postType,
        vehicleInfo: values.vehicleInfo || values.postType,
        mediaType:
          values.mediaType ||
          (mediaUrls.length > 1 ? "carousel" : mediaUrls.some((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) ? "video" : "image"),
        currentCaptions: {
          instagram: values.caption || "",
          facebook: values.captionFacebook || "",
          googlebusiness: values.captionGmb || "",
          tiktok: values.captionTiktok || values.caption || "",
        },
      });
      const body = await res.json();
      const captions = body?.captions || {};
      if (platforms.includes("instagram") && typeof captions.instagram === "string") {
        form.setValue("caption", captions.instagram);
      }
      if (platforms.includes("facebook") && typeof captions.facebook === "string") {
        form.setValue("captionFacebook", captions.facebook);
      }
      if (platforms.includes("googlebusiness") && typeof captions.googlebusiness === "string") {
        form.setValue("captionGmb", captions.googlebusiness);
      }
      if (platforms.includes("tiktok") && typeof captions.tiktok === "string") {
        form.setValue("captionTiktok", captions.tiktok);
      }
      toast({
        title: "Captions drafted",
        description: `Wrote for ${platforms.join(", ")}. Edit anything before saving.`,
      });
    } catch (err) {
      toast({
        title: "Caption generation failed",
        description: err instanceof Error ? err.message : "Could not generate captions",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // When editing, populate form with existing data
  useEffect(() => {
    if (existingPost) {
      let platforms: string[] = [];
      try {
        platforms = JSON.parse(existingPost.platforms || '["instagram","facebook"]');
      } catch {
        platforms = ["instagram", "facebook", "googlebusiness"];
      }
      form.reset({
        dealershipId: existingPost.dealershipId,
        postType: existingPost.postType,
        vehicleInfo: existingPost.vehicleInfo || "",
        caption: existingPost.caption || "",
        captionFacebook: (existingPost as any).captionFacebook || "",
        captionGmb: (existingPost as any).captionGmb || "",
        captionTiktok: (existingPost as any).captionTiktok || "",
        ...readTikTokFormSettings((existingPost as any).tiktokSettings),
        ctaBlock: existingPost.ctaBlock || "",
        platforms,
        scheduledFor: existingPost.scheduledFor
          ? new Date(existingPost.scheduledFor).toISOString().slice(0, 16)
          : "",
        mediaType: existingPost.mediaType || "image",
        notes: existingPost.notes || "",
        igCollaborators: formatIgCollaboratorInput(existingPost.igCollaborators),
        igUserTags: formatIgUserTagInput(existingPost.igUserTags),
      });
      try {
        const parsed = existingPost.mediaUrls ? JSON.parse(existingPost.mediaUrls) : [];
        setMediaUrls(Array.isArray(parsed) ? parsed.filter((u: unknown) => typeof u === "string") : []);
      } catch {
        setMediaUrls([]);
      }
    }
  }, [existingPost, form]);

  // Auto-populate CTA when dealership changes
  const watchDealershipId = form.watch("dealershipId");
  useEffect(() => {
    if (watchDealershipId && dealerships && !isEdit) {
      const d = dealerships.find((d) => d.id === watchDealershipId);
      if (d) {
        form.setValue("ctaBlock", (d as any).instagramCta || (d as any).captionTemplate || "");
      }
    }
  }, [watchDealershipId, dealerships, form, isEdit]);

  const createMutation = useMutation({
    mutationFn: async (data: FormValues & { status: string }) => {
      const payload = {
        ...data,
        platforms: JSON.stringify(data.platforms),
        scheduledFor: data.scheduledFor || null,
        dealershipId: data.dealershipId,
        mediaUrls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
        mediaType:
          data.mediaType ||
          (mediaUrls.length > 1 ? "carousel" : mediaUrls.some((u) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) ? "video" : "image"),
        igCollaborators: data.igCollaborators?.trim() ? data.igCollaborators : null,
        igUserTags: data.igUserTags?.trim() ? data.igUserTags : null,
        captionTiktok: data.captionTiktok?.trim() ? data.captionTiktok : null,
        tiktokSettings: data.platforms.includes("tiktok") ? JSON.stringify(tiktokSettingsFromForm(data)) : null,
        ...(postId ? {} : data.platforms.includes("tiktok") ? { hold: true, holdReason: "TikTok post held until approved" } : {}),
      };
      if (postId) {
        const res = await apiRequest("PATCH", `/api/posts/${postId}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/posts", payload);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: postId ? "Post updated" : "Post created" });
      navigate("/posts");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const onSubmit = (status: string) => {
    form.handleSubmit((data) => {
      if (status === "scheduled" && !data.scheduledFor) {
        toast({ title: "Schedule date required", description: "Pick a date and time before scheduling.", variant: "destructive" });
        return;
      }
      if (data.platforms.includes("tiktok")) {
        const videos = mediaUrls.filter((url) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url));
        if (data.mediaType !== "video" || videos.length !== 1 || mediaUrls.length !== 1) {
          toast({
            title: "TikTok needs one video",
            description: "Attach a single MP4, MOV, or WebM. Images are not posted to TikTok.",
            variant: "destructive",
          });
          return;
        }
      }
      createMutation.mutate({ ...data, status });
    })();
  };

  const watchPlatforms = form.watch("platforms");
  const watchCaptionTiktok = form.watch("captionTiktok");
  const tiktokSelected = (watchPlatforms || []).includes("tiktok");
  const { data: tiktokCreator } = useQuery<{
    privacyLevels?: string[];
    interactionSettings?: {
      allow_comment?: { enabled?: boolean };
      allow_duet?: { enabled?: boolean };
      allow_stitch?: { enabled?: boolean };
    };
  }>({
    queryKey: ["/api/dealerships", watchDealershipId, "tiktok", "creator-info"],
    enabled: tiktokSelected && Number.isInteger(watchDealershipId),
    queryFn: async () => {
      const res = await fetch(`/api/dealerships/${watchDealershipId}/tiktok/creator-info`, {
        headers: getDashboardAuthHeaders(),
      });
      if (!res.ok) return {};
      return res.json();
    },
  });
  const privacyOptions = (tiktokCreator?.privacyLevels?.length
    ? TIKTOK_PRIVACY_LEVELS.filter((level) => tiktokCreator.privacyLevels?.includes(level))
    : [...TIKTOK_PRIVACY_LEVELS]);
  const commentLockedOff = tiktokCreator?.interactionSettings?.allow_comment?.enabled === false;
  const duetLockedOff = tiktokCreator?.interactionSettings?.allow_duet?.enabled === false;
  const stitchLockedOff = tiktokCreator?.interactionSettings?.allow_stitch?.enabled === false;

  if (postLoading && postId) {
    return (
      <div className="p-6 space-y-4 max-w-[1200px]">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[500px]" />
          <Skeleton className="h-[500px]" />
        </div>
      </div>
    );
  }

  const watchCaption = form.watch("caption");
  const watchCaptionFacebook = form.watch("captionFacebook");
  const watchCaptionGmb = form.watch("captionGmb");
  const watchCtaBlock = form.watch("ctaBlock");
  const watchVehicle = form.watch("vehicleInfo");
  const selectedDealership = dealerships?.find((d) => d.id === watchDealershipId);

  const cleanText = (value?: string) => (value || "").trim();
  const stripHashtagLines = (text: string | undefined) => {
    if (!text) return "";
    return text
      .split(/\n+/)
      .filter((part) => !part.trim().startsWith("#"))
      .join("\n\n")
      .trim();
  };
  const joinPreviewParts = (...parts: Array<string | undefined>) =>
    parts.map((part) => cleanText(part)).filter(Boolean).join("\n\n");

  const instagramCta = cleanText(watchCtaBlock || (selectedDealership as any)?.instagramCta || (selectedDealership as any)?.captionTemplate || "");
  const facebookCta = cleanText((selectedDealership as any)?.facebookCta || instagramCta || "");
  const gmbCta = cleanText((selectedDealership as any)?.gmbCta || instagramCta || "");
  const facebookLink = cleanText((selectedDealership as any)?.facebookLink || "");
  const gmbLink = cleanText((selectedDealership as any)?.gmbLink || "");

  const instagramPreview = joinPreviewParts(stripHashtagLines(watchCaption), instagramCta);
  const facebookPreview = joinPreviewParts(stripHashtagLines(watchCaptionFacebook || watchCaption), facebookLink, facebookCta);
  const gmbPreview = joinPreviewParts(stripHashtagLines(watchCaptionGmb), gmbLink, gmbCta);

  return (
    <div className="p-6 space-y-4 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/posts">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-display font-semibold" data-testid="text-form-title">
            {isEdit ? "Edit Post" : "Create New Post"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit ? "Update post details" : "Craft a new social media post"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3">
          <Form {...form}>
            <form className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Post Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dealershipId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account</FormLabel>
                          <Select
                            value={field.value ? field.value.toString() : ""}
                            onValueChange={(val) => field.onChange(val ? Number(val) : undefined)}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-dealership">
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {dealerships?.map((d) => (
                                <SelectItem key={d.id} value={d.id.toString()}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="w-2 h-2 rounded-full inline-block"
                                      style={{ backgroundColor: d.color }}
                                    />
                                    {d.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="postType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Post Type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-post-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="inventory">Inventory</SelectItem>
                              <SelectItem value="promo">Promo</SelectItem>
                              <SelectItem value="lifestyle">Lifestyle</SelectItem>
                              <SelectItem value="announcement">Announcement</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="vehicleInfo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle / Subject</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 2026 BMW X5 M60" {...field} data-testid="input-vehicle-info" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Media</div>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsDragActive(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsDragActive(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsDragActive(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsDragActive(false);
                        void uploadMediaFiles(event.dataTransfer.files);
                      }}
                      className={`rounded-lg border border-dashed px-4 py-6 text-center transition-colors cursor-pointer ${
                        isDragActive
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
                      }`}
                      data-testid="media-dropzone"
                    >
                      <div className="flex flex-col items-center gap-2">
                        {isUploadingMedia ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : (
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        )}
                        <div className="text-sm font-medium">
                          {isUploadingMedia ? "Uploading…" : "Drop image or video here"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          One-off posts · click to browse · jpg/png/webp/gif/mp4/mov
                        </div>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.m4v"
                        multiple
                        className="hidden"
                        data-testid="input-media-file"
                        onChange={(event) => {
                          if (event.target.files) void uploadMediaFiles(event.target.files);
                        }}
                      />
                    </div>

                    {mediaUrls.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="media-preview-grid">
                        {mediaUrls.map((url) => {
                          const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
                          return (
                            <div key={url} className="relative group rounded-md border overflow-hidden bg-muted/30 aspect-square">
                              {isVideo ? (
                                <video src={url} className="h-full w-full object-cover" muted playsInline />
                              ) : (
                                <img src={url} alt="Upload preview" className="h-full w-full object-cover" />
                              )}
                              <button
                                type="button"
                                className="absolute top-1.5 right-1.5 rounded-full bg-background/90 border p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMediaUrls((prev) => prev.filter((item) => item !== url));
                                }}
                                data-testid="button-remove-media"
                                aria-label="Remove media"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-muted/15 p-3 space-y-2" data-testid="caption-prompt-panel">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">AI caption prompt</div>
                        <div className="text-xs text-muted-foreground">
                          Optional. Writes only for platforms checked under Publishing — each platform gets its own voice.
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={isGeneratingCaptions || isUploadingMedia}
                        onClick={() => void generateCaptionsFromPrompt()}
                        data-testid="button-generate-captions"
                      >
                        {isGeneratingCaptions ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1.5" />
                        )}
                        {isGeneratingCaptions ? "Writing…" : "Generate captions"}
                      </Button>
                    </div>
                    <Textarea
                      value={captionPrompt}
                      onChange={(event) => setCaptionPrompt(event.target.value)}
                      placeholder="e.g. White Cayenne on the lot at dusk — premium, quiet confidence, no hard sell"
                      className="min-h-[72px] resize-y bg-background"
                      data-testid="textarea-caption-prompt"
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="caption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Caption
                          <span className="text-xs text-muted-foreground ml-2">
                            (manual or AI · {field.value?.split(/\s+/).filter(Boolean).length || 0} words)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Write a compelling caption..."
                            className="min-h-[100px] resize-y"
                            {...field}
                            data-testid="textarea-caption"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="captionFacebook"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Facebook Caption
                          <span className="text-xs text-muted-foreground ml-2">
                            (used when Facebook needs a separate caption)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Optional Facebook-specific caption..."
                            className="min-h-[80px] resize-y"
                            {...field}
                            data-testid="textarea-caption-facebook"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="captionGmb"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Google Business Caption
                          <span className="text-xs text-muted-foreground ml-2">
                            (professional, no hashtags, max 250 chars)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Professional GMB update caption..."
                            className="min-h-[80px] resize-y"
                            {...field}
                            data-testid="textarea-caption-gmb"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="ctaBlock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CTA Block</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Call to action text..."
                            className="min-h-[80px] resize-y"
                            {...field}
                            data-testid="textarea-cta"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Publishing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="platforms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platforms</FormLabel>
                        <div className="flex gap-4">
                          {platformOptions.map((p) => (
                            <label key={p.value} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={field.value.includes(p.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    field.onChange([...field.value, p.value]);
                                  } else {
                                    field.onChange(field.value.filter((v: string) => v !== p.value));
                                  }
                                }}
                                data-testid={`checkbox-platform-${p.value}`}
                              />
                              {p.label}
                            </label>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="igCollaborators"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instagram collaborators</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="username_one, username_two"
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-ig-collaborators"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Comma-separated usernames. Maximum 3.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="igUserTags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instagram user tags</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="username_one, username_two"
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-ig-user-tags"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Comma-separated usernames to tag on the post.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="scheduledFor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Schedule Date/Time</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} data-testid="input-schedule-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="mediaType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Media Type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-media-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="image">Image</SelectItem>
                              <SelectItem value="video">Video</SelectItem>
                              <SelectItem value="carousel">Carousel</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {tiktokSelected && (
                    <div className="space-y-4 rounded-lg border p-3" data-testid="panel-tiktok">
                      <div>
                        <p className="text-sm font-medium">TikTok</p>
                        <p className="text-xs text-muted-foreground">
                          Saved on hold. Nothing posts until the post is approved and TikTok publishing is turned on.
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="captionTiktok"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>TikTok caption</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="TikTok caption. Hashtags stay. The Instagram link-in-bio line is not added."
                                className="min-h-[100px] resize-y"
                                {...field}
                                value={field.value ?? ""}
                                data-testid="textarea-caption-tiktok"
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              {(watchCaptionTiktok || "").length}/{TIKTOK_CAPTION_MAX}
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tiktokPrivacy"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Privacy</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-tiktok-privacy">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {privacyOptions.map((level) => (
                                  <SelectItem key={level} value={level}>{level}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <div className="flex flex-wrap gap-4">
                        <FormField
                          control={form.control}
                          name="tiktokAllowComment"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={commentLockedOff ? false : field.value !== false}
                                disabled={commentLockedOff}
                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                data-testid="checkbox-tiktok-comments"
                              />
                              Allow comments
                            </label>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tiktokAllowDuet"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={duetLockedOff ? false : field.value !== false}
                                disabled={duetLockedOff}
                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                data-testid="checkbox-tiktok-duet"
                              />
                              Allow duet
                            </label>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tiktokAllowStitch"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={stitchLockedOff ? false : field.value !== false}
                                disabled={stitchLockedOff}
                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                data-testid="checkbox-tiktok-stitch"
                              />
                              Allow stitch
                            </label>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tiktokMadeWithAi"
                          render={({ field }) => (
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={field.value === true}
                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                data-testid="checkbox-tiktok-ai"
                              />
                              Made with AI
                            </label>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="tiktokCommercial"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Commercial disclosure</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-tiktok-commercial">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TIKTOK_COMMERCIAL_TYPES.map((value) => (
                                  <SelectItem key={value} value={value}>{value}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="tiktokCoverMs"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cover frame (ms)</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} data-testid="input-tiktok-cover-ms" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="tiktokCoverUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cover image URL</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value ?? ""} placeholder="https://" data-testid="input-tiktok-cover-url" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (internal)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any internal notes..."
                            className="min-h-[60px] resize-y"
                            {...field}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onSubmit("draft")}
                  disabled={createMutation.isPending || isUploadingMedia || isGeneratingCaptions}
                  data-testid="button-save-draft"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSubmit("queued")}
                  disabled={createMutation.isPending || isUploadingMedia || isGeneratingCaptions}
                  data-testid="button-queue-review"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Queue for Review
                </Button>
                <Button
                  type="button"
                  onClick={() => onSubmit("scheduled")}
                  disabled={createMutation.isPending || isUploadingMedia || isGeneratingCaptions}
                  data-testid="button-schedule"
                >
                  <CalendarDays className="h-4 w-4 mr-1.5" />
                  Schedule
                </Button>
              </div>
            </form>
          </Form>
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-2">
          <div className="sticky top-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Platform Previews
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedDealership && (
                  <div className="flex items-center gap-2 pb-3 border-b">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedDealership.color }}
                    />
                    <span className="text-sm font-medium">{selectedDealership.name}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {selectedDealership.brand}
                    </Badge>
                  </div>
                )}

                {mediaUrls.length > 0 && (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="text-xs font-semibold">Media</div>
                    <div className="grid grid-cols-2 gap-2">
                      {mediaUrls.slice(0, 4).map((url) => {
                        const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
                        return isVideo ? (
                          <video key={url} src={url} className="rounded-md aspect-square object-cover w-full bg-muted" muted playsInline />
                        ) : (
                          <img key={url} src={url} alt="" className="rounded-md aspect-square object-cover w-full bg-muted" />
                        );
                      })}
                    </div>
                  </div>
                )}

                {(watchCaption || watchCaptionGmb || watchVehicle || mediaUrls.length > 0) ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-xs font-semibold">Instagram Preview</div>
                      {instagramPreview && (
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-preview-instagram-caption">
                          {instagramPreview}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-xs font-semibold">Facebook Preview</div>
                      {facebookPreview && (
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-preview-facebook-caption">
                          {facebookPreview}
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-xs font-semibold">Google Business Preview</div>
                      {gmbPreview && (
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-preview-gmb-caption">
                          {gmbPreview}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Start typing to see a preview
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

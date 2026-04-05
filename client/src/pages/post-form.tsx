import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, Send, CalendarDays, Eye } from "lucide-react";
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
import type { Post, Dealership } from "@shared/schema";
import { Link } from "wouter";

const formSchema = z.object({
  dealershipId: z.number({ required_error: "Select a dealership" }),
  postType: z.string().min(1),
  vehicleInfo: z.string().optional(),
  caption: z.string().optional(),
  captionGmb: z.string().optional(),
  hashtags: z.string().optional(),
  ctaBlock: z.string().optional(),
  platforms: z.array(z.string()).min(1, "Select at least one platform"),
  scheduledFor: z.string().optional(),
  mediaType: z.string().default("image"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const platformOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "googlebusiness", label: "Google Business" },
  { value: "tiktok", label: "TikTok" },
];

export default function PostForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/posts/new");
  const [matchEdit, params] = useRoute("/posts/:id");
  const isEdit = matchEdit && params?.id && params.id !== "new";
  const postId = isEdit ? Number(params.id) : null;
  const { toast } = useToast();

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
      dealershipId: 0,
      postType: "inventory",
      vehicleInfo: "",
      caption: "",
      hashtags: "",
      ctaBlock: "",
      platforms: ["instagram", "facebook", "googlebusiness"],
      scheduledFor: "",
      mediaType: "image",
      notes: "",
    },
  });

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
        captionGmb: (existingPost as any).captionGmb || "",
        hashtags: existingPost.hashtags || "",
        ctaBlock: existingPost.ctaBlock || "",
        platforms,
        scheduledFor: existingPost.scheduledFor
          ? new Date(existingPost.scheduledFor).toISOString().slice(0, 16)
          : "",
        mediaType: existingPost.mediaType || "image",
        notes: existingPost.notes || "",
      });
    }
  }, [existingPost, form]);

  // Auto-populate CTA when dealership changes
  const watchDealershipId = form.watch("dealershipId");
  useEffect(() => {
    if (watchDealershipId && dealerships && !isEdit) {
      const d = dealerships.find((d) => d.id === watchDealershipId);
      if (d?.captionTemplate) {
        form.setValue("ctaBlock", d.captionTemplate);
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
      createMutation.mutate({ ...data, status });
    })();
  };

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
  const watchHashtags = form.watch("hashtags");
  const watchCtaBlock = form.watch("ctaBlock");
  const watchVehicle = form.watch("vehicleInfo");
  const selectedDealership = dealerships?.find((d) => d.id === watchDealershipId);

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
                          <FormLabel>Dealership</FormLabel>
                          <Select
                            value={field.value?.toString()}
                            onValueChange={(val) => field.onChange(Number(val))}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-dealership">
                                <SelectValue placeholder="Select dealership" />
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

                  <FormField
                    control={form.control}
                    name="caption"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Caption
                          <span className="text-xs text-muted-foreground ml-2">
                            ({field.value?.split(/\s+/).filter(Boolean).length || 0} words)
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
                    name="hashtags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hashtags</FormLabel>
                        <FormControl>
                          <Input placeholder="#BMW #LuxurySUV #BatonRouge ..." {...field} data-testid="input-hashtags" />
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
                  disabled={createMutation.isPending}
                  data-testid="button-save-draft"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onSubmit("queued")}
                  disabled={createMutation.isPending}
                  data-testid="button-queue-review"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Queue for Review
                </Button>
                <Button
                  type="button"
                  onClick={() => onSubmit("scheduled")}
                  disabled={createMutation.isPending}
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
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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

                {watchVehicle && (
                  <p className="text-sm font-medium" data-testid="text-preview-vehicle">
                    {watchVehicle}
                  </p>
                )}

                {watchCaption && (
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-preview-caption">
                    {watchCaption}
                  </p>
                )}

                {watchHashtags && (
                  <p className="text-xs text-primary" data-testid="text-preview-hashtags">
                    {watchHashtags}
                  </p>
                )}

                {watchCtaBlock && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap" data-testid="text-preview-cta">
                      {watchCtaBlock}
                    </p>
                  </div>
                )}

                {!watchCaption && !watchVehicle && (
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

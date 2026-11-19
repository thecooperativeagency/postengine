import { readIgCollaborators, readIgUserTags, type IgUserTag } from "@shared/ig-mentions";

export interface ZernioPostPayloadInput {
  content: string;
  accountId: string;
  platform: string;
  mediaUrls?: string[];
  mediaType?: string;
  scheduledAt?: string;
  now?: Date;
  igCollaborators?: unknown;
  igUserTags?: unknown;
  tiktokSettings?: Record<string, unknown>;
  dryRun?: boolean;
}

/**
 * Build the Zernio create-post body.
 * Instagram Reels omit contentType: Zernio documents that value only as "story",
 * and a single video publishes as a Reel when contentType is left off.
 * collaborators and userTags are attached to the Instagram entry only.
 */
export function buildZernioPostBody(input: ZernioPostPayloadInput): Record<string, unknown> {
  const urls = input.mediaUrls || [];
  const isSingleVideo = input.mediaType === "video" && urls.length <= 1;
  const platformEntry: Record<string, unknown> = {
    accountId: input.accountId,
    platform: input.platform,
  };

  const specific: Record<string, unknown> = {};
  if (input.platform === "instagram" && isSingleVideo) {
    specific.shareToFeed = true;
  }
  if (input.platform === "instagram") {
    const collaborators = readIgCollaborators(input.igCollaborators);
    const userTags = readIgUserTags(input.igUserTags);
    if (collaborators?.length) specific.collaborators = collaborators.slice(0, 3);
    if (userTags?.length) specific.userTags = userTags.map((tag: IgUserTag) => ({ username: tag.username }));
  }
  if (Object.keys(specific).length > 0) {
    platformEntry.platformSpecificData = specific;
  }

  const body: Record<string, unknown> = {
    content: input.content,
    platforms: [platformEntry],
  };

  if (urls.length > 0) {
    const mediaItems = urls.map((url) => ({
      url,
      type: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? "video" : "image",
    }));
    if ((isSingleVideo || input.platform === "tiktok") && mediaItems.length === 1 && mediaItems[0].type !== "video") {
      mediaItems[0].type = "video";
    }
    body.mediaItems = mediaItems;
  }

  if (input.platform === "tiktok") {
    // Approval in PostEngine is the preview-and-consent act. These two flags
    // are required by TikTok and are not stored or overridable on the post.
    const settings: Record<string, unknown> = { ...(input.tiktokSettings || {}) };
    if (settings.draft !== true) delete settings.draft;
    settings.content_preview_confirmed = true;
    settings.express_consent_given = true;
    body.tiktokSettings = settings;
    if (input.dryRun === true) body.dryRun = true;
  }

  const now = input.now ?? new Date();
  const scheduleTime = input.scheduledAt ? new Date(input.scheduledAt) : new Date(now.getTime() + 2 * 60 * 1000);
  const finalSchedule = scheduleTime < now ? new Date(now.getTime() + 2 * 60 * 1000) : scheduleTime;
  body.scheduledFor = finalSchedule.toISOString();

  return body;
}

export function collectDroppedCollaborators(data: unknown): unknown[] | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, any>;
  const found: unknown[] = [];
  const take = (value: unknown) => {
    if (Array.isArray(value) && value.length > 0) found.push(...value);
  };
  const fromPlatforms = (entry: any) => {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.platforms)) return;
    for (const platform of entry.platforms) {
      const fromSpecific = platform?.platformSpecificData?.droppedCollaborators;
      if (Array.isArray(fromSpecific) && fromSpecific.length > 0) take(fromSpecific);
      else take(platform?.droppedCollaborators);
    }
  };
  fromPlatforms(root);
  fromPlatforms(root.post);
  if (found.length === 0) {
    take(root.droppedCollaborators);
    take(root.post?.droppedCollaborators);
  }
  return found.length > 0 ? found : null;
}

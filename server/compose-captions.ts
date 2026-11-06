import { cleanText, stripHashtagLines, joinParts } from "./post-sanitizer";

export interface ComposedPostContent {
  instagram: string;
  facebook: string;
  googlebusiness: string;
}

export function isCaptionExact(post: { captionExact?: unknown; caption_exact?: unknown } | null | undefined): boolean {
  const value = post?.captionExact ?? post?.caption_exact;
  return value === true || value === 1 || value === "1" || value === "true";
}

function rawCaption(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  const text = String(value);
  return text.length > 0 ? text : fallback;
}

export function composePostContentFrom(
  post: any,
  dealership?: any,
): ComposedPostContent {
  const caption = rawCaption(post?.caption);

  if (isCaptionExact(post)) {
    return {
      instagram: caption,
      facebook: rawCaption(post?.captionFacebook, caption),
      googlebusiness: rawCaption(post?.captionGmb, caption),
    };
  }

  const instagramCaption = stripHashtagLines(post?.caption);
  const facebookCaption = stripHashtagLines(post?.captionFacebook || post?.caption);
  const gmbCaption = stripHashtagLines(post?.captionGmb);

  const instagramCta = cleanText(post?.ctaBlock || dealership?.instagramCta || dealership?.captionTemplate || "");
  const facebookCta = cleanText(dealership?.facebookCta || instagramCta);
  const gmbCta = cleanText(dealership?.gmbCta || instagramCta);
  const facebookLink = cleanText(dealership?.facebookLink || "");
  const gmbLink = cleanText(dealership?.gmbLink || "");

  return {
    instagram: joinParts(instagramCaption, instagramCta),
    facebook: joinParts(facebookCaption, facebookLink, facebookCta),
    googlebusiness: joinParts(gmbCaption, gmbLink, gmbCta),
  };
}

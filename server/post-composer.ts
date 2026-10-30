import { storage } from "./storage";
import { cleanText, stripHashtagLines, joinParts } from "./post-sanitizer";

export interface ComposedPostContent {
  instagram: string;
  facebook: string;
  googlebusiness: string;
}

export function composePostContent(post: any, dealership?: any): ComposedPostContent {
  const dealer = dealership || storage.getDealership(post.dealershipId);

  const instagramCaption = stripHashtagLines(post.caption);
  const facebookCaption = stripHashtagLines(post.captionFacebook || post.caption);
  const gmbCaption = stripHashtagLines(post.captionGmb);

  const instagramCta = cleanText(post.ctaBlock || dealer?.instagramCta || dealer?.captionTemplate || "");
  const facebookCta = cleanText(dealer?.facebookCta || instagramCta);
  const gmbCta = cleanText(dealer?.gmbCta || instagramCta);
  const facebookLink = cleanText(dealer?.facebookLink || "");
  const gmbLink = cleanText(dealer?.gmbLink || "");

  return {
    instagram: joinParts(instagramCaption, instagramCta),
    facebook: joinParts(facebookCaption, facebookLink, facebookCta),
    googlebusiness: joinParts(gmbCaption, gmbLink, gmbCta),
  };
}

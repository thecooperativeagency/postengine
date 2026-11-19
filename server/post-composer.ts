import { storage } from "./storage";
import { composePostContentFrom, type ComposedPostContent } from "./compose-captions";

export type { ComposedPostContent };

export function composePostContent(post: any, dealership?: any): ComposedPostContent {
  const dealer = dealership || storage.getDealership(post.dealershipId);
  return composePostContentFrom(post, dealer);
}

export { composePostContentFrom, isCaptionExact } from "./compose-captions";

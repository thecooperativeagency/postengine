/**
 * AutoCaption Writer — PostEngine
 * Providers and prompts follow the archive caption writer
 * (a5b1cb2d server/caption-writer.ts).
 * The API key is CAPTION_API_KEY only. There is no Hermes/Nous local lookup.
 * A missing key or a failed call returns a template.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export type CaptionProvider = "openai" | "github-models" | "nous" | "openai-compatible" | "fallback";

export interface CaptionRequest {
  dealershipName: string;
  brand: string;
  postType: string;
  vehicleInfo: string;
  platform: string;
  tone?: string;
  captionSpec?: string | null;
  gmbSpec?: string | null;
  rewriteDirection?: string | null;
  currentCaption?: string | null;
  talkingPoints?: string | null;
}

export interface CaptionRuntime {
  provider: CaptionProvider;
  model: string | null;
  apiKey: string | null;
  endpoint: string | null;
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";
const NOUS_ENDPOINT = "https://inference-api.nousresearch.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_GITHUB_MODEL = "gpt-4o-mini";
const DEFAULT_NOUS_MODEL = "anthropic/claude-haiku-4.5";
/** Cloudflare blocks bare Node fetch without a browser-like UA (error 1010). */
const CAPTION_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PostEngineCaption/1.0";
let captionQueue: Promise<unknown> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueCaptionTask<T>(task: () => Promise<T>): Promise<T> {
  const next = captionQueue.then(task, task);
  captionQueue = next.then(() => undefined, () => undefined);
  return next;
}

function parseRetryDelayMs(message: string): number {
  const secondsMatch = message.match(/wait\s+(\d+)\s+seconds?/i);
  if (secondsMatch) return Math.max(Number(secondsMatch[1]) * 1000, 1000);
  if (/rate limit/i.test(message)) return 15000;
  if (/secure TLS connection was established/i.test(message) || /fetch failed/i.test(message)) return 5000;
  return 0;
}

function isRetryableCaptionError(message: string): boolean {
  return /rate limit/i.test(message) || /fetch failed/i.test(message) || /secure TLS connection was established/i.test(message);
}

function readEnvValue(key: string): string {
  return process.env[key]?.trim() || "";
}

function loadBrandRules(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "notes", "brand-caption-rules.md"), "utf-8");
  } catch {
    return "";
  }
}

function buildSystemPrompt(brand: string, dealershipName: string, captionSpec?: string | null, gmbSpec?: string | null, platform?: string): string {
  const brandRules = loadBrandRules();
  const dealershipRules = captionSpec ? `\nDealership-specific rules:\n${captionSpec}\n` : "";
  const gmbRules = gmbSpec ? `\nGMB-specific rules:\n${gmbSpec}\n` : "";
  const platformName =
    platform === "googlebusiness" ? "Google Business Profile" :
    platform === "facebook" ? "Facebook" :
    platform === "instagram" ? "Instagram" :
    "social";

  return `Write ONE snappy, punchy caption for ${platformName} only. You are the brand manager for ${brand}, writing for ${dealershipName}.

Length:
- Instagram/Facebook: max about two short lines / ~12-28 words
- Google Business: max 220 characters

Use these supporting rules:
${brandRules}
${dealershipRules}${gmbRules}

Hard rules:
- Return the final caption text only.
- Do NOT label platforms.
- Do NOT include Instagram/Facebook/GMB sections in one response.
- Do NOT use markdown headings, bold markers, or bullet labels.
- Never include camera serials, frame numbers, or dump codes (e.g. 33A9398, IMG_1234, DSC0123, UUID tails).
- No hashtags.
- No emoji.
- No quotation marks around the caption.
- No fake hype.
- No generic luxury filler.
- Never invent specs.`;
}

function buildUserPrompt(req: CaptionRequest): string {
  const toneStr = req.tone || "punchy";
  const isGMB = req.platform === "googlebusiness";
  const normalizedVehicleInfo = req.vehicleInfo.toLowerCase();
  const isPorscheLifestyle = req.brand === "Porsche" && (
    normalizedVehicleInfo.includes("porschelifestyle") ||
    normalizedVehicleInfo.includes("lifestyle") ||
    normalizedVehicleInfo.includes("rexy") ||
    normalizedVehicleInfo.includes("1948") ||
    normalizedVehicleInfo.includes("collection")
  );

  const typeContext: Record<string, string> = {
    "New Cars": "new vehicle available now",
    "Pre-Owned Cars": "pre-owned vehicle available",
    "Service": "service department promotion",
    "Parts & Accessories": "parts and accessories",
    "Lifestyle": "lifestyle collection, apparel, merchandise, or branded accessories",
    "Customer Media": "new customer delivery / welcome to the family moment — warm, genuine, dealership pride. Name the customer when present. Do not invent vehicle details not in the subject line.",
    "Customer Delivery": "new customer delivery / welcome to the family moment — warm, genuine, dealership pride. Name the customer when present. Do not invent vehicle details not in the subject line.",
    "Reels": "short-form vertical video reel — write like a reel caption, not a brochure",
  };

  const context = isPorscheLifestyle
    ? "Porsche Lifestyle collection for the owner: apparel, hats, bags, merch, and branded lifestyle accessories. This is not a car parts post. Do not mention vehicle upgrades, service parts, performance parts, OEM parts, or engineering components. Write about clothing, personal accessories, giftable merch, and brand lifestyle appeal."
    : (typeContext[req.postType] || req.postType);

  const direction = (req.rewriteDirection || "").trim();
  const current = (req.currentCaption || "").trim();
  const talking = (req.talkingPoints || "").trim();
  const rewriteBlock = direction
    ? `\n\nREWRITE DIRECTION FROM OPERATOR (follow this closely):\n${direction}${current ? `\n\nCURRENT CAPTION TO REWRITE:\n${current}` : ""}\n\nRewrite a fresh caption that keeps the same vehicle/subject but applies the operator direction. Do not reuse the old wording unless it still fits.`
    : "";
  const talkingBlock = talking
    ? `\n\nWEEKLY TALKING POINTS / OFFERS (from operator — weave in naturally when relevant to this vehicle/post type; do not force every point into every caption; never invent pricing or terms not listed):\n${talking}`
    : "";

  if (isGMB) {
    return `Write ONE Google Business caption only for: ${req.vehicleInfo} — ${context}. Max 220 characters. No hashtags. No @ mentions. No CTA link. Professional luxury tone only.${req.gmbSpec ? ` Follow these dealership GMB rules: ${req.gmbSpec}` : ""}${talkingBlock}${rewriteBlock}`;
  }

  return `Write ONE ${req.platform} caption only for: ${req.vehicleInfo} — ${context}. Tone: ${toneStr}.${req.captionSpec ? ` Dealership caption rules: ${req.captionSpec}` : ""}${talkingBlock}${rewriteBlock}`;
}

function normalizeProvider(raw: string): CaptionProvider | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === "openai") return "openai";
  if (value === "github-models" || value === "github_models" || value === "github") return "github-models";
  if (value === "nous" || value === "nous-portal" || value === "nous_portal") return "nous";
  if (value === "openai-compatible" || value === "openai_compatible" || value === "compatible") return "openai-compatible";
  if (value === "fallback") return "fallback";
  return null;
}

function getCaptionApiKey(): string {
  return readEnvValue("CAPTION_API_KEY");
}

function getCompatibleEndpoint(): string {
  const base = readEnvValue("CAPTION_BASE_URL") || "https://inference-api.nousresearch.com/v1";
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function getConfiguredModel(provider: Exclude<CaptionProvider, "fallback">): string {
  const shared = readEnvValue("CAPTION_MODEL");
  if (shared) return shared;
  if (provider === "github-models") return DEFAULT_GITHUB_MODEL;
  if (provider === "openai") return DEFAULT_OPENAI_MODEL;
  return DEFAULT_NOUS_MODEL;
}

export function resolveCaptionRuntime(): CaptionRuntime {
  const requested = normalizeProvider(readEnvValue("CAPTION_PROVIDER")) || "nous";
  const apiKey = getCaptionApiKey();
  if (requested === "fallback" || !apiKey) {
    return { provider: "fallback", model: null, apiKey: null, endpoint: null };
  }

  if (requested === "openai-compatible") {
    return {
      provider: "openai-compatible",
      model: getConfiguredModel("openai-compatible"),
      apiKey,
      endpoint: getCompatibleEndpoint(),
    };
  }

  if (requested === "github-models") {
    return {
      provider: "github-models",
      model: getConfiguredModel("github-models"),
      apiKey,
      endpoint: GITHUB_MODELS_ENDPOINT,
    };
  }

  if (requested === "openai") {
    return {
      provider: "openai",
      model: getConfiguredModel("openai"),
      apiKey,
      endpoint: OPENAI_ENDPOINT,
    };
  }

  return {
    provider: "nous",
    model: getConfiguredModel("nous"),
    apiKey,
    endpoint: NOUS_ENDPOINT,
  };
}

async function requestCaption(runtime: Exclude<CaptionRuntime, { provider: "fallback" }>, systemPrompt: string, userPrompt: string): Promise<string | null> {
  const body: Record<string, unknown> = {
    model: runtime.model,
    temperature: 0.8,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  // Nous reasoning models spend a max_tokens budget on hidden reasoning and
  // return an empty caption. Do not send max_tokens. Haiku 5 needs reasoning off.
  if ((runtime.model || "").toLowerCase().includes("haiku-5")) {
    body.reasoning = { enabled: false };
  }

  const response = await fetch(runtime.endpoint!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${runtime.apiKey}`,
      "User-Agent": CAPTION_USER_AGENT,
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    const reason = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(reason);
  }

  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function requestCaptionWithRetry(runtime: Exclude<CaptionRuntime, { provider: "fallback" }>, systemPrompt: string, userPrompt: string): Promise<string | null> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await requestCaption(runtime, systemPrompt, userPrompt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "unknown";
      const delayMs = parseRetryDelayMs(message);
      if (attempt === 2 || !isRetryableCaptionError(message) || delayMs <= 0) {
        throw error;
      }
      console.warn(`[CaptionWriter] ${runtime.provider} retrying in ${Math.ceil(delayMs / 1000)}s (${responseStatus(message)})`);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("caption request failed");
}

function responseStatus(message: string): string {
  const http = message.match(/HTTP\s+\d+/i);
  return http ? http[0] : "request failed";
}

export async function generateCaption(req: CaptionRequest): Promise<string> {
  const runtime = resolveCaptionRuntime();
  if (runtime.provider === "fallback" || !runtime.apiKey || !runtime.endpoint) {
    return buildFallbackCaption(req);
  }

  try {
    const systemPrompt = buildSystemPrompt(req.brand, req.dealershipName, req.captionSpec, req.gmbSpec, req.platform);
    const userPrompt = buildUserPrompt(req);
    const caption = await enqueueCaptionTask(() => requestCaptionWithRetry(runtime as Exclude<CaptionRuntime, { provider: "fallback" }>, systemPrompt, userPrompt));
    const cleaned = cleanCaptionOutput(caption || "", req.platform);
    return cleaned || buildFallbackCaption(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error(`[CaptionWriter] ${runtime.provider} failed; using template (${responseStatus(message)})`);
    return buildFallbackCaption(req);
  }
}

export function cleanCaptionOutput(raw: string, platform: string): string {
  let text = (raw || "").trim();
  if (!text) return "";

  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .split("\n")
    .filter((line) => !/wait,\s*i need to check/i.test(line))
    .join("\n")
    .trim();

  text = text
    .replace(/^\s*\*\*(instagram|facebook|google(?:\s*my)?\s*business|gmb)\*\*\s*:?\s*/gim, "")
    .replace(/^\s*#+\s*(instagram|facebook|google(?:\s*my)?\s*business|gmb)\s*:?\s*/gim, "")
    .replace(/^\s*(instagram|facebook|google(?:\s*my)?\s*business|gmb)\s*:\s*/gim, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();

  const sectionRe = /(?:^|\n)\s*(?:\*\*)?(instagram|facebook|google(?:\s*my)?\s*business|gmb)(?:\*\*)?\s*:?\s*\n([\s\S]*?)(?=(?:\n\s*(?:\*\*)?(?:instagram|facebook|google(?:\s*my)?\s*business|gmb)(?:\*\*)?\s*:?)|$)/gi;
  const sections: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(raw)) !== null) {
    const key = match[1].toLowerCase().replace(/\s+/g, "");
    sections[key] = match[2].trim();
  }
  if (Object.keys(sections).length >= 2) {
    if (platform === "instagram" && sections.instagram) {
      text = sections.instagram;
    } else if (platform === "facebook" && sections.facebook) {
      text = sections.facebook;
    } else if (platform === "googlebusiness" && (sections.gmb || sections.googlemybusiness || sections.googlebusiness)) {
      text = sections.gmb || sections.googlemybusiness || sections.googlebusiness;
    }
  }

  text = text
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .filter((line) => !/wait,\s*i need to check/i.test(line))
    .join("\n")
    .trim();

  if (platform === "googlebusiness" && text.length > 250) {
    text = text.slice(0, 247).replace(/\s+\S*$/, "").trim() + "…";
  }

  return text;
}

function buildFallbackCaption(req: CaptionRequest): string {
  const { brand, dealershipName, vehicleInfo, postType, platform } = req;
  const isGMB = platform === "googlebusiness";

  const normalizedVehicleInfo = vehicleInfo.toLowerCase();
  const isPorscheLifestyle = brand === "Porsche" && (
    normalizedVehicleInfo.includes("porschelifestyle") ||
    normalizedVehicleInfo.includes("lifestyle") ||
    normalizedVehicleInfo.includes("rexy") ||
    normalizedVehicleInfo.includes("1948") ||
    normalizedVehicleInfo.includes("collection")
  );

  const intros: Record<string, string> = {
    "New Cars": `The ${vehicleInfo} is here.`,
    "Pre-Owned Cars": `Now available: ${vehicleInfo}.`,
    "Service": `${vehicleInfo} — trusted service at ${dealershipName}.`,
    "Parts & Accessories": `${vehicleInfo} — now in stock at ${dealershipName}.`,
    "Lifestyle": `${vehicleInfo} — lifestyle gear now featured at ${dealershipName}.`,
  };

  const intro = isPorscheLifestyle
    ? `${vehicleInfo} — Porsche Lifestyle apparel and branded accessories for the owner.`
    : (intros[postType] || `${vehicleInfo} at ${dealershipName}.`);

  if (isGMB) return `${intro} Visit ${dealershipName} for more information.`;

  return `${intro}`;
}

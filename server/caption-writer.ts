/**
 * AutoCaption Writer — PostEngine
 * Generates social media captions.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type CaptionProvider = "openai" | "github-models" | "nous" | "openai-compatible" | "fallback";

export interface CaptionRequest {
  dealershipName: string;
  brand: string; // BMW, Audi, Porsche
  postType: string; // New Cars, Pre-Owned Cars, Service, Parts & Accessories
  vehicleInfo: string; // parsed from file name
  platform: string; // instagram, facebook, googlebusiness, tiktok
  tone?: string; // minimal, punchy, detailed (default: punchy)
  captionSpec?: string | null;
  gmbSpec?: string | null;
  /** Optional operator direction for a rewrite (topic, angle, tone tweak). */
  rewriteDirection?: string | null;
  /** Existing caption being rewritten, when applicable. */
  currentCaption?: string | null;
  /** Weekly talking points / offers from Generate Posts switchboard — weave into every caption this run. */
  talkingPoints?: string | null;
  /** image | video | carousel — shapes language slightly (still / motion). */
  mediaType?: string | null;
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
let cachedNousToken: { value: string; fetchedAt: number } | null = null;

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
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key]?.trim() || "";
  }

  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
    const match = envFile.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (match?.[1]) return match[1].trim();
  } catch {}

  return "";
}

function loadBrandRules(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "notes", "brand-caption-rules.md"), "utf-8");
  } catch {
    return "";
  }
}

function platformBrief(platform?: string): { name: string; rules: string } {
  switch ((platform || "").toLowerCase()) {
    case "instagram":
      return {
        name: "Instagram",
        rules: `Platform audience: visual-first scrollers on mobile. Lead with one strong image-led line. Keep it tight (~12-28 words). Feels like premium brand social, not a listing. No hashtags. No emoji. No link dumps.`,
      };
    case "facebook":
      return {
        name: "Facebook",
        rules: `Platform audience: local + share-friendly feed readers, slightly broader than IG. Still short, but can be a touch more conversational or informative (still ~12-32 words). No hashtags. No emoji. Do not paste URLs in the caption body.`,
      };
    case "googlebusiness":
    case "gmb":
      return {
        name: "Google Business Profile",
        rules: `Platform audience: local searchers and map browsers deciding where to go / what to inquire about. Professional, useful, local-trust tone. Max ~220 characters. No hashtags. No @ mentions. No CTA links. No emoji. Plain helpful language.`,
      };
    case "tiktok":
      return {
        name: "TikTok",
        rules: `Platform audience: short-form video viewers. Sound native and kinetic, not brochure. One hooky line + one concrete visual beat (~8-22 words). No hashtags bank. No emoji spam. No hard sell.`,
      };
    default:
      return {
        name: "social",
        rules: `Keep it short, brand-true, and platform-native.`,
      };
  }
}

function buildSystemPrompt(brand: string, dealershipName: string, captionSpec?: string | null, gmbSpec?: string | null, platform?: string): string {
  const brandRules = loadBrandRules();
  const dealershipRules = captionSpec ? `\nDealership-specific rules:\n${captionSpec}\n` : "";
  const gmbRules = gmbSpec && (platform === "googlebusiness" || platform === "gmb")
    ? `\nGMB-specific rules:\n${gmbSpec}\n`
    : "";
  const brief = platformBrief(platform);

  return `Write ONE snappy caption for ${brief.name} only. You are the brand manager for ${brand}, writing for ${dealershipName}.

${brief.rules}

Length defaults:
- Instagram / Facebook / TikTok: about two short lines / ~12-28 words (TikTok can be shorter)
- Google Business: max 220 characters

Use these supporting rules:
${brandRules}
${dealershipRules}${gmbRules}

Hard rules:
- Return the final caption text only.
- Do NOT label platforms.
- Do NOT include Instagram/Facebook/GMB/TikTok sections in one response.
- Do NOT use markdown headings, bold markers, or bullet labels.
- Never include camera serials, frame numbers, or dump codes (e.g. 33A9398, IMG_1234, DSC0123, UUID tails).
- No hashtags.
- No emoji.
- No quotation marks around the caption.
- No fake hype.
- No generic luxury filler.
- Never invent specs.
- Tailor voice and emphasis to this platform's audience — do not reuse a generic multi-platform dump.`;
}

function buildUserPrompt(req: CaptionRequest): string {
  const toneStr = req.tone || "punchy";
  const isGMB = req.platform === "googlebusiness" || req.platform === "gmb";
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
    inventory: "inventory / featured vehicle spotlight",
    promo: "promotional offer or event",
    lifestyle: "lifestyle or brand-moment content",
    announcement: "announcement or store update",
  };

  const context = isPorscheLifestyle
    ? "Porsche Lifestyle collection for the owner: apparel, hats, bags, merch, and branded lifestyle accessories. This is not a car parts post. Do not mention vehicle upgrades, service parts, performance parts, OEM parts, or engineering components. Write about clothing, personal accessories, giftable merch, and brand lifestyle appeal."
    : (typeContext[req.postType] || req.postType);

  const direction = (req.rewriteDirection || "").trim();
  const current = (req.currentCaption || "").trim();
  const talking = (req.talkingPoints || "").trim();
  const mediaType = (req.mediaType || "").trim().toLowerCase();
  const mediaHint =
    mediaType === "video" || mediaType === "reels"
      ? " Media is VIDEO — write for motion/reel energy, not a still-photo brochure line."
      : mediaType === "carousel"
        ? " Media is a CAROUSEL — one idea that works across a short set of frames."
        : mediaType === "image"
          ? " Media is a still IMAGE — lead with what the viewer sees."
          : "";
  const rewriteBlock = direction
    ? `\n\nOPERATOR PROMPT / DIRECTION (follow this closely):\n${direction}${current ? `\n\nCURRENT CAPTION (optional starting point):\n${current}` : ""}\n\nWrite a fresh caption that keeps the same vehicle/subject but applies the operator direction. Do not reuse old wording unless it still fits.`
    : "";
  const talkingBlock = talking
    ? `\n\nWEEKLY TALKING POINTS / OFFERS (from operator — weave in naturally when relevant to this vehicle/post type; do not force every point into every caption; never invent pricing or terms not listed):\n${talking}`
    : "";

  const brief = platformBrief(req.platform);
  if (isGMB) {
    return `Write ONE Google Business caption only for: ${req.vehicleInfo} — ${context}.${mediaHint} Max 220 characters. No hashtags. No @ mentions. No CTA link. Professional luxury tone only.${req.gmbSpec ? ` Follow these dealership GMB rules: ${req.gmbSpec}` : ""}${talkingBlock}${rewriteBlock}`;
  }

  return `Write ONE ${brief.name} caption only for: ${req.vehicleInfo} — ${context}.${mediaHint} Tone: ${toneStr}. Remember audience: ${brief.rules}${req.captionSpec ? ` Dealership caption rules: ${req.captionSpec}` : ""}${talkingBlock}${rewriteBlock}`;
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

function getOpenAiKey(): string {
  return readEnvValue("OPENAI_API_KEY");
}

function getGithubModelsKey(): string {
  return readEnvValue("GITHUB_MODELS_TOKEN") || readEnvValue("GITHUB_TOKEN");
}

function getCaptionApiKey(): string {
  return readEnvValue("CAPTION_API_KEY") || readEnvValue("NOUS_API_KEY");
}

function resolveNousTokenFromHermes(): string {
  const now = Date.now();
  if (cachedNousToken && now - cachedNousToken.fetchedAt < 10 * 60 * 1000 && cachedNousToken.value) {
    return cachedNousToken.value;
  }

  const home = process.env.HOME || "";
  const hermesHome = process.env.HERMES_HOME || path.join(home, ".hermes");
  const python =
    readEnvValue("HERMES_PYTHON") ||
    path.join(hermesHome, "hermes-agent", "venv", "bin", "python");

  try {
    const out = execFileSync(
      python,
      ["-c", "from hermes_cli.auth import resolve_nous_access_token; print(resolve_nous_access_token() or '')"],
      {
        env: { ...process.env, HERMES_HOME: hermesHome, PYTHONUNBUFFERED: "1" },
        timeout: 20000,
        encoding: "utf-8",
      },
    ).trim();
    if (out) {
      cachedNousToken = { value: out, fetchedAt: now };
      return out;
    }
  } catch (error) {
    console.warn("[CaptionWriter] failed to resolve Nous token from Hermes:", error instanceof Error ? error.message : error);
  }

  return "";
}

function getNousApiKey(): string {
  return getCaptionApiKey() || resolveNousTokenFromHermes();
}

function getCompatibleEndpoint(): string {
  const base =
    readEnvValue("CAPTION_BASE_URL") ||
    readEnvValue("OPENAI_BASE_URL") ||
    "https://inference-api.nousresearch.com/v1";
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function getConfiguredModel(provider: Exclude<CaptionProvider, "fallback">): string {
  const shared = readEnvValue("CAPTION_MODEL");
  if (shared) return shared;

  if (provider === "github-models") {
    return readEnvValue("GITHUB_MODELS_MODEL") || DEFAULT_GITHUB_MODEL;
  }

  if (provider === "nous" || provider === "openai-compatible") {
    return readEnvValue("NOUS_MODEL") || DEFAULT_NOUS_MODEL;
  }

  return readEnvValue("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL;
}

export function resolveCaptionRuntime(): CaptionRuntime {
  const requestedProvider = normalizeProvider(readEnvValue("CAPTION_PROVIDER"));
  const githubKey = getGithubModelsKey();
  const githubModelsToken = readEnvValue("GITHUB_MODELS_TOKEN");
  const openAiKey = getOpenAiKey();
  const captionKey = getCaptionApiKey();

  if (requestedProvider === "fallback") {
    return { provider: "fallback", model: null, apiKey: null, endpoint: null };
  }

  if (requestedProvider === "nous") {
    return {
      provider: "nous",
      model: getConfiguredModel("nous"),
      apiKey: getNousApiKey() || null,
      endpoint: NOUS_ENDPOINT,
    };
  }

  if (requestedProvider === "openai-compatible") {
    return {
      provider: "openai-compatible",
      model: getConfiguredModel("openai-compatible"),
      apiKey: captionKey || openAiKey || getNousApiKey() || null,
      endpoint: getCompatibleEndpoint(),
    };
  }

  if (requestedProvider === "github-models") {
    return {
      provider: "github-models",
      model: getConfiguredModel("github-models"),
      apiKey: githubKey || null,
      endpoint: GITHUB_MODELS_ENDPOINT,
    };
  }

  if (requestedProvider === "openai") {
    return {
      provider: "openai",
      model: getConfiguredModel("openai"),
      apiKey: openAiKey || null,
      endpoint: OPENAI_ENDPOINT,
    };
  }

  // Prefer explicit Nous key / Hermes OAuth over dead GitHub Models.
  if (captionKey || resolveNousTokenFromHermes()) {
    return {
      provider: "nous",
      model: getConfiguredModel("nous"),
      apiKey: getNousApiKey() || null,
      endpoint: NOUS_ENDPOINT,
    };
  }

  if (githubModelsToken) {
    return {
      provider: "github-models",
      model: getConfiguredModel("github-models"),
      apiKey: githubModelsToken,
      endpoint: GITHUB_MODELS_ENDPOINT,
    };
  }

  if (openAiKey) {
    return {
      provider: "openai",
      model: getConfiguredModel("openai"),
      apiKey: openAiKey,
      endpoint: OPENAI_ENDPOINT,
    };
  }

  return { provider: "fallback", model: null, apiKey: null, endpoint: null };
}

async function requestCaption(runtime: Exclude<CaptionRuntime, { provider: "fallback" }>, systemPrompt: string, userPrompt: string): Promise<string | null> {
  const response = await fetch(runtime.endpoint!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${runtime.apiKey!}`,
      "User-Agent": CAPTION_USER_AGENT,
      "Accept": "application/json",
    },
    body: JSON.stringify({
      model: runtime.model,
      temperature: 0.8,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
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
      const message = error instanceof Error ? error.message : String(error);
      const delayMs = parseRetryDelayMs(message);
      if (attempt === 2 || !isRetryableCaptionError(message) || delayMs <= 0) {
        throw error;
      }
      console.warn(`[CaptionWriter] ${runtime.provider} retrying in ${Math.ceil(delayMs / 1000)}s after error: ${message}`);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
    console.error(`[CaptionWriter] ${runtime.provider} error:`, e);
    return buildFallbackCaption(req);
  }
}

function cleanCaptionOutput(raw: string, platform: string): string {
  let text = (raw || "").trim();
  if (!text) return "";

  // Strip accidental multi-platform dumps / markdown labels.
  text = text
    .replace(/^\s*\*\*(instagram|facebook|tiktok|google(?:\s*my)?\s*business|gmb)\*\*\s*:?\s*/gim, "")
    .replace(/^\s*#+\s*(instagram|facebook|tiktok|google(?:\s*my)?\s*business|gmb)\s*:?\s*/gim, "")
    .replace(/^\s*(instagram|facebook|tiktok|google(?:\s*my)?\s*business|gmb)\s*:\s*/gim, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();

  // If the model still returned labeled sections, keep the matching block only.
  const sectionRe = /(?:^|\n)\s*(?:\*\*)?(instagram|facebook|tiktok|google(?:\s*my)?\s*business|gmb)(?:\*\*)?\s*:?\s*\n([\s\S]*?)(?=(?:\n\s*(?:\*\*)?(?:instagram|facebook|tiktok|google(?:\s*my)?\s*business|gmb)(?:\*\*)?\s*:?)|$)/gi;
  const sections: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = sectionRe.exec(raw)) !== null) {
    const key = match[1].toLowerCase().replace(/\s+/g, "");
    sections[key] = match[2].trim();
  }
  if (Object.keys(sections).length >= 2) {
    if (platform === "instagram" && (sections.instagram || sections["instagram"])) {
      text = sections.instagram;
    } else if (platform === "facebook" && sections.facebook) {
      text = sections.facebook;
    } else if (platform === "tiktok" && sections.tiktok) {
      text = sections.tiktok;
    } else if (platform === "googlebusiness" && (sections.gmb || sections.googlemybusiness || sections.googlebusiness)) {
      text = sections.gmb || sections.googlemybusiness || sections.googlebusiness;
    }
  }

  // Collapse excess blank lines and strip leftover bold markers.
  text = text
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
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

export type SupportedCaptionPlatform = "instagram" | "facebook" | "googlebusiness" | "tiktok";

const CAPTION_PLATFORM_SET = new Set<SupportedCaptionPlatform>([
  "instagram",
  "facebook",
  "googlebusiness",
  "tiktok",
]);

export function normalizeCaptionPlatforms(platforms: unknown): SupportedCaptionPlatform[] {
  const list = Array.isArray(platforms) ? platforms : [];
  const out: SupportedCaptionPlatform[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    const normalized =
      key === "gmb" || key === "google" || key === "google business"
        ? "googlebusiness"
        : key;
    if (CAPTION_PLATFORM_SET.has(normalized as SupportedCaptionPlatform) && !out.includes(normalized as SupportedCaptionPlatform)) {
      out.push(normalized as SupportedCaptionPlatform);
    }
  }
  return out;
}

export async function generateCaptionsForPlatforms(input: {
  dealershipName: string;
  brand: string;
  postType: string;
  vehicleInfo: string;
  platforms: SupportedCaptionPlatform[];
  prompt: string;
  mediaType?: string | null;
  captionSpec?: string | null;
  gmbSpec?: string | null;
  talkingPoints?: string | null;
  currentCaptions?: Partial<Record<SupportedCaptionPlatform, string | null | undefined>>;
}): Promise<Partial<Record<SupportedCaptionPlatform, string>>> {
  const platforms = input.platforms.length > 0
    ? input.platforms
    : (["instagram", "facebook", "googlebusiness"] as SupportedCaptionPlatform[]);

  const base = {
    dealershipName: input.dealershipName,
    brand: input.brand,
    postType: input.postType,
    vehicleInfo: input.vehicleInfo || input.postType || "Featured vehicle",
    rewriteDirection: input.prompt,
    mediaType: input.mediaType || null,
    captionSpec: input.captionSpec,
    gmbSpec: input.gmbSpec,
    talkingPoints: input.talkingPoints,
  };

  const entries = await Promise.all(
    platforms.map(async (platform) => {
      const caption = await generateCaption({
        ...base,
        platform,
        tone: platform === "googlebusiness" ? "professional" : "punchy",
        currentCaption: input.currentCaptions?.[platform] || null,
      });
      return [platform, caption] as const;
    }),
  );

  return Object.fromEntries(entries);
}

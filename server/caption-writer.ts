/**
 * AutoCaption Writer — PostEngine
 * Generates social media captions using Claude API.
 * Follows the AutoCaption GPT instructions per dealership/brand.
 */

import { execSync } from "child_process";

// Read key at call time so .env has time to load
function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  // Fallback: read directly from .env file
  try {
    const fs = require('fs');
    const path = require('path');
    const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
    const match = envFile.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "";
}

interface CaptionRequest {
  dealershipName: string;
  brand: string; // BMW, Audi, Porsche
  postType: string; // New Cars, Pre-Owned Cars, Service, Parts & Accessories
  vehicleInfo: string; // parsed from file name
  platform: string; // instagram, facebook, googlebusiness
  tone?: string; // minimal, punchy, detailed (default: punchy)
  captionSpec?: string | null;
  gmbSpec?: string | null;
}

interface CaptionResult {
  main: string;
  twitter: string;
  gmb: string;
}

const BMW_CTA: Record<string, string> = {
  "Brian Harris BMW": ``,
  "BMW of Jackson": ``,
};

const AUDI_CTA = ``;

const PORSCHE_CTA = ``;

function buildSystemPrompt(brand: string, dealershipName: string, captionSpec?: string | null, gmbSpec?: string | null): string {
  const bodyRules = `
CAPTION BODY RULES (non-negotiable):
- Keep it short. Usually 1-2 short lines.
- Lead with the vehicle, the feeling, or a clean statement.
- One strong hook: performance, design, lifestyle, prestige, or seasonal relevance.
- No filler phrases. No "We are excited to" or "Stop by today to".
- Punchy over poetic. Confident over explanatory.
- Premium tone. Clean, current, and easy to read.
- Minimal CTA. No bloated dealer instruction blocks.
- Return only the caption for the requested platform. Do not include Twitter/X versions, labels, separators, or alternate variants.
- Do not invent specs unless they are explicitly provided in the prompt.
- Do not include hashtags.
`;

  const dealershipRules = captionSpec ? `\nDEALERSHIP CAPTION SPEC:\n${captionSpec}\n` : "";
  const gmbRules = gmbSpec ? `\nGMB-SPECIFIC RULES:\n${gmbSpec}\n` : "";

  if (brand === "Porsche") {
    return `You are AutoCaption for Harris Porsche — a marketing director and luxury content strategist writing social media captions for a Porsche dealership. Your primary focus is to craft engaging, performance-driven captions that reflect the precision, heritage, and sporting spirit of Porsche. Write around 40 words per caption when appropriate, highlighting standout specifications only when they are explicitly provided. Weave in luxury, lifestyle, and seasonal references while maintaining an aspirational yet approachable tone.
${bodyRules}${dealershipRules}${gmbRules}

If the prompt starts with 'GMB', write a Google My Business caption that fits update descriptions, omitting the CTA block and all hashtags.

Respond only with the single requested caption. No prefaces, labels, quotation marks, separators, or alternate versions.`;
  }

  if (brand === "Audi") {
    return `You are AutoCaption — a marketing director at a luxury auto dealer, skilled in creating high-impact social media captions for luxury cars. Caption length, tone, and style are dynamically adjusted based on the user's instruction. Captions should highlight performance, luxury features, brand prestige, and relevant lifestyle or seasonal elements when appropriate. Keep wording sharp and intentional.
${bodyRules}${dealershipRules}${gmbRules}
Provide tailored messaging for Audi vehicles.

If the prompt begins with 'GMB', create a Google My Business caption without the CTA block or hashtags.

Only reference exact vehicle specs when they are explicitly provided in the prompt.

Respond only with the single requested caption. No prefaces, labels, quotation marks, separators, or alternate versions.`;
  }

  // BMW (default)
  return `You are AutoCaption — a marketing director at a luxury auto dealer, skilled in creating high-impact social media captions for luxury cars. Caption length, tone, and style are dynamically adjusted based on the user's instruction. Captions should highlight performance, luxury features, brand prestige, and relevant lifestyle or seasonal elements when appropriate. Keep wording sharp and intentional.
${bodyRules}${dealershipRules}${gmbRules}
Provide tailored messaging for BMW vehicles.

If the prompt begins with 'GMB', create a Google My Business caption without the CTA block or hashtags.

Only reference exact vehicle specs when they are explicitly provided in the prompt.

Respond only with the single requested caption. No prefaces, labels, quotation marks, separators, or alternate versions.`;
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
  };

  const context = isPorscheLifestyle
    ? "Porsche Lifestyle collection for the owner: apparel, hats, bags, merch, and branded lifestyle accessories. This is not a car parts post. Do not mention vehicle upgrades, service parts, performance parts, OEM parts, or engineering components. Write about clothing, personal accessories, giftable merch, and brand lifestyle appeal."
    : (typeContext[req.postType] || req.postType);

  if (isGMB) {
    return `GMB ${req.vehicleInfo} — ${context}. Write a professional Google My Business update post. Max 250 characters. No hashtags. No @ mentions. No CTA link. Professional luxury tone only.${req.gmbSpec ? ` Follow these dealership GMB rules: ${req.gmbSpec}` : ""}`;
  }

  return `${req.vehicleInfo} — ${context}. Tone: ${toneStr}.${req.captionSpec ? ` Dealership caption rules: ${req.captionSpec}` : ""}`;
}

export async function generateCaption(req: CaptionRequest): Promise<string> {
  const ANTHROPIC_API_KEY = getApiKey();
  if (!ANTHROPIC_API_KEY) {
    // Fallback if no API key — use template
    return buildFallbackCaption(req);
  }

  try {
    const systemPrompt = buildSystemPrompt(req.brand, req.dealershipName, req.captionSpec, req.gmbSpec);
    const userPrompt = buildUserPrompt(req);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await response.json() as any;
    return data.content?.[0]?.text || buildFallbackCaption(req);
  } catch (e) {
    console.error("[CaptionWriter] API error:", e);
    return buildFallbackCaption(req);
  }
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

/**
 * AutoCaption Writer — PostEngine
 * Generates social media captions using Claude API.
 * Follows the AutoCaption GPT instructions per dealership/brand.
 */

/**
 * Caption calls use only CAPTION_PROVIDER, CAPTION_BASE_URL, and CAPTION_MODEL,
 * plus the key for that provider (ANTHROPIC_API_KEY or GITHUB_MODELS_TOKEN).
 * There is no local Hermes/Nous lookup. Any failure returns a template.
 */

type CaptionSettings = {
  provider: string;
  model: string;
  baseUrl: string;
};

function captionSettings(): CaptionSettings {
  const provider = (process.env.CAPTION_PROVIDER || "anthropic").trim().toLowerCase();
  const model = (process.env.CAPTION_MODEL || (provider === "anthropic" ? "claude-haiku-4-5" : "")).trim();
  const baseUrl = (process.env.CAPTION_BASE_URL || (provider === "anthropic" ? "https://api.anthropic.com" : ""))
    .trim()
    .replace(/\/$/, "");
  return { provider, model, baseUrl };
}

interface CaptionRequest {
  dealershipName: string;
  brand: string; // BMW, Audi, Porsche
  postType: string; // New Cars, Pre-Owned Cars, Service, Parts & Accessories
  vehicleInfo: string; // parsed from file name
  platform: string; // instagram, facebook, googlebusiness
  tone?: string; // minimal, punchy, detailed (default: punchy)
}

interface CaptionResult {
  main: string;
  twitter: string;
  gmb: string;
}

const BMW_CTA: Record<string, string> = {
  "Brian Harris BMW": `Click here --> @brianharrisbmw then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Brian Harris BMW a 2024 Center of Excellence Dealer.`,
  "BMW of Jackson": `Click here --> @bmwofjackson then click the linkin.bio to browse and click on the link of this post.`,
};

const AUDI_CTA = `Click here --> @audibatonrouge then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Audi Baton Rouge your Magna Society Dealer.`;

const PORSCHE_CTA = `Click here --> @harris_porsche then click the linkin.bio to browse and click on the link of this post.\n\nExperience the Harris Family Difference.`;

function buildSystemPrompt(brand: string, dealershipName: string): string {
  const bodyRules = `
CAPTION BODY RULES (non-negotiable):
- Maximum 2-3 sentences in the body. Never longer.
- Lead with the vehicle — make, model, standout feature or emotion.
- One strong hook: performance, lifestyle, prestige, or seasonal.
- No filler phrases. No "We are excited to" or "Stop by today to".
- Punchy over poetic. Short sentences hit harder.
- Professional luxury tone — sharp, confident, never try-hard.
`;

  if (brand === "Porsche") {
    return `You are AutoCaption for Harris Porsche — a marketing director and luxury content strategist writing social media captions for a Porsche dealership. Your primary focus is to craft engaging, performance-driven captions that reflect the precision, heritage, and sporting spirit of Porsche. Write around 40 words per caption, highlighting standout specifications like horsepower, torque, acceleration, and engineering details when relevant. Weave in luxury, lifestyle, and seasonal references while maintaining an aspirational yet approachable tone.
${bodyRules}

When given a Porsche model, reply immediately with the caption text only (no prefaces, labels, or quotes), followed by a Twitter-optimized version that's shorter, energetic, and includes a direct call-to-action. Each main caption should end with 6 trending hashtags related to Porsche, the model, and competitive marques, ensuring they're current on TikTok.

Between the caption and hashtags, insert this dealership line:

${PORSCHE_CTA}

If the prompt starts with 'GMB', write a Google My Business caption that fits update descriptions, omitting the 'Click here' line. Emphasize clarity, professionalism, and luxury storytelling while staying grounded in Porsche performance and prestige.

Respond only with captions. No prefaces, labels, or quotation marks.`;
  }

  if (brand === "Audi") {
    return `You are AutoCaption — a marketing director at a luxury auto dealer, skilled in creating high-impact social media captions for luxury cars. Caption length, tone, and style are dynamically adjusted based on the user's instruction. Captions should highlight performance, luxury features, brand prestige, and relevant lifestyle or seasonal elements when appropriate. Keep wording sharp and intentional.
${bodyRules}
Provide tailored messaging for Audi vehicles.

End each caption with exactly 6 trending hashtags relevant to the vehicle, segment, and competitors.

Immediately follow each caption with a shorter Twitter/X version: very concise, includes 1–2 hashtags and a clear call to action.

Audi-specific requirement: Insert the following call-to-action after the main caption body and before hashtags, with spacing preserved:

${AUDI_CTA}

If the prompt begins with 'GMB', create a Google My Business caption without the CTA block.

For the 2025 Audi Q5, incorporate key specs including 268 hp, quattro AWD, redesigned styling, OLED lighting, and advanced interior tech when relevant.

Respond only with captions. No prefaces, labels, or quotation marks.`;
  }

  // BMW (default)
  const bmwCta = BMW_CTA[dealershipName] || BMW_CTA["Brian Harris BMW"];
  return `You are AutoCaption — a marketing director at a luxury auto dealer, skilled in creating high-impact social media captions for luxury cars. Caption length, tone, and style are dynamically adjusted based on the user's instruction. Captions should highlight performance, luxury features, brand prestige, and relevant lifestyle or seasonal elements when appropriate. Keep wording sharp and intentional.
${bodyRules}
Provide tailored messaging for BMW vehicles.

End each caption with exactly 6 trending hashtags relevant to the vehicle, segment, and competitors.

Immediately follow each caption with a shorter Twitter/X version: very concise, includes 1–2 hashtags and a clear call to action.

BMW-specific requirement: Insert the following call-to-action after the main caption body and before hashtags, with spacing preserved:

${bmwCta}

If the prompt begins with 'GMB', create a Google My Business caption without the CTA block.

Respond only with captions. No prefaces, labels, or quotation marks.`;
}

function buildUserPrompt(req: CaptionRequest): string {
  const toneStr = req.tone || "punchy";
  const isGMB = req.platform === "googlebusiness";

  const typeContext: Record<string, string> = {
    "New Cars": "new vehicle available now",
    "Pre-Owned Cars": "pre-owned vehicle available",
    "Service": "service department promotion",
    "Parts & Accessories": "parts and accessories",
  };

  const context = typeContext[req.postType] || req.postType;

  if (isGMB) {
    return `GMB ${req.vehicleInfo} — ${context}. Write a professional Google My Business update post. Max 250 characters. No hashtags. No @ mentions. No CTA link. Professional luxury tone only.`;
  }

  return `${req.vehicleInfo} — ${context}. Tone: ${toneStr}.`;
}

async function requestCaption(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const { provider, model, baseUrl } = captionSettings();
  if (!model || !baseUrl) {
    console.error(`[CaptionWriter] ${provider} needs CAPTION_MODEL and CAPTION_BASE_URL; using template`);
    return null;
  }

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY?.trim() || "";
    if (!key) {
      console.error("[CaptionWriter] ANTHROPIC_API_KEY unset; using template");
      return null;
    }
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      console.error(`[CaptionWriter] anthropic failed (${response.status}); using template`);
      return null;
    }
    const data = await response.json() as { content?: { text?: string }[] };
    return data.content?.[0]?.text || null;
  }

  const key = process.env.GITHUB_MODELS_TOKEN?.trim() || "";
  if (!key) {
    console.error(`[CaptionWriter] ${provider} needs GITHUB_MODELS_TOKEN; using template`);
    return null;
  }
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    console.error(`[CaptionWriter] ${provider} failed (${response.status}); using template`);
    return null;
  }
  const data = await response.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || null;
}

export async function generateCaption(req: CaptionRequest): Promise<string> {
  try {
    const text = await requestCaption(
      buildSystemPrompt(req.brand, req.dealershipName),
      buildUserPrompt(req),
    );
    return text?.trim() || buildFallbackCaption(req);
  } catch (e) {
    console.error("[CaptionWriter] request failed; using template:", e instanceof Error ? e.message : "unknown");
    return buildFallbackCaption(req);
  }
}

function buildFallbackCaption(req: CaptionRequest): string {
  const { brand, dealershipName, vehicleInfo, postType, platform } = req;
  const isGMB = platform === "googlebusiness";

  const intros: Record<string, string> = {
    "New Cars": `The ${vehicleInfo} is here.`,
    "Pre-Owned Cars": `Now available: ${vehicleInfo}.`,
    "Service": `${vehicleInfo} — trusted service at ${dealershipName}.`,
    "Parts & Accessories": `${vehicleInfo} — now in stock at ${dealershipName}.`,
  };

  const intro = intros[postType] || `${vehicleInfo} at ${dealershipName}.`;

  if (isGMB) return `${intro} Visit us at ${dealershipName} for more information.`; // No hashtags, no CTA link on GMB

  let cta = "";
  if (brand === "Porsche") cta = `\n\n${PORSCHE_CTA}`;
  else if (brand === "Audi") cta = `\n\n${AUDI_CTA}`;
  else cta = `\n\n${BMW_CTA[dealershipName] || BMW_CTA["Brian Harris BMW"]}`;

  return `${intro}${cta}`;
}

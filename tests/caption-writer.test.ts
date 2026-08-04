import { afterEach, test } from "node:test";
import * as assert from "node:assert/strict";

import { generateCaption, resolveCaptionRuntime } from "../server/caption-writer";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("resolveCaptionRuntime prefers GitHub Models when configured", () => {
  process.env.CAPTION_PROVIDER = "github-models";
  process.env.GITHUB_MODELS_TOKEN = "github-models-token";
  process.env.CAPTION_MODEL = "claude-haiku-4.5";

  assert.deepEqual(resolveCaptionRuntime(), {
    provider: "github-models",
    model: "claude-haiku-4.5",
    apiKey: "github-models-token",
    endpoint: "https://models.inference.ai.azure.com/chat/completions",
  });
});

test("resolveCaptionRuntime does not auto-select GitHub Models from a generic GitHub token", () => {
  process.env.CAPTION_PROVIDER = "";
  process.env.GITHUB_MODELS_TOKEN = "";
  process.env.GITHUB_TOKEN = "repo-token-only";
  process.env.OPENAI_API_KEY = "";
  process.env.CAPTION_API_KEY = "";
  process.env.NOUS_API_KEY = "";
  process.env.HERMES_HOME = "/tmp/no-hermes-home-for-caption-test";
  process.env.HERMES_PYTHON = "/usr/bin/false";

  assert.deepEqual(resolveCaptionRuntime(), {
    provider: "fallback",
    model: null,
    apiKey: null,
    endpoint: null,
  });
});

test("generateCaption calls the GitHub Models endpoint when github-models is selected", async (t) => {
  process.env.CAPTION_PROVIDER = "github-models";
  process.env.GITHUB_MODELS_TOKEN = "github-models-token";
  process.env.CAPTION_MODEL = "claude-haiku-4.5";

  const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://models.inference.ai.azure.com/chat/completions");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer github-models-token");

    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "claude-haiku-4.5");
    assert.equal(body.messages[1].role, "user");

    return {
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: "Fresh Audi copy." } },
        ],
      }),
    } as Response;
  });

  const caption = await generateCaption({
    dealershipName: "Audi Baton Rouge",
    brand: "Audi",
    postType: "New Cars",
    vehicleInfo: "2026 Audi Q7 Prestige",
    platform: "instagram",
    tone: "punchy",
    captionSpec: "Modern Audi tone.",
    gmbSpec: null,
  });

  assert.equal(caption, "Fresh Audi copy.");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("generateCaption falls back cleanly when the configured provider has no credentials", async () => {
  process.env.CAPTION_PROVIDER = "github-models";
  process.env.GITHUB_MODELS_TOKEN = "";
  process.env.GITHUB_TOKEN = "";
  process.env.OPENAI_API_KEY = "";
  process.env.CAPTION_API_KEY = "";
  process.env.NOUS_API_KEY = "";
  process.env.HERMES_HOME = "/tmp/no-hermes-home-for-caption-test";
  process.env.HERMES_PYTHON = "/usr/bin/false";

  const caption = await generateCaption({
    dealershipName: "Audi Baton Rouge",
    brand: "Audi",
    postType: "New Cars",
    vehicleInfo: "2026 Audi Q7 Prestige",
    platform: "instagram",
    tone: "punchy",
    captionSpec: "Modern Audi tone.",
    gmbSpec: null,
  });

  assert.equal(caption, "The 2026 Audi Q7 Prestige is here.");
});

test("resolveCaptionRuntime supports Nous Portal + Haiku", () => {
  process.env.CAPTION_PROVIDER = "nous";
  process.env.CAPTION_MODEL = "anthropic/claude-haiku-4.5";
  process.env.CAPTION_API_KEY = "nous-test-token";
  process.env.GITHUB_MODELS_TOKEN = "";
  process.env.OPENAI_API_KEY = "";

  assert.deepEqual(resolveCaptionRuntime(), {
    provider: "nous",
    model: "anthropic/claude-haiku-4.5",
    apiKey: "nous-test-token",
    endpoint: "https://inference-api.nousresearch.com/v1/chat/completions",
  });
});

test("generateCaption calls the Nous Portal endpoint when nous is selected", async (t) => {
  process.env.CAPTION_PROVIDER = "nous";
  process.env.CAPTION_MODEL = "anthropic/claude-haiku-4.5";
  process.env.CAPTION_API_KEY = "nous-test-token";

  const fetchMock = t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://inference-api.nousresearch.com/v1/chat/completions");
    assert.equal(init?.method, "POST");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer nous-test-token");
    assert.match(headers["User-Agent"] || "", /Mozilla/);

    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "anthropic/claude-haiku-4.5");

    return {
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: "First Cayenne Electric. In stock at Harris Porsche." } },
        ],
      }),
    } as Response;
  });

  const caption = await generateCaption({
    dealershipName: "Harris Porsche",
    brand: "Porsche",
    postType: "Reels",
    vehicleInfo: "Cayenne Electric — first for Harris Porsche",
    platform: "instagram",
    tone: "punchy",
  });

  assert.equal(caption, "First Cayenne Electric. In stock at Harris Porsche.");
  assert.equal(fetchMock.mock.callCount(), 1);
});

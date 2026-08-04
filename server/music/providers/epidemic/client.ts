/**
 * Epidemic Sound via official MCP HTTP endpoint (session + tools/call).
 * Isolated so SaaS tenants can later inject per-tenant API keys.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  MusicDownloadResult,
  MusicProvider,
  MusicSearchParams,
  MusicTrackCandidate,
} from "../../types";

const DEFAULT_MCP_URL = "https://www.epidemicsound.com/a/mcp-service/mcp";

type Json = Record<string, unknown>;

function readEnvKey(): string {
  if (process.env.EPIDEMIC_SOUND_API_KEY?.trim()) {
    return process.env.EPIDEMIC_SOUND_API_KEY.trim();
  }
  try {
    const envPath = path.join(process.cwd(), ".env");
    const text = fs.readFileSync(envPath, "utf-8");
    const m = text.match(/^EPIDEMIC_SOUND_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return "";
}

function parseSseJsonPayloads(raw: string): Json[] {
  const out: Json[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const body = line.slice(5).trim();
    if (!body || body === "[DONE]") continue;
    try {
      out.push(JSON.parse(body) as Json);
    } catch {
      /* ignore */
    }
  }
  // Some gateways return plain JSON
  if (!out.length && raw.trim().startsWith("{")) {
    try {
      out.push(JSON.parse(raw) as Json);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export class EpidemicMcpClient {
  private apiKey: string;
  private baseUrl: string;
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey || readEnvKey();
    this.baseUrl = opts?.baseUrl || process.env.EPIDEMIC_MCP_URL || DEFAULT_MCP_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private async rawPost(body: Json, sessionId?: string | null): Promise<{ sessionId: string | null; payloads: Json[]; raw: string }> {
    if (!this.apiKey) throw new Error("EPIDEMIC_SOUND_API_KEY not configured");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2024-11-05",
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const newSid =
      res.headers.get("Mcp-Session-Id") ||
      res.headers.get("mcp-session-id") ||
      sessionId ||
      null;
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Epidemic MCP HTTP ${res.status}: ${raw.slice(0, 300)}`);
    }
    return { sessionId: newSid, payloads: parseSseJsonPayloads(raw), raw };
  }

  async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;

    const init = await this.rawPost({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "postengine-music", version: "0.1.0" },
      },
    });
    if (!init.sessionId) throw new Error("Epidemic MCP did not return Mcp-Session-Id");
    this.sessionId = init.sessionId;

    await this.rawPost({ jsonrpc: "2.0", method: "notifications/initialized" }, this.sessionId);
    return this.sessionId;
  }

  async callTool(name: string, args: Json): Promise<unknown> {
    const sid = await this.ensureSession();
    const { payloads, raw, sessionId } = await this.rawPost(
      {
        jsonrpc: "2.0",
        id: this.nextId++,
        method: "tools/call",
        params: { name, arguments: args },
      },
      sid,
    );
    if (sessionId) this.sessionId = sessionId;

    const msg = payloads.find((p) => p.id != null) || payloads[0];
    if (!msg) throw new Error(`Epidemic tool ${name}: empty response ${raw.slice(0, 200)}`);
    if (msg.error) {
      throw new Error(`Epidemic tool ${name}: ${JSON.stringify(msg.error).slice(0, 400)}`);
    }
    const result = msg.result as Json | undefined;
    if (!result) throw new Error(`Epidemic tool ${name}: no result`);
    if (result.isError) {
      throw new Error(`Epidemic tool ${name} error: ${JSON.stringify(result).slice(0, 400)}`);
    }

    // Prefer structuredContent
    if (result.structuredContent != null) return result.structuredContent;

    const content = result.content as Array<{ type?: string; text?: string }> | undefined;
    if (Array.isArray(content)) {
      const text = content
        .filter((c) => c?.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    }
    return result;
  }
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function mapRecordingNode(node: any): MusicTrackCandidate | null {
  const rec = node?.recording || node;
  if (!rec?.id) return null;
  const tags = asArray<any>(rec.tags).map((t) => String(t?.displayName || t?.name || t || ""));
  const moodTags = asArray<any>(rec.tags)
    .filter((t) => String(t?.dimension?.name || "").toLowerCase() === "mood")
    .map((t) => String(t.displayName || ""));
  const vocalTags = tags.map((t) => t.toLowerCase());
  const hasVocals =
    vocalTags.some((t) => t.includes("lead vocals") || t === "vocals" || t.includes("sung")) &&
    !vocalTags.some((t) => t.includes("no vocals"));

  const artists = asArray<any>(rec.credits)
    .map((c) => c?.artist?.name)
    .filter(Boolean)
    .map(String);

  return {
    id: String(rec.id),
    provider: "epidemic",
    title: String(rec.title || "Untitled"),
    bpm: typeof rec.bpm === "number" ? rec.bpm : null,
    durationMs: Number(rec.audioFile?.durationInMilliseconds || 0) || 0,
    previewUrl: rec.audioFile?.lqmp3Url || null,
    tags,
    moodTags,
    hasVocals,
    artistNames: artists,
    raw: rec,
  };
}

export class EpidemicMusicProvider implements MusicProvider {
  readonly id = "epidemic" as const;
  private client: EpidemicMcpClient;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    this.client = new EpidemicMcpClient(opts);
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  async search(params: MusicSearchParams): Promise<MusicTrackCandidate[]> {
    const filter: Json = {};
    if (params.minDurationMs != null || params.maxDurationMs != null) {
      filter.duration = {
        ...(params.minDurationMs != null ? { min: params.minDurationMs } : {}),
        ...(params.maxDurationMs != null ? { max: params.maxDurationMs } : {}),
      };
    }
    if (params.minBpm != null || params.maxBpm != null) {
      filter.bpm = {
        ...(params.minBpm != null ? { min: params.minBpm } : {}),
        ...(params.maxBpm != null ? { max: params.maxBpm } : {}),
      };
    }
    if (params.moodSlugs?.length) {
      filter.moodSlugs = { matchType: "ANY", values: params.moodSlugs };
    }
    // Prefer instrumentals via tag when requested
    if (params.preferNoVocals) {
      filter.tagSlugs = { matchType: "ANY", values: ["no-vocals", "instrumental"] };
    }

    const args: Json = {
      query: { term: params.query },
      sort: { by: "RELEVANCE", order: "DESCENDING" },
      first: params.limit ?? 12,
    };
    if (Object.keys(filter).length) args.filter = filter;

    let data: any;
    try {
      data = await this.client.callTool("SearchRecordings", args);
    } catch (err) {
      // Retry without tag filter — slug names vary
      if (params.preferNoVocals && args.filter) {
        const { tagSlugs: _drop, ...rest } = args.filter as Json;
        args.filter = rest;
        data = await this.client.callTool("SearchRecordings", args);
      } else {
        throw err;
      }
    }

    const nodes =
      data?.data?.recordings?.nodes ||
      data?.recordings?.nodes ||
      data?.nodes ||
      [];

    return asArray(nodes)
      .map(mapRecordingNode)
      .filter((c): c is MusicTrackCandidate => Boolean(c));
  }

  async download(trackId: string, destPath: string): Promise<MusicDownloadResult> {
    const data: any = await this.client.callTool("DownloadRecording", {
      id: trackId,
      options: { fileType: "MP3", stemType: "FULL" },
    });
    const assetUrl =
      data?.data?.recordingDownload?.assetUrl ||
      data?.recordingDownload?.assetUrl ||
      data?.assetUrl;
    if (!assetUrl || typeof assetUrl !== "string") {
      throw new Error(`Epidemic download missing assetUrl for ${trackId}`);
    }

    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error(`Epidemic asset download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);

    return {
      localPath: destPath,
      sourceUrl: assetUrl.split("?")[0],
      contentType: res.headers.get("content-type") || "audio/mpeg",
    };
  }
}

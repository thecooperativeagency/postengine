export const IG_USERNAME_RE = /^[a-z0-9._]{1,30}$/;

export type IgUserTag = { username: string };

export class IgFieldError extends Error {
  field: "igCollaborators" | "igUserTags";

  constructor(field: "igCollaborators" | "igUserTags", message: string) {
    super(message);
    this.name = "IgFieldError";
    this.field = field;
  }
}

export function normalizeIgUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

function tokensFromInput(value: unknown, field: "igCollaborators" | "igUserTags"): unknown[] | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          throw new IgFieldError(field, `${field} must be an array of usernames`);
        }
        return parsed;
      } catch (error) {
        if (error instanceof IgFieldError) throw error;
        throw new IgFieldError(field, `${field} must be an array of usernames`);
      }
    }
    return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value;
  throw new IgFieldError(field, `${field} must be an array of usernames`);
}

function usernameFromString(raw: string, field: "igCollaborators" | "igUserTags"): string {
  const username = normalizeIgUsername(raw);
  if (!IG_USERNAME_RE.test(username)) {
    throw new IgFieldError(field, `Invalid Instagram username: ${raw.trim() || username}`);
  }
  return username;
}

export function parseIgCollaborators(value: unknown): string[] | null {
  const tokens = tokensFromInput(value, "igCollaborators");
  if (!tokens || tokens.length === 0) return null;
  const usernames: string[] = [];
  for (const token of tokens) {
    if (typeof token !== "string") {
      throw new IgFieldError("igCollaborators", "igCollaborators must be an array of usernames");
    }
    const username = usernameFromString(token, "igCollaborators");
    if (!usernames.includes(username)) usernames.push(username);
  }
  if (usernames.length > 3) {
    throw new IgFieldError("igCollaborators", "Instagram allows at most 3 collaborators");
  }
  return usernames;
}

export function parseIgUserTags(value: unknown): IgUserTag[] | null {
  const tokens = tokensFromInput(value, "igUserTags");
  if (!tokens || tokens.length === 0) return null;
  const tags: IgUserTag[] = [];
  for (const token of tokens) {
    let raw: string | null = null;
    if (typeof token === "string") {
      raw = token;
    } else if (token && typeof token === "object" && !Array.isArray(token)) {
      const username = (token as { username?: unknown }).username;
      if (typeof username === "string") raw = username;
    }
    if (raw == null) {
      throw new IgFieldError("igUserTags", "igUserTags must be an array of {username}");
    }
    const username = usernameFromString(raw, "igUserTags");
    if (!tags.some((tag) => tag.username === username)) tags.push({ username });
  }
  return tags;
}

export function readIgCollaborators(value: unknown): string[] | null {
  try {
    return parseIgCollaborators(value);
  } catch {
    return null;
  }
}

export function readIgUserTags(value: unknown): IgUserTag[] | null {
  try {
    return parseIgUserTags(value);
  } catch {
    return null;
  }
}

export function formatIgCollaboratorInput(value: unknown): string {
  return readIgCollaborators(value)?.join(", ") ?? "";
}

export function formatIgUserTagInput(value: unknown): string {
  return readIgUserTags(value)?.map((tag) => tag.username).join(", ") ?? "";
}

export function formatIgMentionLine(value: { igCollaborators?: unknown; igUserTags?: unknown }): string {
  const collaborators = readIgCollaborators(value.igCollaborators);
  const tags = readIgUserTags(value.igUserTags);
  const parts: string[] = [];
  if (collaborators?.length) parts.push(`IG collaborators: ${collaborators.join(", ")}`);
  if (tags?.length) parts.push(`IG user tags: ${tags.map((tag) => tag.username).join(", ")}`);
  return parts.join(" · ");
}

/** Replace request fields with JSON text (or null) for the posts columns. */
export function normalizeIgFieldsForStorage(body: Record<string, unknown>): void {
  if ("igCollaborators" in body) {
    const collaborators = parseIgCollaborators(body.igCollaborators);
    body.igCollaborators = collaborators ? JSON.stringify(collaborators) : null;
  }
  if ("igUserTags" in body) {
    const tags = parseIgUserTags(body.igUserTags);
    body.igUserTags = tags ? JSON.stringify(tags) : null;
  }
}

export function presentIgFields<T extends object>(post: T): T & {
  igCollaborators: string[] | null;
  igUserTags: IgUserTag[] | null;
} {
  const source = post as T & { igCollaborators?: unknown; igUserTags?: unknown };
  return {
    ...post,
    igCollaborators: readIgCollaborators(source.igCollaborators),
    igUserTags: readIgUserTags(source.igUserTags),
  };
}

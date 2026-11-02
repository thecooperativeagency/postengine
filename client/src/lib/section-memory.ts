/** Remembers which shrink-sections a manager left open. Closed unless saved open. */

export const SECTION_MEMORY_PREFIX = "pe-sections:";
export const DASHBOARD_USER_KEY = "engine-dashboard-user";
export const DASHBOARD_USER_EVENT = "engine-user-changed";

export function sectionMemoryKey(user: string): string {
  const name = user.trim() || "owner";
  return `${SECTION_MEMORY_PREFIX}${name}`;
}

export function readSectionOpen(raw: string | null, sectionId: string): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed[sectionId] === true;
  } catch {
    return false;
  }
}

export function writeSectionOpen(raw: string | null, sectionId: string, open: boolean): string {
  let parsed: Record<string, boolean> = {};
  if (raw) {
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (value && typeof value === "object") {
        parsed = Object.fromEntries(
          Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
        );
      }
    } catch {
      parsed = {};
    }
  }
  if (open) parsed[sectionId] = true;
  else delete parsed[sectionId];
  return JSON.stringify(parsed);
}

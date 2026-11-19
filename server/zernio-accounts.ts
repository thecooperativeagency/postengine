import fs from "fs";
import path from "path";

const DEALERSHIP_KEYS: Record<number, string> = {
  1: "bmw_jackson",
  2: "brian_harris_bmw",
  3: "audi_baton_rouge",
  4: "harris_porsche",
  5: "opencraw",
  6: "cooperative_agency",
};

export type ZernioPlatformFlags = {
  instagram: boolean;
  facebook: boolean;
  googlebusiness: boolean;
  tiktok: boolean;
};

type AccountsFile = {
  accounts?: Record<string, Record<string, unknown>>;
  tiktok_defaults?: Record<string, unknown>;
};

export function zernioAccountsPath(): string {
  const fromEnv = process.env.ZERNIO_ACCOUNTS_PATH?.trim();
  if (!fromEnv) return path.join(process.cwd(), ".zernio-accounts.json");
  return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
}

export function getDealershipKey(dealershipId: number): string {
  return DEALERSHIP_KEYS[dealershipId] || "";
}

function readAccountsFile(): AccountsFile {
  try {
    const raw = fs.readFileSync(zernioAccountsPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as AccountsFile : {};
  } catch {
    return {};
  }
}

export function getAccountMap(): Record<string, Record<string, string>> {
  const accounts = readAccountsFile().accounts || {};
  const map: Record<string, Record<string, string>> = {};
  for (const [store, platforms] of Object.entries(accounts)) {
    map[store] = {};
    if (!platforms || typeof platforms !== "object") continue;
    for (const [platform, id] of Object.entries(platforms)) {
      if (typeof id === "string" && id.trim()) map[store][platform] = id.trim();
    }
  }
  return map;
}

export function accountIdFor(dealershipId: number, platform: string): string {
  const key = getDealershipKey(dealershipId);
  if (!key) return "";
  return getAccountMap()[key]?.[platform] || "";
}

export function storeTikTokDefaults(dealershipId: number): unknown {
  const key = getDealershipKey(dealershipId);
  if (!key) return null;
  return readAccountsFile().tiktok_defaults?.[key] ?? null;
}

export function zernioMappingStatus(): Record<string, ZernioPlatformFlags> {
  const accounts = getAccountMap();
  const status: Record<string, ZernioPlatformFlags> = {};
  for (const [id, key] of Object.entries(DEALERSHIP_KEYS)) {
    const row = accounts[key] || {};
    status[id] = {
      instagram: Boolean(row.instagram),
      facebook: Boolean(row.facebook),
      googlebusiness: Boolean(row.googlebusiness),
      tiktok: Boolean(row.tiktok),
    };
  }
  return status;
}
